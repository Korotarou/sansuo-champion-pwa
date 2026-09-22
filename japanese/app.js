(()=>{
'use strict';
const DATA=window.KOKUGO_DATA;
const QUESTIONS=DATA.questions, PASSAGES=DATA.passages;
const QMAP=new Map(QUESTIONS.map(q=>[q.id,q])), PMAP=new Map(PASSAGES.map(p=>[p.id,p]));
const KEY='kokugoLabV1';
const def={version:1,attempts:[],reviews:[],mockHistory:[],settings:{daily:8,week:1},lastMode:'alpha1'};
let state=load(),view='home',session=null,selected=null,revealed=false,shortText='',timerHandle=null;
function clone(x){return JSON.parse(JSON.stringify(x))}
function load(){try{const x=JSON.parse(localStorage.getItem(KEY)||'null');return x&&x.version===1?Object.assign(clone(def),x):clone(def)}catch(e){return clone(def)}}
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function today(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function isToday(v){if(!v)return false;const d=new Date(v);if(!Number.isFinite(d.getTime()))return false;return today()===[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function toast(s){const e=document.getElementById('toast');if(!e)return;e.textContent=s;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),1600)}
function shuffle(a,seed=Date.now()){a=a.slice();let x=(seed>>>0)||1;for(let i=a.length-1;i>0;i--){x=(x*1664525+1013904223)>>>0;const j=x%(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
function due(){const now=Date.now();return state.reviews.filter(r=>!r.done&&new Date(r.due).getTime()<=now).sort((a,b)=>new Date(a.due)-new Date(b.due))}
function activeReviews(){return state.reviews.filter(r=>!r.done)}
function todayAttempts(){return state.attempts.filter(a=>isToday(a.created))}
function accuracy(days=30){const t=Date.now()-days*86400000;const a=state.attempts.filter(x=>new Date(x.created).getTime()>=t&&typeof x.success==='boolean');return a.length?Math.round(a.filter(x=>x.success).length/a.length*100):0}
function schedule(qid,success,fromReview=false){
  let r=state.reviews.find(x=>x.qid===qid&&!x.done);
  if(success){
    if(r&&fromReview){r.stage=(r.stage||0)+1;if(r.stage>=2){r.done=true}else{const d=new Date();d.setDate(d.getDate()+(r.stage===1?3:7));r.due=d.toISOString()}}
    return;
  }
  if(!r){const d=new Date();d.setDate(d.getDate()+1);state.reviews.push({id:'R'+Date.now()+Math.random().toString(16).slice(2),qid,due:d.toISOString(),stage:0,done:false})}
  else{const d=new Date();d.setDate(d.getDate()+1);r.due=d.toISOString();r.stage=0}
}
function record(q,success,answer){
  const fromReview=session&&session.mode==='review';
  state.attempts.push({qid:q.id,kind:q.kind,domain:q.domain,genre:q.genre||'',success,answer:answer??null,created:new Date().toISOString(),mode:session?.mode||'practice'});
  if(state.attempts.length>1200)state.attempts=state.attempts.slice(-1200);
  schedule(q.id,success,fromReview);save();
}
function uniqueIds(list){const s=new Set();return list.filter(id=>id&&!s.has(id)&&(s.add(id),true))}
function passageQuestions(pid){return QUESTIONS.filter(q=>q.passageId===pid)}
function questionPool(fn){return QUESTIONS.filter(fn)}
function pickDaily(){
  const n=Math.max(6,Math.min(14,Number(state.settings.daily)||8));
  const ids=due().map(r=>r.qid).slice(0,Math.min(3,n));
  const seen=new Set(ids);
  const add=(pool,count)=>{for(const q of shuffle(pool,Date.now()+ids.length*97)){if(ids.length>=n||count<=0)break;if(!seen.has(q.id)){ids.push(q.id);seen.add(q.id);count--}}};
  add(questionPool(q=>q.domain==='語彙'||q.domain==='漢字・語句'||q.domain==='接続語'||q.domain==='文法'||q.domain==='慣用表現'),2);
  add(questionPool(q=>q.domain==='短文論理'),2);
  const week=DATA.curriculum[Math.max(0,Math.min(51,(state.settings.week||1)-1))];
  let level=Math.min(5,2+Math.floor((week.week-1)/12));
  const passages=shuffle(PASSAGES.filter(p=>p.level<=Math.max(3,level)),Date.now());
  for(const p of passages){add(passageQuestions(p.id),Math.min(4,n-ids.length));if(ids.length>=n)break}
  add(QUESTIONS,n-ids.length);
  return uniqueIds(ids).slice(0,n);
}
function pickKnowledge(){return shuffle(QUESTIONS.filter(q=>q.id.startsWith('K')),Date.now()).slice(0,10).map(q=>q.id)}
function pickNoAI(){return shuffle(QUESTIONS.filter(q=>q.kind==='short'),Date.now()).slice(0,5).map(q=>q.id)}
function pickReading(){
  const p=shuffle(PASSAGES,Date.now())[0];return passageQuestions(p.id).map(q=>q.id)
}
function pickMock(){
  const ps=shuffle(PASSAGES.filter(p=>p.level>=4),Date.now()).slice(0,2);
  let ids=[];for(const p of ps)ids.push(...shuffle(passageQuestions(p.id),Date.now()+ids.length).slice(0,4).map(q=>q.id));
  ids.push(...shuffle(QUESTIONS.filter(q=>q.id.startsWith('M')),Date.now()+13).slice(0,2).map(q=>q.id));
  ids.push(...shuffle(QUESTIONS.filter(q=>q.id.startsWith('K')&&q.level>=3),Date.now()+29).slice(0,2).map(q=>q.id));
  return uniqueIds(ids).slice(0,12)
}
function alpha1Ready(){
  const target=Math.max(6,Math.min(14,Number(state.settings.daily)||8));
  return due().length===0&&todayAttempts().length>=target;
}
function start(mode){
  clearInterval(timerHandle);selected=null;revealed=false;shortText='';
  if(mode==='tsukukoma'&&!alpha1Ready()){toast('先にα1デイリーと期限復習を完了しよう');show('home');return}
  let ids=mode==='alpha1'?pickDaily():mode==='knowledge'?pickKnowledge():mode==='reading'?pickReading():mode==='review'?due().slice(0,10).map(r=>r.qid):mode==='noai'?pickNoAI():mode==='tsukukoma'?pickMock():pickDaily();
  if(!ids.length){toast('期限復習はありません');show('practice');return}
  session={mode,ids,index:0,startedAt:Date.now(),deadline:mode==='tsukukoma'?Date.now()+40*60*1000:null,results:[]};
  state.lastMode=mode;save();view='quiz';render();
}
function current(){return session?QMAP.get(session.ids[session.index]):null}
function next(){selected=null;revealed=false;shortText='';if(!session)return;if(session.index+1>=session.ids.length){finish()}else{session.index++;render()}}
function finish(){
  clearInterval(timerHandle);
  const ok=session.results.filter(Boolean).length,total=session.results.length||session.ids.length;
  const scaled=Math.round(ok/Math.max(1,total)*100);
  if(session.mode==='tsukukoma'){state.mockHistory.push({created:new Date().toISOString(),score:scaled,total:100,items:total});if(state.mockHistory.length>30)state.mockHistory=state.mockHistory.slice(-30);save()}
  session.summary={ok,total,scaled,seconds:Math.round((Date.now()-session.startedAt)/1000)};view='result';render();
}
function submitMCQ(){
  const q=current();if(!q||q.kind!=='mcq'||selected===null||revealed)return;
  revealed=true;const success=selected===q.answer;session.results[session.index]=success;record(q,success,selected);render()
}
function revealShort(){
  const q=current();if(!q||q.kind!=='short'||shortText.trim().length<5){toast('まず自分の答案を書こう');return}
  revealed=true;render()
}
function judgeShort(success){
  const q=current();if(!q||q.kind!=='short'||!revealed)return;session.results[session.index]=success;record(q,success,shortText);next()
}
function header(title,sub){return '<div class="top"><div><div class="eyebrow">KOKUGO LAB 180</div><h1>'+esc(title)+'</h1><div class="muted">'+esc(sub||'')+'</div></div><div class="top-actions"><a class="btn ghost subject-home-link" href="../?home=1">4科ホーム</a><button class="btn ghost" data-view="practice">演習</button></div></div>'}
const navItems=[['home','ホーム'],['practice','演習'],['review','再テスト'],['record','記録'],['curriculum','52週'],['settings','設定']];
function nav(){
  const n=document.getElementById('nav');if(n)n.innerHTML=navItems.map(x=>'<button class="nav-btn '+(view===x[0]?'active':'')+'" data-view="'+x[0]+'">'+x[1]+'</button>').join('');
  const b=document.getElementById('bottomNav');if(b)b.innerHTML=navItems.slice(0,5).map(x=>'<button class="'+(view===x[0]?'active':'')+'" data-view="'+x[0]+'">'+x[1]+'</button>').join('');
  document.querySelectorAll('[data-view]').forEach(e=>e.onclick=()=>show(e.dataset.view))
}
function show(v){clearInterval(timerHandle);view=v;session=null;selected=null;revealed=false;shortText='';render()}
function homeView(){
  const a=todayAttempts(),week=DATA.curriculum[Math.max(0,Math.min(51,(state.settings.week||1)-1))],target=Math.max(6,Math.min(14,Number(state.settings.daily)||8)),ready=alpha1Ready();
  return header('国語Lab','直近目標：SAPIX α1昇格｜その先に筑駒')+
  '<section class="hero"><div class="tag-row"><span class="tag gold">180問</span><span class="tag blue">52週</span><span class="tag green">記述は自己採点</span><span class="tag">非公式・完全オリジナル</span></div><h2>読む → 根拠を拾う → 条件どおりに書く</h2><p>語彙だけ、読解だけに分けません。毎日のα1ルートで、言葉・論理・長文・記述を混ぜ、間違いは期限付きで再テストします。筑駒想定40分は時間条件のみを参考にした独自演習で、SAPIX・筑波大学附属駒場中学校の公式教材ではありません。</p></section>'+
  '<div class="grid cols-4">'+
  metric('今日',a.length+' / '+target+'問','α1ルート')+
  metric('期限復習',due().length+'問','最優先')+
  metric('30日正答率',accuracy(30)+'%','自己採点含む')+
  metric('今週','W'+String(week.week).padStart(2,'0'),week.phase)+
  '</div>'+
  '<section class="section"><div class="section-title">今日やること</div><div class="grid cols-2">'+
  modeCard('α1デイリー','最優先。期限復習→語彙→短文論理→長文記述を8問。','alpha1','α1 今日の8問を始める')+
  modeCard('筑駒想定40分','発展。α1デイリーと期限復習を終えた日に実施。','tsukukoma',ready?'発展40分を始める':'α1日課完了後に解放',!ready)+
  '</div></section>'+
  '<section class="section"><div class="qa-banner">記述問題はAIが○×を決めません。答案を書いた後に、必須観点と例答を見て「満たした／もう一度」を本人または保護者が判定します。</div></section>'
}
function metric(l,v,s){return '<div class="card flat"><div class="metric-label">'+esc(l)+'</div><div class="metric">'+esc(v)+'</div><div class="muted small">'+esc(s)+'</div></div>'}
function modeCard(t,d,m,b,disabled=false){return '<article class="card mode-card"><div class="eyebrow">'+esc(m)+'</div><h3>'+esc(t)+'</h3><p>'+esc(d)+'</p><button class="btn '+(disabled?'ghost':'primary')+'" data-mode="'+m+'" '+(disabled?'disabled':'')+'>'+esc(b)+'</button></article>'}
function practiceView(){
  return header('演習','目的別に回す。記述だけをAIに丸投げしない。')+
  '<div class="grid cols-3">'+
  modeCard('α1デイリー','毎日の標準。期限復習を自動で先頭へ。','alpha1','始める')+
  modeCard('長文1題','物語・説明・随筆・詩から1題6問。','reading','始める')+
  modeCard('語彙・知識10問','語彙、接続語、文法、漢字・語句。','knowledge','始める')+
  modeCard('AIなし記述5問','必須観点と例答で自己採点する記述集中。','noai','始める')+
  modeCard('期限再テスト','間違えた問題を1日→3日→卒業で追跡。','review','再テスト')+
  modeCard('筑駒想定40分','発展。α1の日課・期限復習を終えてから。','tsukukoma',alpha1Ready()?'始める':'α1日課完了後',!alpha1Ready())+
  '</div>'
}
function quizView(){
  const q=current();if(!q)return '<div class="empty">問題がありません</div>';
  const p=q.passageId?PMAP.get(q.passageId):null;
  let left='';
  if(p)left='<div><div class="card"><div class="eyebrow">'+esc(p.genre)+'</div><h2>'+esc(p.title)+'</h2><div class="passage">'+esc(p.text)+'</div></div></div>';
  else if(q.stimulus)left='<div><div class="card"><div class="eyebrow">短文論理</div><div class="passage">'+esc(q.stimulus)+'</div></div></div>';
  else left='<div><div class="card"><div class="eyebrow">知識</div><h2>'+esc(q.domain)+'</h2><p class="muted">文脈と定義を行き来して答える。</p></div></div>';
  const progress=Math.round((session.index)/session.ids.length*100);
  let body='<div class="q-meta"><span>'+esc(q.domain)+' / Lv.'+q.level+'</span><span>'+(session.index+1)+' / '+session.ids.length+'</span></div><div class="progress"><span style="width:'+progress+'%"></span></div><div class="q-prompt">'+esc(q.prompt)+'</div>';
  if(q.kind==='mcq'){
    body+='<div class="choice-list">'+q.choices.map((c,i)=>'<button class="choice '+(selected===i?'selected ':'')+(revealed?(i===q.answer?'correct ':selected===i&&i!==q.answer?'wrong ':''):'')+'" data-choice="'+i+'" '+(revealed?'disabled':'')+'>'+String.fromCharCode(65+i)+'. '+esc(c)+'</button>').join('')+'</div>';
    if(!revealed)body+='<div style="margin-top:14px"><button class="btn primary" id="submitChoice" '+(selected===null?'disabled':'')+'>答え合わせ</button></div>';
    else body+='<div class="answer-box '+(selected===q.answer?'good':'')+'"><b>'+(selected===q.answer?'正解':'再テストへ')+'</b><br>'+esc(q.explanation)+'</div><div style="margin-top:14px"><button class="btn primary" id="nextQ">次へ</button></div>';
  }else{
    body+='<textarea class="textarea" id="shortAnswer" maxlength="'+(q.maxChars||120)+'" placeholder="本文の根拠を使って、自分の言葉で書く。">'+esc(shortText)+'</textarea><div class="counter"><span id="charCount">'+shortText.length+'</span> / '+q.maxChars+'字</div>';
    if(!revealed)body+='<button class="btn primary" id="revealRubric">採点基準を見る</button>';
    else body+='<div class="rubric"><b>必須観点</b><ul>'+q.rubric.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div><div class="sample"><b>例答</b><br>'+esc(q.sample)+'</div><div class="qa-banner" style="margin-top:12px">AI判定なし。自分の答案が必須観点を満たしているかで判定。</div><div class="top-actions" style="margin-top:12px"><button class="btn good" id="shortGood">基準を満たした</button><button class="btn bad" id="shortRetry">もう一度</button></div>';
  }
  const side='<aside class="card side-card"><div class="eyebrow">'+esc(session.mode.toUpperCase())+'</div>'+(session.mode==='tsukukoma'?'<div class="timer" id="timer">40:00</div><div class="muted small">自動提出はしません。残り時間だけ表示。</div>':'<div class="score-big">'+(session.index+1)+'</div><div class="muted small">全'+session.ids.length+'問</div>')+'<div style="margin-top:18px"><button class="btn ghost" id="quitSession">演習を中断</button></div></aside>';
  return header(session.mode==='tsukukoma'?'筑駒想定40分':'問題演習',session.mode==='tsukukoma'?'40分・100点換算 / 完全オリジナル':'根拠を確認して進む')+'<div class="question-shell">'+left+'<div><div class="card q-card">'+body+'</div>'+side+'</div></div>'
}
function resultView(){
  const s=session?.summary||{ok:0,total:0,scaled:0,seconds:0};
  return header('結果','記述は自己採点結果を含みます')+
  '<section class="hero"><div class="eyebrow">RESULT</div><div class="score-big">'+s.scaled+'<span style="font-size:20px"> / 100</span></div><p>'+s.total+'問中 '+s.ok+'問を基準達成。所要 '+Math.floor(s.seconds/60)+'分'+(s.seconds%60)+'秒。</p><div class="top-actions"><button class="btn primary" data-view="home">ホームへ</button><button class="btn ghost" data-mode="review">期限再テスト</button></div></section>'
}
function reviewView(){
  const list=activeReviews().sort((a,b)=>new Date(a.due)-new Date(b.due));
  return header('再テスト','間違いは翌日→3日後の2回成功で卒業')+
  '<div class="grid cols-4">'+metric('期限到来',due().length+'問','今やる')+metric('復習中',list.length+'問','未卒業')+metric('卒業',state.reviews.filter(r=>r.done).length+'問','2回成功')+metric('全履歴',state.attempts.length+'回','答案履歴')+'</div>'+
  '<section class="section"><div class="section-title">復習キュー</div>'+(list.length?'<div class="review-list">'+list.slice(0,40).map(r=>{const q=QMAP.get(r.qid);return '<div class="card review-row"><div><b>'+esc(q?.domain||r.qid)+'｜'+esc(q?.prompt?.slice(0,45)||r.qid)+'</b><div class="muted small">期限 '+new Date(r.due).toLocaleDateString('ja-JP')+' / stage '+(r.stage||0)+'</div></div><span class="tag '+(new Date(r.due).getTime()<=Date.now()?'gold':'')+'">'+(new Date(r.due).getTime()<=Date.now()?'期限':'待機')+'</span></div>'}).join('')+'</div>':'<div class="card empty">復習待ちはありません。</div>')+'</section><div style="margin-top:14px"><button class="btn primary" data-mode="review" '+(!due().length?'disabled':'')+'>期限問題を始める</button></div>'
}
function recordView(){
  const recent=state.attempts.slice(-30).reverse();
  const domainStats={};for(const a of state.attempts){const k=a.domain||'その他';domainStats[k]??={n:0,ok:0};domainStats[k].n++;if(a.success)domainStats[k].ok++}
  const cards=Object.entries(domainStats).sort((a,b)=>a[1].ok/a[1].n-b[1].ok/b[1].n).slice(0,6).map(([k,v])=>'<div class="card flat"><div class="metric-label">'+esc(k)+'</div><div class="metric">'+Math.round(v.ok/v.n*100)+'%</div><div class="muted small">'+v.ok+' / '+v.n+'</div></div>').join('');
  return header('記録','弱点は正答率より「どこで根拠を外したか」を見る')+
  '<div class="grid cols-3">'+(cards||metric('未実施','—','問題を解くと表示'))+'</div>'+
  '<section class="section"><div class="section-title">最近の答案</div>'+(recent.length?'<div class="card"><table class="history-table"><thead><tr><th>日時</th><th>領域</th><th>判定</th><th>mode</th></tr></thead><tbody>'+recent.map(a=>'<tr><td>'+new Date(a.created).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})+'</td><td>'+esc(a.domain)+'</td><td>'+(a.success?'○':'△')+'</td><td>'+esc(a.mode)+'</td></tr>').join('')+'</tbody></table></div>':'<div class="card empty">まだ履歴がありません。</div>')+'</section>'
}
function curriculumView(){
  return header('52週ロードマップ','小4の語彙・読解基礎から、根拠記述と40分実戦へ')+
  '<div class="curriculum-grid">'+DATA.curriculum.map(w=>'<button class="week-card '+(w.week==state.settings.week?'current':'')+'" data-week="'+w.week+'"><b>W'+String(w.week).padStart(2,'0')+'｜'+esc(w.phase)+'</b><span>'+esc(w.skill)+'：'+esc(w.goal)+(w.mock?' / 40分実戦':'')+'</span></button>').join('')+'</div>'
}
function settingsView(){
  return header('設定','目標量だけ調整。採点方式は変えない。')+
  '<div class="card"><div class="section-title">毎日の問題数</div><div class="top-actions">'+[6,8,10,12,14].map(n=>'<button class="btn '+(state.settings.daily==n?'primary':'ghost')+'" data-daily="'+n+'">'+n+'問</button>').join('')+'</div><p class="muted">標準は8問。期限復習がある日は先頭に入ります。</p></div>'+
  '<div class="card" style="margin-top:14px"><div class="section-title">データ</div><button class="btn ghost" id="exportBtn">JSONバックアップ</button><p class="muted small">国語Labの学習履歴だけを保存します。</p></div>'
}
function render(){
  nav();const app=document.getElementById('app');if(!app)return;
  app.innerHTML=view==='home'?homeView():view==='practice'?practiceView():view==='quiz'?quizView():view==='result'?resultView():view==='review'?reviewView():view==='record'?recordView():view==='curriculum'?curriculumView():settingsView();
  bind();if(view==='quiz'&&session?.mode==='tsukukoma')startTimer()
}
function bind(){
  document.querySelectorAll('[data-view]').forEach(e=>e.onclick=()=>show(e.dataset.view));
  document.querySelectorAll('[data-mode]').forEach(e=>e.onclick=()=>start(e.dataset.mode));
  document.querySelectorAll('[data-choice]').forEach(e=>e.onclick=()=>{if(!revealed){selected=Number(e.dataset.choice);render()}});
  const sc=document.getElementById('submitChoice');if(sc)sc.onclick=submitMCQ;
  const nq=document.getElementById('nextQ');if(nq)nq.onclick=next;
  const ta=document.getElementById('shortAnswer');if(ta)ta.oninput=()=>{shortText=ta.value;const c=document.getElementById('charCount');if(c)c.textContent=shortText.length};
  const rr=document.getElementById('revealRubric');if(rr)rr.onclick=revealShort;
  const sg=document.getElementById('shortGood');if(sg)sg.onclick=()=>judgeShort(true);
  const sr=document.getElementById('shortRetry');if(sr)sr.onclick=()=>judgeShort(false);
  const qs=document.getElementById('quitSession');if(qs)qs.onclick=()=>{session=null;show('practice')};
  document.querySelectorAll('[data-week]').forEach(e=>e.onclick=()=>{state.settings.week=Number(e.dataset.week);save();render()});
  document.querySelectorAll('[data-daily]').forEach(e=>e.onclick=()=>{state.settings.daily=Number(e.dataset.daily);save();render()});
  const ex=document.getElementById('exportBtn');if(ex)ex.onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='kokugo-lab-backup-'+today()+'.json';a.click();URL.revokeObjectURL(a.href)}
}
function startTimer(){
  clearInterval(timerHandle);const tick=()=>{const e=document.getElementById('timer');if(!e||!session?.deadline)return;let sec=Math.max(0,Math.ceil((session.deadline-Date.now())/1000));e.textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');if(sec<=0){clearInterval(timerHandle);toast('40分です。ここで一度答案を締めよう')}};tick();timerHandle=setInterval(tick,1000)
}
window.KokugoEngine={count:()=>QUESTIONS.length,dueCount:()=>due().length,todayCount:()=>todayAttempts().length,state:()=>clone(state)};
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
render();
})();