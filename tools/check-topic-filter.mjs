import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const git=(...args)=>{const r=spawnSync('git',args,{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout};
const original=name=>gunzipSync(Buffer.from(git('ls-tree','-r','--name-only','HEAD','.gzparts').trim().split('\n').filter(p=>p.startsWith(`.gzparts/${name}.gz.b64.`)).sort().map(p=>git('show',`HEAD:${p}`)).join(''),'base64'));
for(const name of ['problems.js','problem_engine.js'])assert(original(name).equals(fs.readFileSync(`.local-runtime/${name}`)),`${name} content drift`);
for(const name of ['all_problems.js','curriculum.js'])assert.equal(git('show',`HEAD:${name}`).replace(/\r\n/g,'\n'),fs.readFileSync(name,'utf8').replace(/\r\n/g,'\n'));
const intended=fs.readFileSync('.local-runtime/app.js');
const run=(...args)=>{const r=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout};
const parts=()=>fs.readdirSync('.gzparts').filter(n=>n.startsWith('app.js.gz.b64.')).sort().map(n=>fs.readFileSync(`.gzparts/${n}`,'utf8')).join('');
const packed=parts();run('tools/pack-app.mjs','.local-runtime/app.js');assert.equal(parts(),packed,'Repack not deterministic');
console.log(run('tools/local-runtime.mjs','build').trim());
assert(fs.readFileSync('.local-runtime/app.js').equals(intended),'Intended source byte mismatch');
console.log(run('tools/local-runtime.mjs','validate').trim());
const makeContext=source=>{
  source=source.replace(/\r\n/g,'\n');
  const ctx=vm.createContext({structuredClone,localStorage:{getItem:()=>null},navigator:{}});ctx.window=ctx;
  for(const name of ['problems.js','problem_engine.js','all_problems.js','curriculum.js'])vm.runInContext(fs.readFileSync(`.local-runtime/${name}`,'utf8'),ctx);
  const tail='  render();\n})();';assert(source.includes(tail));
  vm.runInContext(source.replace(tail,'  window.testAccess={state,challengeView};\n})();'),ctx);
  return ctx;
};
const ctx=makeContext(intended.toString()),before=makeContext(original('app.js').toString());
const {state,challengeView}=ctx.testAccess;
const ids=html=>[...html.matchAll(/data-open-problem="([^"]+)"/g)].map(m=>m[1]);
assert.deepEqual(ids(challengeView()),ids(before.testAccess.challengeView()),'Default recommendation order');
assert(challengeView().includes('<option value="">すべて</option>'));
const tags=[...new Set(ctx.PROBLEMS.flatMap(p=>p.tags))];
const options=[...challengeView().matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)].filter(m=>tags.includes(m[1])).map(m=>m[1]);
assert.equal(options.length,tags.length);
const freq=t=>ctx.PROBLEMS.filter(p=>p.tags.includes(t)).length;
assert(options.every((t,i)=>!i||freq(options[i-1])>freq(t)||(freq(options[i-1])===freq(t)&&options[i-1]<t)));
let combinations=0,empty=0;
state.listLimit=1000;
for(const topic of ['',...tags])for(const level of ['all',1,2,3,4,5])for(const track of ['all','school','junior','olympiad']){
  Object.assign(state,{activeTopic:topic,activeLevel:level,activeTrack:track});
  const html=challengeView(),actual=ids(html);
  const expected=ctx.PROBLEMS.filter(p=>(!topic||p.tags.includes(topic))&&(level==='all'||p.level===level)&&(track==='all'||p.track===track)).map(p=>p.id);
  assert.equal(actual.length,expected.length);assert(actual.every(id=>expected.includes(id)));
  assert(html.includes(`該当 ${expected.length}問（表示 ${actual.length}問）`));
  assert.equal(html.includes('id="noFilterResults"'),expected.length===0);
  if(!expected.length){empty++;assert(html.includes('条件に合う問題はありません'));assert(!html.includes('id="loadMore"'))}
  combinations++;
}
Object.assign(state,{activeTopic:'',activeLevel:'all',activeTrack:'all',listLimit:40});
assert.equal(ids(challengeView()).length,40);assert(challengeView().includes('id="loadMore"'));
const vmReport={validation:'VM rendering (not browser)',optionCount:tags.length,combinations,emptyCombinations:empty,questionCount:ctx.PROBLEMS.length,appSha256:createHash('sha256').update(intended).digest('hex'),contentDrift:false,repack:true};
fs.writeFileSync('.local-runtime/topic-filter-vm-result.json',JSON.stringify(vmReport,null,2)+'\n');
fs.writeFileSync('.local-runtime/topic-filter-rendered.html',challengeView());
console.log(JSON.stringify(vmReport,null,2));
if(process.argv.includes('--vm-only'))process.exit(0);
const chrome=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
assert(fs.existsSync(chrome),'Chrome unavailable');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sansuo-topic-'));
const server=http.createServer((req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  let bytes;
  if(url.pathname==='/original-app.js')bytes=original('app.js');
  else if(url.pathname==='/baseline.html')bytes=fs.readFileSync('.local-runtime/index.html','utf8').replace('src="app.js"','src="original-app.js"');
  else {const target=path.resolve('.local-runtime','.'+(url.pathname==='/'?'/index.html':url.pathname));assert(target.startsWith(path.resolve('.local-runtime')+path.sep));bytes=fs.readFileSync(target)}
  res.writeHead(200,{'Content-Type':url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.css')?'text/css':'text/html','Cache-Control':'no-store'});res.end(bytes);
}catch{res.writeHead(404);res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const child=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
child.stderr.on('data',data=>process.stderr.write(data));
let socket;
try{
  const deadline=Date.now()+20000;
  while(!fs.existsSync(path.join(profile,'DevToolsActivePort'))){assert(Date.now()<deadline,'Chrome startup timeout');await new Promise(r=>setTimeout(r,100))}
  const port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];
  const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j});
  let seq=0;const pending=new Map();const errors=[];
  socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params)};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>reject(new Error(`CDP timeout: ${method}`)),15000);pending.set(id,{resolve:x=>{clearTimeout(timer);resolve(x)},reject:x=>{clearTimeout(timer);reject(x)}});socket.send(JSON.stringify({id,method,params}))});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value};
  await call('Runtime.enable');await call('Network.enable');await call('Network.setBypassServiceWorker',{bypass:true});await call('Network.setCacheDisabled',{cacheDisabled:true});
  const navigate=async url=>{await call('Page.navigate',{url});for(let i=0;i<100;i++){if(await evaluate(`location.href===${JSON.stringify(url)} && document.readyState==='complete' && !!document.querySelector('[data-route="challenge"]')`))return;await new Promise(r=>setTimeout(r,50))}throw Error('Route load timeout')};
  await navigate(base+'/baseline.html');
  await evaluate(`document.querySelector('[data-route="challenge"]').click()`);
  const baseline=await evaluate(`[...document.querySelectorAll('.challenge-list [data-open-problem]')].map(b=>b.dataset.openProblem)`);
  await navigate(base+'/');
  await evaluate(`document.querySelector('[data-route="challenge"]').click()`);
  const result=await evaluate(`(()=>{
    const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
    const ids=()=>[...document.querySelectorAll('.challenge-list [data-open-problem]')].map(b=>b.dataset.openProblem);
    const select=(id,value)=>{const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}))};
    const verify=(topic='',level='all',track='all')=>{
      const expected=PROBLEMS.filter(p=>(!topic||p.tags.includes(topic))&&(level==='all'||p.level===Number(level))&&(track==='all'||p.track===track));
      const actual=ids();assert(actual.length===Math.min(expected.length,40),'Visible count');assert(actual.every(id=>expected.some(p=>p.id===id)),'AND membership');
      assert(document.querySelector('#filterResultCount').textContent==='該当 '+expected.length+'問（表示 '+actual.length+'問）','Result count UI');return expected.length;
    };
    const el=document.querySelector('#topicFilter');assert(el&&el.value===''&&el.options[0].text==='すべて','Default selector');
    const options=[...el.options].slice(1).map(o=>o.value);const tags=[...new Set(PROBLEMS.flatMap(p=>p.tags))];assert(options.length===tags.length&&tags.every(t=>options.includes(t)),'Existing tags');
    const freq=t=>PROBLEMS.filter(p=>p.tags.includes(t)).length;assert(options.every((t,i)=>!i||freq(options[i-1])>freq(t)||(freq(options[i-1])===freq(t)&&options[i-1]<t)),'Deterministic order');
    assert(verify()===438,'Default total');const defaultIds=ids();
    const topic=options.find(t=>freq(t)>40&&freq(t)<438);select('topicFilter',topic);const topicCount=verify(topic);
    document.querySelector('#loadMore')?.click();assert(ids().length===Math.min(80,topicCount),'Load more');assert(ids().every(id=>PROBLEMS.find(p=>p.id===id).tags.includes(topic)),'Load more membership');
    const q=PROBLEMS.find(p=>p.tags.includes(topic));select('levelFilter',String(q.level));const combinedCount=verify(topic,String(q.level));
    document.querySelector('[data-filter="'+q.track+'"]').click();const tripleCount=verify(topic,String(q.level),q.track);
    select('levelFilter','1');assert(verify(topic,'1',q.track)===0,'Empty fixture');assert(document.querySelector('#noFilterResults')?.textContent.includes('条件に合う問題はありません'),'Empty message');assert(!document.querySelector('#loadMore'),'Empty pagination');
    select('levelFilter','all');document.querySelector('[data-filter="all"]').click();select('topicFilter','');verify();assert(JSON.stringify(ids())===JSON.stringify(defaultIds),'Restored order');
    return {optionCount:options.length,topic,topicCount,combinedCount,tripleCount,defaultIds,defaultCount:438,noResults:true};
  })()`);
  assert.deepEqual(result.defaultIds,baseline,'Default recommendation ordering changed');
  assert.equal(errors.length,0,JSON.stringify(errors));
  delete result.defaultIds;
  const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync('.local-runtime/topic-filter.png',Buffer.from(shot.data,'base64'));
  const report={...result,appSha256:createHash('sha256').update(intended).digest('hex'),contentDrift:false,repack:true,browser:'PASS',runtimeExceptions:errors.length};
  fs.writeFileSync('.local-runtime/topic-filter-result.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  await call('Browser.close');
}finally{
  socket?.close();child.kill();server.close();
  // The isolated profile is deliberately left in OS temp if Chrome still holds files.
  for(let i=0;i<10;i++){try{fs.rmSync(profile,{recursive:true,force:true});break}catch{await new Promise(r=>setTimeout(r,100))}}
}
