import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const ctx={window:{}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('japanese/data.js','utf8'),ctx);
const d=ctx.window.KOKUGO_DATA;
assert(d,'KOKUGO_DATA missing');
const q=d.questions||[];
assert.equal(q.length,180,'question count');
assert.equal(new Set(q.map(x=>x.id)).size,180,'duplicate ids');
assert.equal(d.passages.length,12,'passage count');
assert.equal(d.curriculum.length,52,'curriculum weeks');

const promptCounts=new Map();
for(const x of q)promptCounts.set(x.prompt,(promptCounts.get(x.prompt)||0)+1);
assert.equal([...promptCounts.values()].filter(n=>n>1).length,0,'duplicate prompts');

const mcq=q.filter(x=>x.kind==='mcq');
for(const x of mcq){
  assert.equal(x.choices?.length,4,'choice count '+x.id);
  assert.equal(new Set(x.choices).size,4,'duplicate choice '+x.id);
  assert(Number.isInteger(x.answer)&&x.answer>=0&&x.answer<4,'answer index '+x.id);
}
const short=q.filter(x=>x.kind==='short');
assert.equal(short.length,36,'short question count');
for(const x of short){
  assert(x.rubric?.length>=2,'rubric '+x.id);
  assert(x.sample,'sample '+x.id);
  assert(x.maxChars>=40&&x.maxChars<=70,'maxChars '+x.id);
  assert([...x.sample].length<=x.maxChars,'sample exceeds maxChars '+x.id);
}
const answerDistribution=[0,0,0,0];
for(const x of mcq)answerDistribution[x.answer]++;
assert.deepEqual(answerDistribution,[36,36,36,36],'answer position balance');
assert.equal(q.filter(x=>x.id.startsWith('K')).length,72,'knowledge count');
assert.equal(q.filter(x=>x.id.startsWith('M')).length,36,'micro count');
assert.equal(q.filter(x=>x.passageId).length,72,'long reading count');

const html=fs.readFileSync('japanese/index.html','utf8');
const sw=fs.readFileSync('japanese/sw.js','utf8');
const app=fs.readFileSync('japanese/app.js','utf8');
assert(/noindex/.test(html),'noindex missing');
for(const f of ['./index.html','./styles.css','./data.js','./app.js','./manifest.webmanifest','./assets/icon.svg'])assert(sw.includes(f),'SW missing '+f);
assert(app.includes("const KEY='kokugoLabV1'"),'storage key');
assert(app.includes("mode==='tsukukoma'"),'tsukukoma mode');
assert(app.includes('40*60*1000'),'40 minute timer');
assert(app.includes('AI判定なし'),'no-AI grading label');
assert(app.includes("data-mode=\"noai\"")||app.includes("modeCard('AIなし記述5問'"),'no-AI mode');
console.log(JSON.stringify({status:'PASS',total:q.length,mcq:mcq.length,short:short.length,passages:d.passages.length,weeks:d.curriculum.length},null,2));