'use strict';

const STORE_KEY = 'hayabusaScienceV1';
const APP_VERSION = 1;

const QUESTIONS = window.HAYABUSA_SCIENCE_QUESTIONS || [];

const modeConfig = {
  alpha: {label:'α1ルート',count:5,time:null},
  review: {label:'SAPIX復習',count:5,time:null},
  oral: {label:'理科口頭試問',count:3,time:null,free:true},
  knowledge: {label:'知識・原理',count:6,time:null,skills:['知識','原理']},
  experiment: {label:'実験・観察',count:6,time:null,skills:['実験']},
  data: {label:'表・グラフ',count:6,time:null,skills:['資料']},
  transfer: {label:'初見考察',count:6,time:null,skills:['考察'],minLevel:3},
  tsukukoma: {label:'筑駒40分',count:12,time:40*60,schoolScore:100},
  kaisei: {label:'開成40分',count:10,time:40*60,schoolScore:70},
  noai: {label:'AI禁止テスト',count:8,time:null,noAI:true},
  weekly: {label:'今週の重点',count:7,time:null}
};

let state = loadState();
let session = null;
let deferredPrompt = null;
let timerHandle = null;

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

function defaultState(){
  return {version:APP_VERSION, answered:0, correct:0, explained:0, sessions:0, streak:0, lastStudy:null, history:{}, causes:{knowledge:0,principle:0,reading:0,strategy:0,calc:0,careless:0}, daily:{date:null,count:0}, sapixSections:[]};
}
function loadState(){
  try { return {...defaultState(), ...(JSON.parse(localStorage.getItem(STORE_KEY)) || {})}; }
  catch { return defaultState(); }
}
function saveState(){ localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
function todayKey(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function dayDiff(a,b){
  const [ay,am,ad]=a.split('-').map(Number), [by,bm,bd]=b.split('-').map(Number);
  return Math.round((new Date(by,bm-1,bd)-new Date(ay,am-1,ad))/86400000);
}
function updateStreakOnStudy(){
  const t=todayKey();
  if (!state.lastStudy) state.streak=1;
  else if (state.lastStudy===t) return;
  else state.streak = dayDiff(state.lastStudy,t)===1 ? state.streak+1 : 1;
  state.lastStudy=t;
}
function normalizeDaily(){
  const t=todayKey();
  if(state.daily?.date!==t) state.daily={date:t,count:0};
}
function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function sample(arr,n){ return shuffle(arr).slice(0,Math.min(n,arr.length)); }
function uniqById(arr){ const seen=new Set(); return arr.filter(q=>!seen.has(q.id)&&seen.add(q.id)); }

function dueQuestions(){
  const now=Date.now();
  return QUESTIONS.filter(q=>{
    const h=state.history[q.id];
    return h && h.dueAt && h.dueAt<=now;
  });
}
function weakDomains(){
  const domains=['生物','地学','物理','化学'];
  return domains.map(domain=>({domain, mastery:domainMastery(domain)})).sort((a,b)=>a.mastery-b.mastery);
}
function domainMastery(domain){
  const qs=QUESTIONS.filter(q=>q.domain===domain);
  const attempted=qs.filter(q=>state.history[q.id]?.attempts>0);
  if(!attempted.length) return 0;
  const points=attempted.reduce((sum,q)=>{
    const h=state.history[q.id];
    const acc=h.correct/Math.max(1,h.attempts);
    const exp=h.explained/Math.max(1,h.attempts);
    return sum + (acc*0.7+Math.min(1,exp)*0.3);
  },0);
  return Math.round(points/attempted.length*100);
}
function readiness(){
  if(state.answered<5) return 0;
  const acc=state.correct/Math.max(1,state.answered);
  const exp=state.explained/Math.max(1,state.answered);
  const advancedIds=Object.keys(state.history).filter(id=>QUESTIONS.find(q=>q.id===id)?.level>=3);
  let adv=.4;
  if(advancedIds.length){
    const a=advancedIds.reduce((s,id)=>{const h=state.history[id]; return s+h.correct/Math.max(1,h.attempts);},0)/advancedIds.length;
    adv=a;
  }
  const due=dueQuestions().length;
  const reviewFactor=Math.max(0,1-Math.min(1,due/10));
  return Math.round(Math.min(100,(acc*.45+exp*.25+adv*.20+reviewFactor*.10)*100));
}
const WEEKLY_CANDIDATES = [
  {topic:'星の動き', base:3.0, label:'星の動き'},
  {topic:'花のつくりと分類', base:2.7, label:'花のつくり・分類'},
  {topic:'小問集合', base:1.6, label:'小問集合'},
  {topic:'水溶液', base:0.5, label:'水溶液'},
  {topic:'植物', base:0.45, label:'植物'},
  {topic:'ばねとてこ', base:0.45, label:'ばね・てこ'},
  {topic:'動物の分類と食物連鎖', base:0.35, label:'動物・食物連鎖'},
  {topic:'燃焼と気体', base:0.5, label:'燃焼・気体'}
];
const TOPIC_QUESTION_IDS = {
  '水溶液':['c404','c405','c406','c407','x505'],
  '植物':['b403','b404','b405','b406','b409','x504','x507'],
  'ばねとてこ':['p407','p408','x501'],
  '動物の分類と食物連鎖':['b401','b402','b407','b408','b410']
};

function topicQuestionPool(topic){
  const ids=TOPIC_QUESTION_IDS[topic]||[];
  return QUESTIONS.filter(q=>q.topic===topic || ids.includes(q.id));
}
function topicMastery(topic){
  const qs=topicQuestionPool(topic);
  const attempted=qs.filter(q=>state.history[q.id]?.attempts>0);
  if(!attempted.length) return 0;
  const points=attempted.reduce((sum,q)=>{
    const h=state.history[q.id];
    const acc=h.correct/Math.max(1,h.attempts);
    const exp=h.explained/Math.max(1,h.attempts);
    return sum + acc*0.72 + Math.min(1,exp)*0.28;
  },0);
  return Math.round(points/attempted.length*100);
}
function sapixSignal(topic){
  const records=(state.sapixSections||[]).filter(r=>r.topic===topic && Number(r.max)>0)
    .sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,3);
  if(!records.length) return {boost:0,lastRate:null,count:0};
  let boost=0;
  records.forEach((r,i)=>{
    const rate=Number(r.score)/Number(r.max)*100;
    const weight=i===0?1:(i===1?.65:.4);
    boost += Math.max(0,(75-rate)/18)*weight;
    if(r.average!==null && r.average!=='' && Number.isFinite(Number(r.average))){
      const avgRate=Number(r.average)/Number(r.max)*100;
      boost += Math.max(0,(avgRate-rate)/15)*weight;
    }
  });
  const last=records[0];
  return {boost,lastRate:Math.round(Number(last.score)/Number(last.max)*100),count:records.length};
}
function weeklyFocus(){
  return WEEKLY_CANDIDATES.map(p=>{
    const qs=topicQuestionPool(p.topic);
    const attempted=qs.filter(q=>state.history[q.id]?.attempts>0).length;
    const mastery=topicMastery(p.topic);
    const due=qs.filter(q=>{const h=state.history[q.id]; return h?.dueAt && h.dueAt<=Date.now();}).length;
    const signal=sapixSignal(p.topic);
    let priority=p.base + (100-mastery)/65 + due*0.5 + signal.boost;
    if(attempted>=6 && mastery>=85) priority-=2.2;
    if(attempted>=8 && mastery>=92) priority-=1.2;
    return {...p,mastery,attempted,due,priority,sapixRate:signal.lastRate,sapixCount:signal.count};
  }).filter(p=>topicQuestionPool(p.topic).length>0).sort((a,b)=>b.priority-a.priority);
}
function weeklyPriorityQuestions(count){
  const focus=weeklyFocus().slice(0,3);
  const picks=[];
  let round=0;
  while(picks.length<count && round<10){
    for(const f of focus){
      const pool=topicQuestionPool(f.topic).filter(q=>q.grade<=4 && q.type==='choice' && !picks.some(x=>x.id===q.id));
      const unattempted=pool.filter(q=>!state.history[q.id]?.attempts);
      const due=pool.filter(q=>state.history[q.id]?.dueAt && state.history[q.id].dueAt<=Date.now());
      const pick=sample(due.length?due:(unattempted.length?unattempted:pool),1)[0];
      if(pick) picks.push(pick);
      if(picks.length>=count) break;
    }
    round++;
  }
  return picks;
}
function readinessText(score){
  if(state.answered<5) return 'まず5問解くと現在地が見えてきます。';
  if(score<55) return '基礎の取りこぼしを先に減らそう。難問より再現性を優先。';
  if(score<70) return '基礎は育っています。理由説明と資料問題を増やす段階。';
  if(score<85) return 'α1を狙う土台が整いつつあります。再テスト成功率を上げよう。';
  return '高い水準です。初見考察でも根拠を言葉にできるか確認しよう。';
}

function selectQuestions(mode, domain=null){
  const cfg=modeConfig[mode] || modeConfig.alpha;
  let pool=QUESTIONS.filter(q=>q.type==='choice');
  if(domain) pool=pool.filter(q=>q.domain===domain);
  if(cfg.free) return sample(QUESTIONS.filter(q=>q.type==='free' && (!domain||q.domain===domain)),cfg.count);
  if(cfg.skills) pool=pool.filter(q=>cfg.skills.includes(q.skill));
  if(cfg.minLevel) pool=pool.filter(q=>q.level>=cfg.minLevel);

  if(mode==='alpha'){
    const due=sample(dueQuestions().filter(q=>q.grade<=4 && q.type==='choice'),1);
    const focusPick=weeklyPriorityQuestions(2);
    const core=sample(pool.filter(q=>q.grade<=4 && q.level<=2 && (!state.history[q.id] || state.history[q.id].attempts<2)),1);
    const reason=sample(pool.filter(q=>q.grade<=4 && q.level>=3 && ['資料','考察','実験'].includes(q.skill)),1);
    const combined=uniqById([...due,...focusPick,...core,...reason]);
    return uniqById([...combined,...sample(pool.filter(q=>q.grade<=4),cfg.count)]).slice(0,cfg.count);
  }
  if(mode==='weekly'){
    const due=sample(dueQuestions().filter(q=>q.grade<=4 && q.type==='choice'),2);
    return uniqById([...due,...weeklyPriorityQuestions(cfg.count),...sample(pool.filter(q=>q.grade<=4),cfg.count)]).slice(0,cfg.count);
  }
  if(mode==='review'){
    return uniqById([...weeklyPriorityQuestions(3),...sample(pool.filter(q=>q.grade<=4 && q.level<=3),cfg.count)]).slice(0,cfg.count);
  }
  if(mode==='tsukukoma' || mode==='kaisei'){
    const adv=pool.filter(q=>q.level>=3);
    return uniqById([...sample(adv,Math.ceil(cfg.count*.7)),...sample(pool,cfg.count)]).slice(0,cfg.count);
  }
  if(mode==='noai'){
    const due=dueQuestions().filter(q=>q.type==='choice');
    return uniqById([...sample(due,cfg.count),...sample(pool.filter(q=>q.level>=2),cfg.count)]).slice(0,cfg.count);
  }
  return sample(pool,cfg.count);
}

