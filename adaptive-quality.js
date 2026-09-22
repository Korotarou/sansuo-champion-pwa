/* Local deterministic policy v1. Reads histories; writes only aggregate snapshots. */
(function(root){
  'use strict';
  const DAY=86400000, KEY='four_subject_quality_v1';
  const keys={math:'sansuo_champion_state_v2',japanese:'kokugoLabV1',science:'hayabusaScienceV1',social:'socialLabV2',parent:'sansuo_parent_dashboard_v1'};
  const names={math:'算数',japanese:'国語',science:'理科',social:'社会'};
  const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
  const rows=x=>Array.isArray(x)?x.filter(v=>v&&typeof v==='object'):[];
  const num=x=>Number.isFinite(Number(x))?Math.max(0,Number(x)):0;
  const time=x=>x==null?NaN:new Date(x).getTime();
  const day=(d=new Date())=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  function read(storage,key){try{return obj(JSON.parse(storage.getItem(key)));}catch(_){return {};}}
  function load(storage){const out={};for(const id of Object.keys(keys))out[id]=read(storage,keys[id]);if(!Object.keys(out.math).length)out.math=read(storage,'sansuo_champion_state_v1');return out;}
  function plan(input,date=day()){
    input=obj(input);
    const start=time(date+'T00:00:00'), end=start+DAY, recent=start-13*DAY;
    if(!Number.isFinite(start))throw new Error('Valid local date required');
    const items=Object.keys(names).map((id,order)=>{
      const s=obj(input[id]); let events=[],reviews=[], aggregates=[],last=NaN;
      if(id==='math'){
        events=rows(s.studyLog).filter(e=>e.type==='answer').map(e=>({id:e.id,at:e.at,ok:e.correct,hint:e.independent===false}));
        reviews=Object.values(obj(s.stats)).map(obj).map(h=>({due:h.nextReview}));
      }else if(id==='science'){
        aggregates=Object.entries(obj(s.history)).map(([qid,h])=>({id:qid,...obj(h)}));
        reviews=aggregates.map(h=>({due:h.dueAt}));
        last=time(s.lastStudy);
      }else{
        events=rows(s.attempts).map(e=>({id:e.qid,at:e.created,ok:id==='japanese'?e.success:e.correct,hint:e.hint===true}));
        reviews=rows(s.reviews);
      }
      events=events.filter(e=>typeof e.ok==='boolean'&&Number.isFinite(time(e.at))&&time(e.at)<end);
      for(const e of events)if(!Number.isFinite(last)||time(e.at)>last)last=time(e.at);
      for(const h of aggregates)if(time(h.lastAt)<end&&(!Number.isFinite(last)||time(h.lastAt)>last))last=time(h.lastAt);
      const active=events.filter(e=>time(e.at)>=recent);
      const misses=new Map();active.filter(e=>!e.ok).forEach(e=>{if(typeof e.id==='string')misses.set(e.id,(misses.get(e.id)||0)+1);});
      let repeated=[...misses.values()].reduce((n,v)=>n+Math.max(0,v-1),0);
      let attempts=active.length,correct=active.filter(e=>e.ok&&!e.hint).length;
      if(id==='science')for(const h of aggregates.filter(h=>time(h.lastAt)>=recent&&time(h.lastAt)<end)){
        attempts+=num(h.attempts);correct+=Math.min(num(h.correct),num(h.attempts));repeated+=Math.max(0,Math.min(num(h.wrong),num(h.attempts))-1);
      }
      const due=reviews.filter(r=>!r.done&&time(r.due)<end).length;
      const overdue=reviews.filter(r=>!r.done&&time(r.due)<start).length;
      const neglect=Number.isFinite(last)?Math.max(0,Math.floor((start-last)/DAY)):null;
      const parent=obj(input.parent);
      let recoverable=0;
      if(id==='math'){
        const graduated=new Set(rows(parent.recoveryRecords).filter(r=>r.status==='graduated').map(r=>r.id));
        const ids=new Set();
        rows(parent.sapixAnalyses).filter(a=>time(a.date)>=start-90*DAY&&time(a.date)<end).forEach(a=>rows(a.mathQuestions).forEach(q=>{
          const key=String(a.date||'')+'|'+String(a.name||'')+'|'+String(q.id||'');
          if(q.correct===false&&num(q.rate)>=70&&!graduated.has(key))ids.add(key);
        }));recoverable=ids.size;
      }
      const mastery=attempts>=8&&correct/attempts>=0.85&&repeated===0;
      const score=Math.max(0,Math.min(6,Math.min(3,due*.75)+Math.min(2,repeated*.65)+(attempts>correct?.2:0)+Math.min(2,recoverable)+(neglect!==null&&neglect>=4?Math.min(1.5,neglect/7):0)-(mastery?1:0)));
      const target=mastery&&score===0?3:Math.min(6,4+Math.floor(score/2));
      const done=id==='science'?(obj(s.daily).date===date?num(obj(s.daily).count):0):new Set(events.filter(e=>time(e.at)>=start).map(e=>e.id)).size;
      const action=due?'復習メニューから、まず1問':recoverable?'前のテストの見直しを1問':repeated?'前にまちがえた問題を1問':neglect>=4?'ひさしぶりの1問から始めよう':'今日の問題を1問ずつ';
      return {id,name:names[id],order,score,target,done,due,remaining:Math.max(0,target-done),normal:'今日の'+target+'問',actionHint:action,
        evidence:{attempts,correct,repeated,overdue,due,neglect,recoverable,mastery,aggregate:id==='science'}};
    }).sort((a,b)=>b.score-a.score||a.order-b.order);
    return {version:1,date,items};
  }
  function snapshot(p){return {date:p.date,version:1,subjects:Object.fromEntries(p.items.map(x=>[x.id,{repeated:x.evidence.repeated,overdue:x.evidence.overdue,completion:Math.min(1,x.done/x.target),neglect:x.evidence.neglect}]))};}
  function capture(storage,p){
    // Explicit allowlist; never copy answers, names, test names or question IDs.
    const previous=rows(read(storage,KEY).days).filter(x=>x.version===1&&/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&x.date<p.date&&time(x.date)>=time(p.date)-27*DAY).map(x=>({date:x.date,version:1,subjects:Object.fromEntries(Object.keys(names).map(id=>{const s=obj(obj(x.subjects)[id]);return [id,{repeated:num(s.repeated),overdue:num(s.overdue),completion:Math.min(1,num(s.completion)),neglect:s.neglect==null?null:num(s.neglect)}];}))}));
    const days=[...new Map(previous.map(x=>[x.date,x])).values(),snapshot(p)].sort((a,b)=>a.date.localeCompare(b.date)).slice(-28);
    try{storage.setItem(KEY,JSON.stringify({version:1,days}));}catch(_){}
    return days;
  }
  function current(math){let storage;try{storage=root.localStorage;}catch(_){}const input=load(storage);if(math)input.math=math;const p=plan(input);capture(storage,p);return p;}
  function compare(days,date){
    const start=time(date), metrics=['repeated','overdue','completion','neglect'];
    function period(lo,hi){const xs=rows(days).filter(x=>time(x.date)>=start-lo*DAY&&time(x.date)<=start-hi*DAY);const result={observations:xs.length};for(const m of metrics){const vals=xs.flatMap(x=>Object.values(obj(x.subjects)).map(s=>obj(s)[m])).filter(v=>typeof v==='number'&&Number.isFinite(v));result[m]=vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*100)/100:null;}return result;}
    return {recent:period(6,0),previous:period(13,7)};
  }
  function parentHTML(){
    const p=current();let storage;try{storage=root.localStorage;}catch(_){}const c=compare(read(storage,KEY).days,p.date);
    const lines=p.items.map(x=>{const e=x.evidence;return '<p><b>'+x.name+'：'+x.target+'問</b> ／ 優先値 '+x.score.toFixed(2)+' ／ 期限 '+e.due+'（超過 '+e.overdue+'）・反復ミス '+e.repeated+'・正解 '+e.correct+'/'+e.attempts+'・空白日 '+(e.neglect===null?'記録なし':e.neglect)+'・正答率70%以上の未卒業失点 '+e.recoverable+'</p>';}).join('');
    const labels={repeated:'反復ミス負担',overdue:'期限超過',completion:'科目別達成率',neglect:'空白日'};
    const trend=Object.keys(labels).map(k=>labels[k]+' '+(c.previous[k]??'未観測')+' → '+(c.recent[k]??'未観測')).join(' ／ ');
    return '<section class="pd-panel"><h3>4科の配分と改善の観測</h3>'+lines+'<p>前7日 → 直近7日（観測日 '+c.previous.observations+' → '+c.recent.observations+'）：'+trend+'</p><p>回答履歴は直近14日。理科のみ、直近14日に触れた問題の累計であり、期間内の誤答数ではありません。テスト失点は90日以内。各科3〜6問。期限・反復・未卒業失点・空白日を加点し、8回答以上で85%以上の自力正解なら追加配分を抑えます。配分は履歴に応じて更新されます。</p><p>1日1件、最大28日分の集計のみ端末保存。未訪問日は欠測です。比較は科目・観測日平均で、方針の因果効果や成績向上の証明ではありません。達成率はその日の配分に対する着手問題数（理科は回答数）です。</p></section>';
  }
  root.AdaptiveQuality={plan,load,current,snapshot,capture,compare,parentHTML,keys,KEY};
})(typeof window==='undefined'?globalThis:window);
