import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const ctx=vm.createContext({structuredClone,localStorage:{getItem:()=>null},navigator:{}});ctx.window=ctx;
for(const name of ['problems.js','problem_engine.js','all_problems.js','curriculum.js','adaptive-quality.js'])vm.runInContext(fs.readFileSync('.local-runtime/'+name,'utf8'),ctx);
const source=fs.readFileSync('.local-runtime/app.js','utf8').replace(/\r\n/g,'\n');
const tail='  render();\n})();';assert(source.includes(tail));
vm.runInContext(source.replace(tail,'  window.testAccess={state,homeView,recommended,homeRecommendations,adaptiveScore};\n})();'),ctx);
const {state,homeView,recommended,homeRecommendations,adaptiveScore}=ctx.testAccess;
const tests=[];const test=(name,fn)=>{fn();tests.push({name,pass:true});};
const ids=xs=>Array.from(xs,p=>p.id);
const details=xs=>Array.from(xs,p=>({id:p.id,family:p.family,familyName:p.familyName,title:p.title,score:adaptiveScore(p)}));
const before=details(recommended(4)),after=details(homeRecommendations(4));
test('default duplicates are distinct generated items',()=>{assert.equal(new Set(before.map(p=>p.id)).size,4);assert.equal(new Set(before.map(p=>p.title)).size,1);assert.equal(new Set(recommended(4).map(p=>p.prompt)).size,4);});
test('default home has four distinct families and titles',()=>{assert.equal(new Set(after.map(p=>p.family)).size,4);assert.equal(new Set(after.map(p=>p.title)).size,4);assert.equal(after[0].id,before[0].id);});
const html=homeView();
test('actual rendered home uses diversified set',()=>{assert.deepEqual([...html.matchAll(/data-open-problem="([^"]+)"/g)].map(m=>m[1]),after.map(p=>p.id));assert.equal(new Set([...html.matchAll(/class="reco-title">([^<]+)</g)].map(m=>m[1])).size,4);});
const template=ctx.PROBLEMS[0];
const item=(id,family,title)=>({...template,id,family,familyName:family,title});
const pool=[item('a','X','same'),item('b','X','same'),item('c','X','other'),item('d','Y','same'),item('e','Z','third')];
test('family then title then score fallback is deterministic',()=>{assert.deepEqual(ids(homeRecommendations(5,pool)),['a','e','d','c','b']);assert.deepEqual(ids(homeRecommendations(5,[...pool].reverse())),['a','e','d','c','b']);});
test('same family prefers distinct title',()=>assert.deepEqual(ids(homeRecommendations(3,pool.slice(0,3))),['a','c','b']));
test('homogeneous pool fills by score without repeats',()=>{const same=pool.map(p=>({...p,family:'X',title:'same'}));assert.deepEqual(ids(homeRecommendations(4,same)),ids(recommended(4,same)));});
test('empty and short pools',()=>{assert.equal(homeRecommendations(4,[]).length,0);assert.deepEqual(ids(homeRecommendations(4,pool.slice(0,2))),['a','b']);assert.equal(homeRecommendations(0,pool).length,0);});
test('due boundary and overdue displace variety, future does not',()=>{
  const realNow=vm.runInContext('Date.now',ctx);vm.runInContext('Date.now=()=>1800000000000',ctx);
  try {state.stats.b={nextReview:new Date(1800000000000).toISOString()};state.stats.c={nextReview:'2020-01-01'};state.stats.a={nextReview:'2099-01-01'};
    assert.deepEqual(ids(homeRecommendations(2,pool)),ids(recommended(5,pool)).filter(id=>id==='b'||id==='c'));
    assert.deepEqual(ids(homeRecommendations(4,pool)).slice(0,2),ids(homeRecommendations(2,pool)));
  } finally {ctx.savedNow=realNow;vm.runInContext('Date.now=savedNow',ctx);state.stats={};}
});
test('more than four same-family urgent reviews keep score priority',()=>{
  const urgent=pool.map(p=>({...p,family:'X',title:'same'}));
  try {urgent.forEach(p=>state.stats[p.id]={nextReview:'2020-01-01'});assert.deepEqual(ids(homeRecommendations(4,urgent)),ids(recommended(4,urgent)));}
  finally {state.stats={};}
});
test('low-score urgent review cannot be hidden by higher scores',()=>{
  const low={...pool[0],id:'urgent-low',level:5,track:'olympiad',tags:[]};
  try {state.stats[low.id]={attempts:10,correct:10,solved:true,explained:true,noHintCorrect:10,reviewStage:2,nextReview:'2020-01-01'};
    assert(adaptiveScore(low)<adaptiveScore(ctx.PROBLEMS.find(p=>p.id==='GS01-01')));
    assert.equal(homeRecommendations(4,[...ctx.PROBLEMS,low])[0].id,low.id);
  } finally {state.stats={};}
});
test('general recommendation remains original score order',()=>assert.deepEqual(details(recommended(4)),before));
fs.writeFileSync('docs/20260922_math_home_diversity_rendered.html',html);
fs.writeFileSync('docs/20260922_math_home_diversity_result.json',JSON.stringify({passed:tests.length,total:tests.length,before,after,tests,validation:'Actual runtime VM rendering; not browser visual QA'},null,2)+'\n');
console.log(JSON.stringify({passed:tests.length,total:tests.length,before,after},null,2));
