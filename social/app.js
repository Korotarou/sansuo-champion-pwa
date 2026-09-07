(function(){
"use strict";
var D=window.SOCIAL_DATA,E=window.SocialEngine;
if(!D||!E){throw new Error("問題データの読み込みに失敗しました");}
var KEY="socialLabV2";
var ERR={A:"問題文の読み違い",B:"知識不足",C:"方針が立たない",D:"途中の論理ミス",E:"計算・数字のミス",F:"図・表・整理不足",G:"時間不足"};
var def={version:2,attempts:[],reviews:[],tests:[],settings:{daily:12,week:1,includeAhead:false},focus:false};
var state=load(),view="home",q=null,track="daily",hintShown=false,choice=null,reviewId=null,result=null;
function clone(x){return JSON.parse(JSON.stringify(x));}
function load(){try{var x=JSON.parse(localStorage.getItem(KEY)||"null");return x&&x.version===2?Object.assign(clone(def),x):clone(def);}catch(e){return clone(def);}}
function save(){localStorage.setItem(KEY,JSON.stringify(state));}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function iso(){return new Date().toISOString();}
function day(n){var d=new Date();d.setDate(d.getDate()+n);return d.toISOString();}
function num(v){var n=Number(v);return Number.isFinite(n)?n:0;}
function toast(s){var e=document.getElementById("toast");if(!e)return;e.textContent=s;e.classList.add("show");setTimeout(function(){e.classList.remove("show");},1800);}
function header(title,sub){return '<div class="top"><div><div class="eyebrow">SOCIAL LAB 418</div><h1>'+esc(title)+'</h1><div class="muted">'+esc(sub||"")+'</div></div><div class="top-actions"><button class="btn ghost" onclick="App.installHelp()">iPad追加</button></div></div>';}
function metric(l,v,s){return '<div class="card flat"><div class="metric-label">'+esc(l)+'</div><div class="metric">'+esc(v)+'</div><div class="muted small">'+esc(s||"")+'</div></div>';}
function nav(){
 var items=[["home","ホーム"],["practice","演習"],["review","再テスト"],["tests","SAPIX"],["parent","保護者"],["curriculum","52週"],["settings","設定"]];
 var n=document.getElementById("nav");if(n)n.innerHTML=items.map(function(x){return '<button class="nav-btn '+(view===x[0]?"active":"")+'" onclick="App.show(\''+x[0]+'\')">'+x[1]+'</button>';}).join("");
 var b=document.getElementById("bottomNav");if(b)b.innerHTML=items.slice(0,5).map(function(x){return '<button class="'+(view===x[0]?"active":"")+'" onclick="App.show(\''+x[0]+'\')">'+x[1]+'</button>';}).join("");
}
function show(v){view=v;q=null;reviewId=null;result=null;nav();render();}
function recent(days){var t=Date.now()-days*86400000;return state.attempts.filter(function(a){return new Date(a.created).getTime()>=t;});}
function due(){var now=Date.now();return state.reviews.filter(function(r){return !r.done&&new Date(r.due).getTime()<=now;}).sort(function(a,b){return new Date(a.due)-new Date(b.due);});}
function active(){return state.reviews.filter(function(r){return !r.done;});}
function mastery(domain){var a=recent(45).filter(function(x){return x.domain===domain;});return {n:a.length,p:a.length?Math.round(100*a.filter(function(x){return x.correct;}).length/a.length):0};}
function latestTest(){return state.tests.slice().sort(function(a,b){return String(b.date).localeCompare(String(a.date));})[0]||null;}
function alphaCard(){
 var t=latestTest();if(!t)return '<div class="card alpha-box"><div class="metric-label">α1目標</div><h3>実基準点が分かったテストから記録</h3><p class="muted">基準点は予測しません。実際の基準点と4科得点の差だけを使います。</p></div>';
 var gap=t.alphaCut!==""&&t.alphaCut!=null?Math.max(0,num(t.alphaCut)-num(t.total)):null;
 return '<div class="card alpha-box"><div class="metric-label">直近SAPIX / α1</div><h3>'+esc(t.name)+'</h3><div class="alpha-gap">'+(gap==null?"基準未入力":gap===0?"到達":"あと "+gap+"点")+'</div><p class="muted">回収候補：正答率70%以上 '+num(t.lost70)+'点 / 50〜70% '+num(t.lost50)+'点 / 30〜50% '+num(t.lost30)+'点</p></div>';
}
function home(){
 var a=recent(7),acc=a.length?Math.round(100*a.filter(function(x){return x.correct;}).length/a.length):0;
 return header("ホーム","SAPIX社会を主教材に、α1の取りこぼし削減と最難関校につながる思考力を育てる")+
 '<div class="hero"><div class="hero-kicker">小4の既定運用</div><h2>地理を固め、資料から理由を説明する</h2><p>通常デイリーは地理75％＋初見資料25％。歴史・公民は先取りトラックとして分けます。ヒント後正解は△扱い、後日ヒントなしで再現できるまで追跡します。</p><div class="qactions"><button class="btn" onclick="App.start(\'daily\')">今日の12問</button><button class="btn secondary" onclick="App.start(\'exam\')">AI禁止テスト</button></div></div>'+
 '<div class="section-head"><h2>今の状態</h2></div><div class="grid cols-4">'+metric("7日演習",a.length+"問","自力時間を優先")+metric("7日正答率",acc+"%","ヒント後も含む")+metric("再テスト期限",due().length+"問","期限到来を先に")+metric("問題バンク",E.count()+"問","オリジナル")+'</div>'+
 '<div class="section-head"><h2>今日の優先</h2></div><div class="grid cols-2"><div class="card action-card" onclick="App.show(\'review\')"><div class="metric-label">RETEST</div><div class="big">再テスト '+due().length+'問</div><div class="muted">ヒントなし＋説明できる状態を2回再現して卒業。</div></div><div class="card action-card" onclick="App.start(\'elite\')"><div class="metric-label">THINK DEEPER</div><div class="big">初見資料・因果記述</div><div class="muted">筑駒・開成につながる、条件整理→根拠→説明。</div></div></div>'+
 '<div class="section-head"><h2>α1</h2></div>'+alphaCard();
}
function practice(){
 return header("演習","答えを急がず、まず自分で考える")+
 '<div class="grid cols-3">'+
 cardTrack("daily","今日のデイリー","地理75%＋初見資料25%","Lv1〜4")+
 cardTrack("geo","地理","場所→地形→気候→産業→暮らし","Lv1〜3")+
 cardTrack("elite","最難関思考","資料・矛盾・比較・因果","Lv4")+
 cardTrack("history","歴史・先取り","原因→出来事→結果→次","Lv2〜3")+
 cardTrack("civics","公民・先取り","主体・役割・目的まで説明","Lv2〜3")+
 cardTrack("exam","AI禁止テスト","終了までヒントなし","自力確認")+'</div><div id="questionHost"></div>';
}
function cardTrack(id,title,sub,tag){return '<div class="card action-card" onclick="App.start(\''+id+'\')"><span class="pill">'+esc(tag)+'</span><h3>'+esc(title)+'</h3><p class="muted">'+esc(sub)+'</p></div>';}
function pick(t){
 var pool=[];
 if(t==="geo")pool=E.list({domain:"地理"});
 else if(t==="history")pool=E.list({domain:"歴史"});
 else if(t==="civics")pool=E.list({domain:"公民"});
 else if(t==="elite")pool=E.list({domain:"最難関"});
 else if(t==="exam")pool=E.bank.filter(function(x){return x.domain==="地理"||x.domain==="最難関";});
 else{
   var r=Math.random();
   if(state.settings.includeAhead&&r<0.12)pool=E.list({domain:Math.random()<0.5?"歴史":"公民"});
   else if(r<0.25)pool=E.list({domain:"最難関"});
   else pool=E.list({domain:"地理"});
 }
 var last=state.attempts.slice(-12).map(function(x){return x.qid;});
 var cand=pool.filter(function(x){return last.indexOf(x.id)<0;});if(!cand.length)cand=pool;
 return cand[Math.floor(Math.random()*cand.length)]||E.bank[0];
}
function start(t){track=t;state.focus=t==="exam";save();q=pick(t);reviewId=null;hintShown=false;choice=null;result=null;if(view!=="practice"){view="practice";nav();render();}setTimeout(renderQ,0);}
function renderQ(){
 var host=document.getElementById("questionHost");if(!host||!q)return;
 var type=q.type==="mcq"?"選択":"記述";
 var h='<div class="section-head"><h2>問題</h2><span class="pill '+(q.level===4?"warn":"")+'">Lv'+q.level+' / '+esc(q.domain)+' / '+esc(type)+'</span></div><div class="card question-card">';
 h+='<div class="qmeta"><span class="pill">'+esc(q.unit)+'</span>'+(state.focus?'<span class="pill bad">AI禁止</span>':'')+(hintShown?'<span class="pill warn">ヒント使用</span>':'')+'</div>';
 if(q.source)h+='<div class="source">'+esc(q.source)+'</div>';
 h+='<div class="prompt">'+esc(q.prompt)+'</div>';
 if(q.type==="mcq"){
   h+='<div class="choices">'+q.choices.map(function(c,i){return '<button class="choice '+(choice===c?"selected":"")+'" onclick="App.choose('+JSON.stringify(c)+')"><span class="choice-key">'+String.fromCharCode(65+i)+'</span><span>'+esc(c)+'</span></button>';}).join("")+'</div>';
 }else h+='<textarea id="answerText" placeholder="根拠が分かるように、自分の言葉で書こう。"></textarea>';
 h+='<div class="qactions">'+(!state.focus&&!hintShown?'<button class="btn ghost" onclick="App.hint()">ヒントを1つ</button>':'')+'<button class="btn" onclick="App.submit()">答える</button></div><div id="feedbackHost"></div></div>';
 host.innerHTML=h;host.scrollIntoView({behavior:"smooth",block:"start"});
}
function choose(c){choice=c;renderQ();}
function hint(){if(state.focus){toast("AI禁止テストではヒントなし");return;}if(!q||hintShown)return;hintShown=true;var f=document.getElementById("feedbackHost");if(f)f.innerHTML='<div class="hint"><strong>ヒント</strong><br>'+esc(q.hint||"条件を一つずつ整理しよう。")+'</div>';}
function submit(){
 if(!q)return;
 if(q.type==="mcq"){
   if(choice==null){toast("選択肢を選んでください");return;}
   var ok=choice===q.answer;finish(ok,String(choice),true);
 }else{
   var t=(document.getElementById("answerText")||{}).value||"";if(!t.trim()){toast("まず自分の答えを書こう");return;}showRubric(t);
 }
}
function showRubric(text){
 var f=document.getElementById("feedbackHost");var rows=(q.rubrics||[]).map(function(r){var hit=(r.keys||[]).some(function(k){return text.indexOf(k)>=0;});return '<div class="rubric-row"><span class="'+(hit?"rubric-hit":"rubric-miss")+'">'+(hit?"●":"○")+'</span><div><strong>'+esc(r.label)+'</strong><div class="muted small">キーワード検出は採点ではありません。</div></div></div>';}).join("");
 f.innerHTML='<div class="feedback info"><strong>必要要素を照合</strong><p>下は自動採点ではありません。意味として必要要素を満たすか、自分または保護者が判断してください。</p><div class="rubric">'+rows+'</div><div class="qactions"><button class="btn" onclick="App.judgeShort(true)">必要要素を満たした</button><button class="btn secondary" onclick="App.judgeShort(false)">不足がある</button><button class="btn ghost" onclick="App.model()">解答例を見る</button></div></div>';
 result={answer:text};
}
function model(){var f=document.getElementById("feedbackHost");if(f)f.innerHTML+='<div class="feedback info"><strong>解答例</strong><p>'+esc(q.model||"")+'</p><p class="muted small">表現が違っても、必要な因果関係が説明できていればよい。</p></div>';}
function judgeShort(ok){finish(ok,result?result.answer:"",false);}
function finish(ok,answer,isMcq){
 var a={id:"A-"+Date.now(),qid:q.id,created:iso(),correct:!!ok,hint:hintShown,focus:state.focus,domain:q.domain,unit:q.unit,level:q.level,answer:answer,errorCode:"",explained:false};
 state.attempts.push(a);
 if(!ok)schedule(q.id,1);else if(hintShown)schedule(q.id,3);
 if(reviewId&&ok&&!hintShown){reviewPass(reviewId);}else if(reviewId&&!ok){var rr=state.reviews.find(function(x){return x.id===reviewId;});if(rr){rr.successes=0;rr.due=day(1);rr.lastResult="fail";}}
 save();result={attemptId:a.id,ok:ok};
 var f=document.getElementById("feedbackHost");
 var exp=isMcq?(ok?q.explanation:'正解は「'+q.answer+'」。'+(q.explanation||"")):(q.model||"");
 var x='<div class="feedback '+(ok?"good":"bad")+'"><strong>'+(ok?"正解":"再確認")+'</strong><p>'+esc(exp)+'</p>';
 if(!ok)x+='<div><strong>今回はどこで止まった？</strong><div class="error-grid">'+Object.keys(ERR).map(function(k){return '<button class="error-btn" onclick="App.setError(\''+k+'\')">'+k+' '+esc(ERR[k])+'</button>';}).join("")+'</div></div>';
 if(ok)x+='<div class="why-box"><strong>なぜ？</strong><p>この答えにした根拠を1〜2文で説明してから次へ進もう。</p><textarea id="whyText" style="min-height:90px" placeholder="根拠・因果関係を書く"></textarea><div class="qactions"><button class="btn secondary" onclick="App.explained()">説明できた</button></div></div>';
 x+='<div class="qactions"><button class="btn" onclick="App.next()">次の問題</button></div></div>';f.innerHTML=x;
}
function setError(k){var a=state.attempts.find(function(x){return result&&x.id===result.attemptId;});if(!a)return;a.errorCode=k;save();Array.prototype.forEach.call(document.querySelectorAll(".error-btn"),function(b){b.classList.toggle("selected",b.textContent.indexOf(k+" ")===0);});toast(k+"："+ERR[k]);}
function explained(){var t=(document.getElementById("whyText")||{}).value||"";if(t.trim().length<5){toast("1〜2文で根拠を書こう");return;}var a=state.attempts.find(function(x){return result&&x.id===result.attemptId;});if(a){a.explained=true;a.explanation=t;save();toast("説明を記録しました");}}
function schedule(qid,days){
 var r=state.reviews.find(function(x){return !x.done&&x.qid===qid;});
 if(!r){state.reviews.push({id:"R-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),qid:qid,created:iso(),due:day(days),successes:0,done:false,lastResult:null});}
 else if(new Date(r.due)>new Date(day(days)))r.due=day(days);
}
function reviewPass(id){var r=state.reviews.find(function(x){return x.id===id;});if(!r)return;r.successes=(r.successes||0)+1;r.lastResult="pass";if(r.successes>=2){r.done=true;r.doneAt=iso();}else r.due=day(3);}
function next(){if(reviewId){startReview();}else{q=pick(track);hintShown=false;choice=null;result=null;renderQ();}}
function review(){
 var ds=due(),ac=active();
 var rows=ds.length?ds.slice(0,30).map(function(r){var z=E.get(r.qid);return '<div class="due-item"><div><strong>'+esc(z?z.unit:r.qid)+'</strong><div class="muted small">'+esc(z?z.domain:"")+' / 成功 '+(r.successes||0)+'/2</div></div><button class="btn secondary" onclick="App.startReview(\''+r.id+'\')">解く</button></div>';}).join(""):'<div class="empty">期限が来た再テストはありません。</div>';
 return header("誤答・再テスト","ヒントなし＋説明できる状態を2回再現して卒業")+'<div class="grid cols-3">'+metric("期限到来",ds.length+"問","今日やる")+metric("追跡中",ac.length+"問","未卒業")+metric("卒業済み",state.reviews.filter(function(r){return r.done;}).length+"問","2回再現")+'</div><div class="section-head"><h2>今日の再テスト</h2></div><div class="card">'+rows+'</div><div id="questionHost"></div>';
}
function startReview(id){
 var r=id?state.reviews.find(function(x){return x.id===id;}):due()[0];if(!r){toast("期限到来の再テストはありません");return;}reviewId=r.id;track="review";state.focus=true;q=E.get(r.qid);hintShown=false;choice=null;result=null;view="review";nav();render();setTimeout(renderQ,0);
}
function tests(){
 var rows=state.tests.slice().sort(function(a,b){return String(b.date).localeCompare(String(a.date));}).map(function(t){var gap=t.alphaCut!==""?Math.max(0,num(t.alphaCut)-num(t.total)):"—";return '<tr><td>'+esc(t.date)+'</td><td>'+esc(t.name)+'</td><td>'+esc(t.total||"—")+'</td><td>'+esc(t.alphaCut||"—")+'</td><td>'+esc(gap)+'</td><td>'+esc(t.social||"—")+'/'+esc(t.socialMax||"—")+'</td><td>70%↑ '+num(t.lost70)+' / 50–70% '+num(t.lost50)+'</td><td><button class="btn ghost" onclick="App.deleteTest(\''+t.id+'\')">削除</button></td></tr>';}).join("");
 return header("SAPIXテスト記録","α1基準は予測せず、実際に判明した値だけを使う")+
 '<div class="card"><h2>テストを追加</h2><div class="form-grid">'+field("tName","テスト名","text")+field("tDate","実施日","date")+field("tTotal","4科得点","number")+field("tCut","実際のα1基準点","number")+field("tSocial","社会得点","number")+field("tSocialMax","社会満点","number","100")+field("t70","正答率70%以上で落とした点","number","0")+field("t50","正答率50〜70%で落とした点","number","0")+field("t30","正答率30〜50%で落とした点","number","0")+field("tTime","時間切れで失った点","number","0")+'</div><div class="qactions"><button class="btn" onclick="App.addTest()">記録する</button></div></div>'+
 '<div class="section-head"><h2>記録</h2></div><div class="table-wrap"><table class="table"><thead><tr><th>日付</th><th>テスト</th><th>4科</th><th>α1実基準</th><th>差</th><th>社会</th><th>優先回収</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="8">まだ記録がありません。</td></tr>')+'</tbody></table></div><div class="notice" style="margin-top:14px">優先順位：①70%以上の取りこぼし → ②50〜70% → ③30〜50% → ④30%未満の難問。</div>';
}
function field(id,label,type,val){return '<div class="field"><label>'+esc(label)+'</label><input id="'+id+'" type="'+type+'" '+(val!=null?'value="'+val+'"':"")+'></div>';}
function addTest(){function g(id){var e=document.getElementById(id);return e?e.value:"";}var name=g("tName").trim(),date=g("tDate");if(!name||!date){toast("テスト名と日付を入力");return;}state.tests.push({id:"T-"+Date.now(),name:name,date:date,total:g("tTotal"),alphaCut:g("tCut"),social:g("tSocial"),socialMax:g("tSocialMax"),lost70:g("t70"),lost50:g("t50"),lost30:g("t30"),timeLost:g("tTime"),created:iso()});save();render();toast("テストを記録しました");}
function deleteTest(id){if(!confirm("このテスト記録を削除しますか？"))return;state.tests=state.tests.filter(function(t){return t.id!==id;});save();render();}
function parent(){
 var a=recent(45),errs={};Object.keys(ERR).forEach(function(k){errs[k]=a.filter(function(x){return x.errorCode===k;}).length;});
 var domains=["地理","最難関","歴史","公民"].map(function(d){return [d,mastery(d)];});
 var weak=domains.filter(function(x){return x[1].n>=3;}).sort(function(x,y){return x[1].p-y[1].p;}).slice(0,2);
 var eTop=Object.keys(errs).sort(function(x,y){return errs[y]-errs[x];})[0];
 return header("保護者ダッシュボード","正解数より、再現性・説明・誤答の型を見る")+
 '<div class="grid cols-4">'+metric("45日演習",a.length+"問","量を増やしすぎない")+metric("期限到来",due().length+"問","再テスト優先")+metric("ヒント後正解",a.filter(function(x){return x.correct&&x.hint;}).length+"問","△問題")+metric("説明未完",a.filter(function(x){return x.correct&&!x.explained;}).length+"問","理解済みにしない")+'</div>'+
 '<div class="section-head"><h2>分野</h2></div><div class="grid cols-4">'+domains.map(function(x){return metric(x[0],x[1].p+"%",x[1].n+"問");}).join("")+'</div>'+
 '<div class="section-head"><h2>今直すこと</h2><span class="muted small">最大2個</span></div><div class="grid cols-2">'+(weak.length?weak.map(function(x){return '<div class="card"><h3>'+esc(x[0])+' 正答率 '+x[1].p+'%</h3><p class="muted">期限到来の再テストを先に行い、根拠を自分の言葉で説明できるか確認。</p></div>';}).join(""):'<div class="card"><p class="muted">まだ十分な演習データがありません。</p></div>')+(eTop&&errs[eTop]?'<div class="card"><div class="metric-label">最多誤答原因</div><h3>'+eTop+'：'+esc(ERR[eTop])+'（'+errs[eTop]+'回）</h3></div>':"")+'</div><div class="section-head"><h2>α1</h2></div>'+alphaCard();
}
function curriculum(){
 return header("52週カリキュラム","SAPIX公式進度表ではなく、このアプリ内の年間学習設計")+
 '<div class="notice">小4の通常運用では地理・資料を優先。歴史・公民はSAPIXの復習を圧迫しない範囲の先取りです。</div><div class="section-head"><h2>現在 Week '+state.settings.week+'</h2></div><div class="curriculum">'+D.curriculum.map(function(w){return '<div class="week" '+(w.week===state.settings.week?'style="border-color:var(--accent)"':"")+'><div class="week-no">W'+String(w.week).padStart(2,"0")+'</div><div><strong>'+esc(w.title)+'</strong><div class="muted">'+esc(w.objective)+'</div></div><button class="btn ghost" onclick="App.setWeek('+w.week+')">設定</button></div>';}).join("")+'</div>';
}
function setWeek(w){state.settings.week=Math.max(1,Math.min(52,w));save();render();toast("Week "+w+" に設定");}
function settings(){
 return header("設定","学習データはこの端末内に保存")+
 '<div class="grid cols-2"><div class="card"><h2>学習設定</h2><div class="form-grid">'+field("sDaily","1日の目標問題数","number",state.settings.daily)+field("sWeek","現在の週","number",state.settings.week)+'</div><label style="display:flex;gap:9px;align-items:center;margin-top:14px"><input id="sAhead" type="checkbox" '+(state.settings.includeAhead?"checked":"")+'> デイリーに歴史・公民を少量混ぜる</label><div class="qactions"><button class="btn" onclick="App.saveSettings()">保存</button></div></div><div class="card"><h2>データ</h2><p class="muted">答案・履歴・テスト入力値はLocalStorageに保存し、外部APIへ送信しません。</p><div class="qactions"><button class="btn secondary" onclick="App.exportData()">JSONバックアップ</button><label class="btn secondary">JSON復元<input type="file" accept="application/json" hidden onchange="App.importData(event)"></label><button class="btn ghost" onclick="App.reset()">初期化</button></div></div></div>'+
 '<div class="section-head"><h2>品質上の注意</h2></div><div class="card"><ul class="muted" style="line-height:1.9"><li>418問は本アプリ用のオリジナル問題です。</li><li>記述のキーワード検出は採点ではありません。必要要素を本人・保護者が判断します。</li><li>α1基準点は予測せず、実測値だけ記録します。</li><li>最新統計・時事は固定収録せず、古い数値の暗記を避けます。</li></ul></div>';
}
function saveSettings(){state.settings.daily=Math.max(4,Math.min(30,num(document.getElementById("sDaily").value)||12));state.settings.week=Math.max(1,Math.min(52,num(document.getElementById("sWeek").value)||1));state.settings.includeAhead=!!document.getElementById("sAhead").checked;save();render();toast("設定を保存しました");}
function exportData(){var blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="social_lab_v02_"+new Date().toISOString().slice(0,10)+".json";a.click();setTimeout(function(){URL.revokeObjectURL(a.href);},500);}
function importData(ev){var f=ev.target.files&&ev.target.files[0];if(!f)return;var r=new FileReader();r.onload=function(){try{var x=JSON.parse(r.result);if(x.version!==2)throw new Error();state=x;save();render();toast("復元しました");}catch(e){toast("v02バックアップとして読み込めません");}};r.readAsText(f);}
function reset(){if(!confirm("学習履歴・テスト記録をすべて初期化しますか？"))return;localStorage.removeItem(KEY);state=clone(def);render();toast("初期化しました");}
function installHelp(){document.getElementById("modalRoot").innerHTML='<div class="modal-backdrop" onclick="if(event.target===this)App.closeModal()"><div class="modal"><h2>iPadのホーム画面に追加</h2><ol style="line-height:2"><li>このHTTPS版をSafariで開く</li><li>共有ボタンをタップ</li><li>「ホーム画面に追加」</li><li>「追加」</li></ol><p class="muted">初回読み込み後は主要ファイルをオフラインでも利用できます。</p><button class="btn" onclick="App.closeModal()">閉じる</button></div></div>';}
function closeModal(){document.getElementById("modalRoot").innerHTML="";}
function render(){var m=document.getElementById("main");if(!m)return;var h=view==="home"?home():view==="practice"?practice():view==="review"?review():view==="tests"?tests():view==="parent"?parent():view==="curriculum"?curriculum():settings();m.innerHTML=h;if(q&&(view==="practice"||view==="review"))setTimeout(renderQ,0);}
window.App={show:show,start:start,choose:choose,hint:hint,submit:submit,judgeShort:judgeShort,model:model,setError:setError,explained:explained,next:next,startReview:startReview,addTest:addTest,deleteTest:deleteTest,setWeek:setWeek,saveSettings:saveSettings,exportData:exportData,importData:importData,reset:reset,installHelp:installHelp,closeModal:closeModal};
nav();render();
if("serviceWorker" in navigator)window.addEventListener("load",function(){navigator.serviceWorker.register("./sw.js").catch(function(){});});
})();