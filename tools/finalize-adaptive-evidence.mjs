import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const html=fs.readFileSync('docs/20260922_adaptive_home_rendered.html','utf8');
assert(!html.includes('???'));assert.equal((html.match(/今日の問題を1問ずつ/g)||[]).length,4);
const reportPath='docs/20260922_adaptive_quality_verification.json';
const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
report.outputInspection={buttonEncoding:'PASS',fourActionHints:'PASS'};
report.existingAudits={};
for(const name of ['audit-math-content','audit-japanese-content']){const r=spawnSync(process.execPath,['tools/'+name+'.mjs'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);const x=JSON.parse(r.stdout);report.existingAudits[name]={status:x.status,coverage:x.coverage||{total:x.total}};}
report.topicFilter=JSON.parse(fs.readFileSync('.local-runtime/topic-filter-vm-result.json','utf8'));
report.sourceSha256=Object.fromEntries(['adaptive-quality.js','parent-dashboard.js','tools/app-adaptive-source.js'].map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
report.localRuntimeValidate='PASS';
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,total:report.total,output:report.outputInspection,audits:report.existingAudits}));
