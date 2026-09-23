import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const aq=fs.readFileSync('adaptive-quality.js','utf8');
const src=fs.readFileSync('improvement-loop.js','utf8');
const ctx=vm.createContext({});vm.runInContext(aq,ctx);vm.runInContext(src,ctx);const E=ctx.ImprovementLoop;
const date='2026-09-23', recent='2026-09-22T12:00:00', old='2026-09-10T12:00:00';
const tests=[];function test(name,fn){fn();tests.push(name);}
const input={
 math:{studyLog:[
  {type:'answer',id:'M-SECRET',at:recent,correct:false,seconds:420},
  {type:'answer',id:'M-SECRET',at:recent,correct:false,seconds:390},
  {type:'answer',id:'M-2',at:recent,correct:true,seconds:80}],stats:{x:{nextReview:old}}},
 japanese:{attempts:[
  {qid:'J-SECRET',created:recent,success:false,seconds:420},{qid:'J-SECRET',created:recent,success:false,seconds:400},
  {qid:'J2',created:recent,success:true,seconds:90},{qid:'J3',created:recent,success:true,seconds:100},{qid:'J4',created:recent,success:true,seconds:95}]},
 science:{attemptLog:[{qid:'S-SECRET',at:recent,correct:false,seconds:250},{qid:'S-SECRET',at:recent,correct:true,seconds:120},{qid:'S-OLD',at:'2026-08-01T12:00:00',correct:false,seconds:999}],history:{S:{attempts:5,wrong:2,correct:3,lastAt:new Date(recent).getTime(),dueAt:new Date(old).getTime(),totalSeconds:1000}}},
 social:{attempts:[]},
 parent:{sapixAnalyses:[{date,name:'T',mathQuestions:[{id:'RAW-QID',rate:80,correct:false}]}],recoveryRecords:[]}
};
const report=E.analyze(input,date);
test('all four subjects summarized',()=>assert.deepEqual(Object.keys(report.subjects).sort(),['japanese','math','science','social']));
test('recoverable loss is first',()=>assert.equal(report.candidates[0].type,'recoverable'));
test('repeat signal detected even when top-three is fuller',()=>assert(report.subjects.math.repeated14>0&&report.subjects.japanese.repeated14>0));
test('timing captured',()=>assert(report.subjects.japanese.timingCount>=4&&report.subjects.math.avgSeconds>0));
test('science uses exact timestamped attempt log when present',()=>{assert.equal(report.subjects.science.attempts14,2);assert.equal(report.subjects.science.timingCount,2);});
test('max three candidates',()=>assert(report.candidates.length<=3));
test('deterministic analysis',()=>assert.equal(JSON.stringify(E.analyze(input,date)),JSON.stringify(E.analyze(input,date))));
const capsule=E.capsule(report), capsuleText=JSON.stringify(capsule);
test('capsule excludes raw question ids and answers',()=>{assert(!/M-SECRET|J-SECRET|RAW-QID/.test(capsuleText));assert(!/"answer"|"qid"|"profile"/.test(capsuleText));});
test('child-pressure strings excluded',()=>assert(!/筑駒|開成|偏差値/.test(JSON.stringify(report.candidates))));
test('validation pass',()=>assert.equal(report.validation.errors.length,0));
const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};
for(const [k,v] of Object.entries(ctx.AdaptiveQuality.keys)){if(k!=='parent')storage.setItem(v,JSON.stringify(input[k]||{}));}
storage.setItem(ctx.AdaptiveQuality.keys.parent,JSON.stringify(input.parent));
const current=E.current(storage,date);E.current(storage,date);
test('daily aggregate idempotent',()=>assert.equal(JSON.parse(map.get(E.KEY)).days.length,1));
test('stored snapshot excludes raw ids',()=>assert(!/M-SECRET|J-SECRET|RAW-QID/.test(map.get(E.KEY))));
test('parent HTML exposes safe loop and exports',()=>{const h=E.parentHTML();assert(h.includes('4科 自動改善ループ'));assert(h.includes('pdImprovementCapsule'));assert(h.includes('自動適用・自動公開はしません'));});
const ready=E.codexReadyText(current);
test('Codex READY is v33-evaluable and no auto publish',()=>{assert(ready.includes('four-subject-improvement-capsule-v1'));assert(ready.includes('AI_EVAL_OPS_EVALUATOR_REQUEST'));assert(ready.includes('AI_EVAL_OPS_EVIDENCE_RESULT'));assert(ready.includes('Do not commit, push, deploy'));assert(!/M-SECRET|J-SECRET|RAW-QID/.test(ready));});
test('Codex READY content and task id are deterministic for same snapshot',()=>assert.equal(ready,E.codexReadyText(current)));
test('engine has no network dependency',()=>assert(!/fetch\(|XMLHttpRequest|WebSocket|sendBeacon/.test(src)));
test('dashboard integration wired',()=>assert(fs.readFileSync('parent-dashboard.js','utf8').includes('ImprovementLoop.parentHTML()')));
test('all three added subject timers wired',()=>{assert(fs.readFileSync('japanese/app.js','utf8').includes('questionStartedAt'));assert(fs.readFileSync('social/app.js','utf8').includes('qStartedAt'));assert(fs.readFileSync('science/app-results.js','utf8').includes('totalSeconds'));});
console.log(`PASS ${tests.length}/${tests.length}`);
