(() => {
  'use strict';
  const $=(q,root=document)=>root.querySelector(q);
  const $$=(q,root=document)=>[...root.querySelectorAll(q)];
  const STORAGE_KEY='sansuo_champion_state_v2';
  const LEGACY_KEY='sansuo_champion_state_v1';
  const localDateString=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const defaultState={
    profile:{name:'挑戦者',grade:4,target:'ジュニア算オリ全国上位'},
    route:'home',activeTrack:'all',activeLevel:'all',activeTopic:'',listLimit:40,currentProblem:null,problemMode:'practice',
    hintsShown:0,solutionOpen:false,backgroundOpen:false,aiFree:false,sound:false,
    stats:{},journal:{},bookmarks:[],streak:1,lastStudy:null,xp:0,startedAt:null,sessionWrong:0,
    curriculumStart:localDateString(),studyLog:[],recentFamilies:[],mock:null,mockHistory:[]
  };
  const topicCounts=new Map();
  for(const p of PROBLEMS)for(const tag of new Set(p.tags))topicCounts.set(tag,(topicCounts.get(tag)||0)+1);
  const topicOptions=[...topicCounts.keys()].sort((a,b)=>topicCounts.get(b)-topicCounts.get(a)||(a<b?-1:a>b?1:0));
  let state=loadState();
  if(typeof location!=='undefined'&&/(?:^|[?&])home=1(?:&|$)/.test(location.search||'')){
    state.route='home';state.currentProblem=null;
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));history.replaceState(null,'',location.pathname+location.hash)}catch(e){}
  }
  if(!topicCounts.has(state.activeTopic))state.activeTopic='';
  let drawingTimer=null;

  const navItems=[
    ['home','⌂','4科ホーム'],['challenge','✎','算数に挑戦'],['curriculum','◫','算数52週'],['library','◇','算数の型'],
    ['review','↻','算数復習'],['analysis','▥','学習分析'],['settings','⚙','設定']
  ];
  const bottomItems=[['home','⌂','4科'],['challenge','✎','算数'],['curriculum','◫','52週'],['review','↻','復習'],['analysis','▥','分析']];
  const trackInfo={
    school:{name:'最難関中学算数',short:'最難関',desc:'学校別に分けず、最難関中学に共通する条件整理・整数・図形・場合の数・速さを統合。',class:'school'},
    junior:{name:'ジュニア算数オリンピック対応',short:'ジュニア',desc:'小学4年修了程度を土台に、発見・不変量・鳩ノ巣・ゲーム・再帰・論理を鍛える。',class:'junior'},
    olympiad:{name:'算数オリンピック対応',short:'算数オリ',desc:'数論・組合せ・極値・構成・一般化へ。公式名や定理を先に覚えず、問題から構造を発見する。',class:'olympiad'}
  };
  const skills=[
    ['条件整理','文章を図・表・式へ変換し、必要条件を見える形にする。'],['逆向き思考','ゴールや負け状態から直前へ戻る。'],
    ['不変量','操作しても変わらない偶奇・色・個数などを探す。'],['鳩ノ巣原理','分類の箱数と対象数だけで「必ず」を証明する。'],
    ['場合分け','重なりなく、漏れなく分けて数える。'],['対応付け','数えにくい対象を1対1で数えやすい対象へ移す。'],
    ['再帰','小さい同型問題へ戻して規則を作る。'],['彩色','色の個数や配置を不変量として使う。'],
    ['構成','存在を言うだけでなく、実際の作り方を示す。'],['極値','最大・最小を、改善操作や平均から証明する。'],
    ['一般化','具体的数字を文字や構造に置き換える。'],['情報量','1回の操作が候補を何通りに分けるかを見る。']
  ];

  function loadState(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY)||localStorage.getItem(LEGACY_KEY);
      const saved=raw?JSON.parse(raw):{};
      return deepMerge(structuredClone(defaultState),saved||{});
    }catch(e){return structuredClone(defaultState)}
  }
  function deepMerge(a,b){for(const k of Object.keys(b||{})){if(b[k]&&typeof b[k]==='object'&&!Array.isArray(b[k])&&a[k])a[k]=deepMerge(a[k],b[k]);else a[k]=b[k]}return a}
  function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}catch(e){}renderProfileMini()}
  function stat(id){
    if(!state.stats[id])state.stats[id]={attempts:0,correct:0,noHintCorrect:0,hints:0,solved:false,explained:false,last:null,nextReview:null,quality:null,lastSeconds:null,errors:{},reviewStage:0};
    if(state.stats[id].reviewStage==null)state.stats[id].reviewStage=0;
    return state.stats[id]
  }
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  function toast(msg){const el=$('#toast');if(!el)return;el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),1900)}
  function navigate(route){state.route=route;state.currentProblem=null;if(route!=='challenge'&&state.mock?.active){}save();render();window.scrollTo(0,0)}
  function activeProblem(){return PROBLEMS.find(p=>p.id===state.currentProblem)}
  function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function normalize(s){return String(s).trim().toLowerCase().replace(/\s+/g,'').replace(/[，,]/g,'').replace(/です|。/g,'')}
  function fmtTime(sec){sec=Math.max(0,Math.round(sec||0));return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0')}
  function targetSeconds(p){return ({1:180,2:240,3:360,4:540,5:720})[p.level]||360}
  function dateFromString(s){const [y,m,d]=String(s).split('-').map(Number);return new Date(y,m-1,d)}
  function today(){return localDateString()}
  function currentWeekIndex(){const a=dateFromString(state.curriculumStart||today()),b=dateFromString(today());return clamp(Math.floor((b-a)/86400000/7)+1,1,52)}
  function currentPlan(){return CURRICULUM_WEEKS[currentWeekIndex()-1]||CURRICULUM_WEEKS[0]}
  function weekBounds(w=currentWeekIndex()){
    const start=dateFromString(state.curriculumStart||today());start.setDate(start.getDate()+(w-1)*7);const end=new Date(start);end.setDate(end.getDate()+7);return [start,end]
  }
  function eventsThisWeek(){const [a,b]=weekBounds();return (state.studyLog||[]).filter(e=>{const t=new Date(e.at);return t>=a&&t<b})}
  function weekActivity(){
    const ev=eventsThisWeek();
    return {newCount:new Set(ev.filter(e=>e.firstExposure).map(e=>e.id)).size,reviewCount:ev.filter(e=>e.mode==='review').length,explainCount:ev.filter(e=>e.type==='explain').length,minutes:Math.round(ev.reduce((s,e)=>s+(e.seconds||0),0)/60)}
  }
  function readLocalJSON(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch(e){return null}}
  function isTodayTimestamp(value){if(!value)return false;const d=new Date(value);return Number.isFinite(d.getTime())&&localDateString(d)===today()}
  function alpha1FocusKeywords(){
    const dash=readLocalJSON('sansuo_parent_dashboard_v1')||{};
    const analyses=Array.isArray(dash.sapixAnalyses)?dash.sapixAnalyses.slice():[];
    analyses.sort((a,b)=>String(b&&b.date||'').localeCompare(String(a&&a.date||''))||String(b&&b.importedAt||'').localeCompare(String(a&&a.importedAt||'')));
    const latest=analyses[0]||null;
    return latest&&Array.isArray(latest.focusKeywords)?latest.focusKeywords.filter(Boolean).slice(0,12):[];
  }
  function integratedTodayItems(){
    const metadata={math:{kicker:'MATH',href:'',cls:'school',action:'算数を始める'},japanese:{kicker:'JAPANESE',href:'./japanese/',cls:'kokugo',action:'国語へ'},science:{kicker:'SCIENCE',href:'./science/',cls:'junior',action:'理科へ'},social:{kicker:'SOCIAL',href:'./social/',cls:'olympiad',action:'社会へ'}};
    return window.AdaptiveQuality.current(state).items.map(x=>({...x,...metadata[x.id]}));
  }
  function alpha1Gate(){
    const items=integratedTodayItems();
    return {
      items,
      due:items.reduce((s,x)=>s+x.due,0),
      complete:items.filter(x=>x.remaining===0&&x.due===0).length,
      allDone:items.every(x=>x.remaining===0&&x.due===0)
    };
  }
  function alpha1MissionSection(){
    const g=alpha1Gate();
    const stateText=g.allDone?'きょうのクエスト、ぜんぶクリア！チャレンジ問題がひらきました。':g.due>0?('まず復習 '+g.due+'問。終わったら次のクエストへ！'):('4科中 '+g.complete+'/4科クリア。つぎの科目へ！');
    return '<section class="section"><div class="card"><div class="tag-row"><span class="tag gold">きょうのクエスト</span><span class="tag">できたらチャレンジ</span></div><div class="track-title" style="margin-top:10px">まず今日のぶんをクリア</div><div class="track-desc">'+stateText+'<br>むずかしい問題を急がず、復習と今日のぶんを順番に進めます。</div></div></section>';
  }
  function integratedTodaySection(){
    const items=integratedTodayItems();
    const cards=items.map((x,i)=>{
      const status=x.due?('期限復習 '+x.due+'問'):x.remaining===0?'今日分完了':(x.normal+' 残り'+x.remaining+'問');
      const width=Math.min(100,Math.round(x.done/Math.max(1,x.target)*100));
      const action=x.id==='math'
        ? '<button class="btn small primary" data-integrated-math="'+(x.due?'review':'daily')+'">'+x.action+' →</button>'
        : '<a class="btn small primary" href="'+x.href+'" style="text-decoration:none;display:inline-flex">'+x.action+' →</a>';
      return '<article class="card track-card '+x.cls+'"><div class="track-kicker">優先'+(i+1)+'｜'+x.kicker+'</div><div class="track-title">'+x.name+'</div><div class="track-desc"><b>'+status+'</b><br>今日 '+x.done+' / '+x.target+'問<br>'+x.actionHint+'</div><div class="progress" style="margin:8px 0"><span style="width:'+width+'%"></span></div><div class="tag-row">'+(x.due?'<span class="tag gold">復習期限あり</span>':'<span class="tag green">通常メニュー</span>')+'</div><div style="margin-top:8px">'+action+'</div></article>';
    }).join('');
    return '<section class="section"><div class="section-head"><div><div class="section-title">きょうの4科クエスト</div><div class="section-note">これまでの取り組みから今日の順番を選びました。まず1問、ひと区切りずつ！</div></div></div><div class="today-subject-grid">'+cards+'</div></section>';
  }
  function isMastered(s){return !!(s&&s.solved&&s.explained&&s.noHintCorrect>0&&(s.reviewStage||0)>=2)}
  function masteredCount(){return Object.values(state.stats).filter(isMastered).length}
  function attemptedCount(){return Object.values(state.stats).filter(s=>s.attempts>0).length}
  function logEvent(e){state.studyLog=state.studyLog||[];state.studyLog.push({at:new Date().toISOString(),...e});if(state.studyLog.length>2500)state.studyLog=state.studyLog.slice(-2500)}

  function renderNav(){
    $('#nav').innerHTML=navItems.map(([r,i,l])=>`<button class="nav-item ${state.route===r?'active':''}" data-route="${r}"><span class="nav-icon">${i}</span>${l}</button>`).join('');
    $('#bottomNav').innerHTML=bottomItems.map(([r,i,l])=>`<button class="bottom-item ${state.route===r?'active':''}" data-route="${r}"><span>${i}</span>${l}</button>`).join('');
    $$('[data-route]').forEach(b=>b.onclick=()=>navigate(b.dataset.route));
  }
  function renderProfileMini(){
    const el=$('#profileMini');if(!el)return;const m=masteredCount(),a=attemptedCount(),w=currentWeekIndex();
    el.innerHTML=`<div style="font-weight:900">${escapeHtml(state.profile.name)} <span class="tag" style="float:right">小${state.profile.grade}</span></div><div class="metric-foot">W${String(w).padStart(2,'0')} ・ 定着 ${m}問 ・ 挑戦 ${a}問</div><div class="progress"><span style="width:${Math.min(100,m/Math.max(1,PROBLEMS.length)*100)}%"></span></div>`;
  }
  function render(){
    renderNav();renderProfileMini();const main=$('#main');
    if(state.route==='home')main.innerHTML=homeView();
    if(state.route==='challenge')main.innerHTML=challengeView();
    if(state.route==='curriculum')main.innerHTML=curriculumView();
    if(state.route==='library')main.innerHTML=libraryView();
    if(state.route==='review')main.innerHTML=reviewView();
    if(state.route==='analysis')main.innerHTML=analysisView();
    if(state.route==='settings')main.innerHTML=settingsView();
    bindCommon();if(state.route==='challenge'&&state.currentProblem)bindProblem();
  }

  function abilityScore(){
    const vals=Object.values(state.stats).filter(s=>s.attempts>0);if(!vals.length)return 45;
    const attempts=vals.reduce((a,s)=>a+s.attempts,0)||1,correct=vals.reduce((a,s)=>a+s.correct,0),noHint=vals.reduce((a,s)=>a+s.noHintCorrect,0);
    const solved=vals.filter(s=>s.solved).length,explained=vals.filter(s=>s.explained).length,mastered=vals.filter(isMastered).length;
    const score=35+22*correct/attempts+18*noHint/Math.max(1,correct)+12*explained/Math.max(1,solved)+13*mastered/Math.max(1,solved);
    return Math.round(clamp(score,35,99));
  }
  function targetLevel(){const w=currentWeekIndex(),base=w<=8?2:w<=24?3:w<=40?4:4;return clamp(base+(abilityScore()>=78?1:0),2,5)}
  function weaknessMap(){
    const out={};PROBLEMS.forEach(p=>{const s=state.stats[p.id];if(!s||!s.attempts)return;const penalty=(s.attempts-s.correct)+s.hints*.5+(s.quality==='△'?1:0);p.tags.forEach(t=>out[t]=(out[t]||0)+penalty)});return out
  }
  function adaptiveScore(p){
    const s=stat(p.id),plan=currentPlan(),weak=weaknessMap(),now=Date.now(),alphaWords=alpha1FocusKeywords();let score=0;
    if(s.nextReview&&new Date(s.nextReview).getTime()<=now)score+=190;
    if(!s.attempts)score+=65;else if(!isMastered(s))score+=24;else score-=70;
    if(plan.families.includes(p.family))score+=95;
    const hit=plan.focusTags.filter(t=>p.tags.includes(t)).length;score+=hit*28;
    score+=(plan.trackRatio[p.track]||0)/4;
    score-=Math.abs(p.level-targetLevel())*14;
    score+=p.tags.reduce((z,t)=>z+Math.min(30,(weak[t]||0)*5),0);
    const alphaHaystack=[p.title,p.familyName,p.family].concat(p.tags||[]).join(' ');
    alphaWords.forEach(word=>{if(word&&alphaHaystack.includes(word))score+=70});
    if((state.recentFamilies||[]).slice(-3).includes(p.family))score-=50;
    if(p.source==='engine')score+=2;
    return score;
  }
  function recommended(limit=4,pool=PROBLEMS){return [...pool].map(p=>[p,adaptiveScore(p)]).sort((a,b)=>b[1]-a[1]||a[0].id.localeCompare(b[0].id)).slice(0,limit).map(x=>x[0])}
  function homeRecommendations(limit=4,pool=PROBLEMS){
    const ranked=recommended(pool.length,pool),now=Date.now();
    const urgent=p=>{const due=stat(p.id).nextReview;return due&&new Date(due).getTime()<=now};
    // Due reviews cannot be displaced by variety; keep adaptive order within each tier.
    const selected=ranked.filter(urgent).slice(0,limit);
    const remaining=ranked.filter(p=>!urgent(p));
    const family=p=>p.family||p.familyName||'旗艦';
    while(selected.length<limit&&remaining.length){
      const families=new Set(selected.map(family)),titles=new Set(selected.map(p=>p.title));
      let index=remaining.findIndex(p=>!families.has(family(p))&&!titles.has(p.title));
      if(index<0)index=remaining.findIndex(p=>!families.has(family(p)));
      if(index<0)index=remaining.findIndex(p=>!titles.has(p.title));
      selected.push(remaining.splice(index<0?0:index,1)[0]);
    }
    return selected;
  }
  function weekRecommendations(limit=7){
    const plan=currentPlan();let pool=PROBLEMS.filter(p=>!isMastered(stat(p.id))&&(plan.families.length===0||plan.families.includes(p.family)||plan.focusTags.some(t=>p.tags.includes(t))));
    if(pool.length<limit)pool=PROBLEMS.filter(p=>!isMastered(stat(p.id)));return recommended(limit,pool)
  }

  function homeView(){
    const plan=currentPlan(),act=weekActivity(),rec=homeRecommendations(4),m=masteredCount(),noHint=Object.values(state.stats).reduce((a,s)=>a+(s.noHintCorrect||0),0),due=dueReviews().length,g=alpha1Gate();
    return `<header class="page-head"><div><h1 class="page-title">きょうの4科クエスト</h1><div class="page-sub">算数・国語・理科・社会を、今日やる順に</div></div><div class="page-actions"><button class="btn primary" id="startDaily">算数を始める</button></div></header>
      <section class="hero"><div class="hero-row"><div class="hero-main"><div class="tag-row"><span class="tag gold">きょうのぶん</span><span class="tag">復習から</span><span class="tag purple">できたらチャレンジ</span></div><h2>今日のぶんを<br>ひとつずつクリアしよう！</h2><p>まず復習から。4科の今日のぶんを終えたら、チャレンジ問題がひらきます。これまでのまちがいを見ながら、次の問題も自動で選びます。</p></div><div class="hero-score"><div class="score-label">TODAY'S QUEST</div><div class="score-big">${g.complete}<span style="font-size:20px"> / 4科</span></div><div class="score-label">完了科目</div><div class="score-change">期限復習 ${g.due}問</div></div></div></section>
      ${alpha1MissionSection()}
      ${integratedTodaySection()}
      <section class="section"><div class="section-head"><div class="section-title">4科ステージ</div><div class="section-note">ここから1タップで科目を切り替え</div></div><div class="subject-launcher-grid">
        <article class="card track-card school" aria-current="page"><div class="track-kicker">MATH</div><div class="track-title">算数</div><div class="track-desc">438問・52週。条件整理・整数・図形などを、少しずつ得意にする。</div><div class="tag-row"><span class="tag green">いま開いています</span></div></article>
        <a class="card track-card kokugo" href="./japanese/" style="text-decoration:none;color:inherit;display:block" aria-label="国語Labを開く"><div class="track-kicker">JAPANESE</div><div class="track-title">国語</div><div class="track-desc">180問・52週。ことば、論理、長文、根拠記述、40分チャレンジ。</div><div class="tag-row"><span class="tag gold">国語Labへ →</span></div></a>
        <a class="card track-card junior" href="./science/" style="text-decoration:none;color:inherit;display:block" aria-label="理科ラボを開く"><div class="track-kicker">SCIENCE</div><div class="track-title">理科</div><div class="track-desc">100問。復習・実験考察・口頭試問・AIなしテスト。</div><div class="tag-row"><span class="tag purple">理科ラボへ →</span></div></a>
        <a class="card track-card olympiad" href="./social/" style="text-decoration:none;color:inherit;display:block" aria-label="社会Labを開く"><div class="track-kicker">SOCIAL</div><div class="track-title">社会</div><div class="track-desc">418問。地理を中心に、資料を読んで理由まで説明する。</div><div class="tag-row"><span class="tag gold">社会Labへ →</span></div></a>
      </div></section>
      <section class="section"><div class="section-head"><div><div class="section-title">算数｜今週のテーマ</div><div class="section-note">W${String(plan.week).padStart(2,'0')}｜${plan.phase}</div></div><button class="btn ghost" id="startMock" ${g.allDone?'':'disabled'}>${g.allDone?'チャレンジ：60分・独自競技模試':'4科クエストクリアで解放'}</button></div><div class="card"><div class="track-kicker">MATH</div><div class="track-title">${plan.title}</div><div class="track-desc">${plan.phaseGoal}</div><div class="tag-row"><span class="tag">思考指数 ${abilityScore()}</span><span class="tag">定着 ${m}問</span><span class="tag">自力正解 ${noHint}回</span></div></div></section>
      <section class="section"><div class="section-head"><div class="section-title">今週の進捗</div><div class="section-note">量より再現性</div></div><div class="grid cols-4">
        <div class="card"><div class="metric-label">新規挑戦</div><div class="metric-value">${act.newCount}<small> / ${plan.newTarget}</small></div><div class="progress"><span style="width:${Math.min(100,act.newCount/plan.newTarget*100)}%"></span></div></div>
        <div class="card"><div class="metric-label">再テスト</div><div class="metric-value">${act.reviewCount}<small> / ${plan.reviewTarget}</small></div><div class="progress"><span style="width:${Math.min(100,act.reviewCount/Math.max(1,plan.reviewTarget)*100)}%"></span></div></div>
        <div class="card"><div class="metric-label">説明保存</div><div class="metric-value">${act.explainCount}</div><div class="metric-foot">「なぜ」を言葉にする</div></div>
        <div class="card"><div class="metric-label">今日の復習待ち</div><div class="metric-value">${due}</div><div class="metric-foot">間隔反復</div></div>
      </div></section>
      <section class="section"><div class="section-head"><div class="section-title">今日の4問</div><div class="section-note">週テーマ＋弱点＋未定着から自動選択</div></div><div class="grid cols-4">${rec.map(problemMini).join('')}</div></section>
      <section class="section"><div class="section-head"><div class="section-title">3つの競技トラック</div><div class="section-note">学校別に分けず能力で統合</div></div><div class="grid cols-3">${Object.entries(trackInfo).map(([k,t])=>`<article class="card track-card ${t.class}"><div class="track-kicker">${t.short}</div><div class="track-title">${t.name}</div><div class="track-desc">${t.desc}</div><div class="metric-foot">今週配分 ${plan.trackRatio[k]}%</div><button class="btn small" data-track-start="${k}">この領域へ</button></article>`).join('')}</div></section>`;
  }
  function problemMini(p){const s=stat(p.id);return `<article class="card clickable"><div class="tag-row"><span class="tag ${p.track==='olympiad'?'gold':p.track==='junior'?'purple':''}">${trackInfo[p.track].short}</span><span class="tag">${p.familyName||p.family||'旗艦'}</span></div><div class="reco-title">${p.title}</div><div class="reco-meta">難度 <span class="difficulty">${'★'.repeat(p.level)}${'☆'.repeat(5-p.level)}</span></div><div class="tag-row">${p.tags.slice(0,2).map(x=>`<span class="tag">${x}</span>`).join('')}</div><button class="btn small primary" data-open-problem="${p.id}">${isMastered(s)?'再挑戦':s.solved?'再確認':'挑戦する'}</button></article>`}

  function curriculumView(){
    const plan=currentPlan(),act=weekActivity(),weekRecs=weekRecommendations(plan.newTarget),phase=CURRICULUM_PHASES.find(x=>x.name===plan.phase);
    return `<header class="page-head"><div><h1 class="page-title">年間カリキュラム｜W${String(plan.week).padStart(2,'0')}</h1><div class="page-sub">小4から1年間。ジュニア算オリを主戦場にし、後半から算数オリ型へ接続。</div></div><div class="page-actions"><button class="btn primary" id="startWeekProblem">今週の1問を始める</button></div></header>
      <section class="hero curriculum-hero"><div class="hero-row"><div class="hero-main"><div class="tag-row"><span class="tag gold">PHASE ${CURRICULUM_PHASES.indexOf(phase)+1}</span><span class="tag">W${plan.week}</span>${plan.mock?'<span class="tag purple">診断・模試週</span>':''}</div><h2>${plan.phase}<br>${plan.title}</h2><p>${plan.phaseGoal}</p></div><div class="hero-score"><div class="score-label">WEEKLY LOAD</div><div class="score-big">${plan.minutes}</div><div class="score-label">分 / 週（目安）</div><div class="score-change">週4回 ・ 自力時間＞アプリ時間</div></div></div></section>
      <section class="section"><div class="section-head"><div class="section-title">今週の処方</div><div class="section-note">進み過ぎても未定着なら次週へ送らない</div></div><div class="grid cols-4">
        ${[['Session A','新問2＋再テスト1','35〜40分'],['Session B','新問2＋深掘り説明1','40〜45分'],['Session C','新問2＋再テスト1','35〜40分'],['Session D',plan.mock?'独自競技模試＋振り返り':'新問1＋転移1＋口頭説明','35〜60分']].map(x=>`<div class="card session-card"><div class="track-kicker">${x[0]}</div><div class="track-title" style="font-size:17px">${x[1]}</div><div class="metric-foot">${x[2]}</div></div>`).join('')}
      </div></section>
      <section class="section"><div class="section-head"><div class="section-title">今週の候補問題</div><div class="section-note">新問${act.newCount}/${plan.newTarget} ・ 再テスト${act.reviewCount}/${plan.reviewTarget}</div></div><div class="grid cols-4">${weekRecs.slice(0,8).map(problemMini).join('')}</div></section>
      <section class="section"><div class="section-head"><div class="section-title">52週ロードマップ</div><div class="section-note">新問計${CURRICULUM_META.plannedNew}問＋弱点・模試用予備プール</div></div>
      ${CURRICULUM_PHASES.map((ph,pi)=>`<div class="phase-block"><div class="phase-head"><b>PHASE ${pi+1}｜${ph.name}</b><span>${ph.start}〜${ph.end}週</span></div><div class="roadmap-grid">${CURRICULUM_WEEKS.filter(w=>w.week>=ph.start&&w.week<=ph.end).map(w=>`<div class="roadmap-week ${w.week===plan.week?'current':''}"><div class="week-num">W${String(w.week).padStart(2,'0')}</div><div><b>${w.title}</b><div>${w.focusTags.slice(0,3).join(' ・ ')}</div></div>${w.mock?'<span class="tag purple">診断</span>':''}</div>`).join('')}</div></div>`).join('')}</section>
      <section class="section"><div class="card legal-note"><b>大会との位置づけ</b><p>本アプリは独自教材で、算数オリンピック委員会の公式アプリではありません。公式過去問の本文は収録せず、思考特性を抽象化したオリジナル問題で訓練します。</p></div></section>`;
  }

  function challengeView(){
    if(state.currentProblem)return problemView(activeProblem());
    const filter=state.activeTrack,level=state.activeLevel,topic=state.activeTopic;
    let items=PROBLEMS.filter(p=>(filter==='all'||p.track===filter)&&(level==='all'||p.level===Number(level))&&(!topic||p.tags.includes(topic)));
    items=[...items].sort((a,b)=>adaptiveScore(b)-adaptiveScore(a)||a.id.localeCompare(b.id));
    const shown=items.slice(0,state.listLimit||40),mockSummary=state.mock?.finished?mockSummaryHtml(state.mock):'';
    return `<header class="page-head"><div><h1 class="page-title">問題エンジン｜${PROBLEM_BANK_META.total}問</h1><div class="page-sub">18問の旗艦問題＋30思考ファミリー×14段階＝420問。弱点と週テーマから順序を変えます。</div></div><div class="page-actions"><button class="btn gold" id="startMock">60分・12問 独自模試</button><button class="btn ${state.aiFree?'gold':'ghost'}" id="toggleAIFree">${state.aiFree?'試験モード ON':'試験モード'}</button></div></header>
      ${mockSummary}
      <div class="filter-row"><div class="tabbar"><button class="tab ${filter==='all'?'active':''}" data-filter="all">すべて</button>${Object.entries(trackInfo).map(([k,t])=>`<button class="tab ${filter===k?'active':''}" data-filter="${k}">${t.short}</button>`).join('')}</div><select class="select" id="levelFilter"><option value="all">難度すべて</option>${[1,2,3,4,5].map(n=>`<option value="${n}" ${String(level)===String(n)?'selected':''}>難度 ${'★'.repeat(n)}</option>`).join('')}</select><label for="topicFilter">単元・タグ</label><select class="select" id="topicFilter"><option value="">すべて</option>${topicOptions.map(tag=>`<option value="${escapeHtml(tag)}" ${topic===tag?'selected':''}>${escapeHtml(tag)}（${topicCounts.get(tag)}問）</option>`).join('')}</select><span id="filterResultCount" role="status">該当 ${items.length}問（表示 ${shown.length}問）</span></div>
      <div class="engine-note">表示順は固定ではありません。今週テーマ・復習期限・A〜G誤答・未挑戦・現在の適正難度から推薦スコアを計算しています。</div>
      <div class="challenge-list">${shown.map((p,i)=>{const s=stat(p.id);return `<div class="challenge-row"><div class="challenge-num">${String(i+1).padStart(2,'0')}</div><div><div class="challenge-name">${p.title}</div><div class="challenge-sub">${trackInfo[p.track].short} ・ ${p.familyName||p.family||'旗艦'} ・ ${p.tags.join(' / ')} ・ 難度${p.level}${isMastered(s)?' ・ 定着':s.solved?' ・ △再確認':''}</div></div><button class="btn small ${s.solved?'ghost':'primary'}" data-open-problem="${p.id}">${s.solved?'再挑戦':'挑戦'}</button></div>`}).join('')||'<div class="card" id="noFilterResults" role="status">条件に合う問題はありません。単元・タグ、難度、トラックの条件を変更してください。</div>'}</div>
      ${shown.length<items.length?`<div style="text-align:center;margin:18px"><button class="btn ghost" id="loadMore">さらに40問表示（残り${items.length-shown.length}）</button></div>`:''}`;
  }
  function mockSummaryHtml(m){const score=m.result?.score||0,total=m.result?.total||12;return `<section class="card mock-summary"><div><div class="track-kicker">前回の独自競技模試</div><div class="mock-score">${score}<span> / ${total}</span></div><div class="metric-foot">${m.result?.date||''} ・ ${m.result?.minutes||0}分</div></div><div><b>判定</b><p>${score>=10?'初見処理は高水準。誤答の解法選択と時間だけ精査する。':score>=7?'得点可能問題の取りこぼしを優先して修正する。':'難問追加より、入口の選択と再現性を優先する。'}</p><button class="btn small ghost" id="dismissMock">結果を閉じる</button></div></section>`}

  function problemView(p){
    const journal=state.journal[p.id]||'',mock=state.mock?.active&&state.problemMode==='mock',s=stat(p.id),mockIndex=mock?state.mock.ids.indexOf(p.id):-1;
    return `<header class="page-head"><div><button class="btn ghost small" id="backProblems">← ${mock?'模試を中断せず一覧':'問題一覧'}</button><h1 class="page-title" style="margin-top:12px">${p.title}</h1><div class="page-sub">${mock?`独自競技模試 Q${mockIndex+1}/${state.mock.ids.length}`:`${trackInfo[p.track].name} ・ ${p.familyName||p.family||'旗艦問題'}`}</div></div><div class="page-actions">${mock?'<button class="btn danger small" id="finishMock">模試を終了・採点</button>':`<button class="btn ghost small" id="bookmarkBtn">${state.bookmarks.includes(p.id)?'★ 保存済み':'☆ あとで'}</button>`}</div></header>
      <div class="problem-layout"><section class="card problem-card"><div class="problem-top"><div class="tag-row"><span class="tag ${p.track==='olympiad'?'gold':p.track==='junior'?'purple':''}">${trackInfo[p.track].short}</span>${p.tags.map(x=>`<span class="tag">${x}</span>`).join('')}</div><div style="text-align:right"><div class="difficulty">${'★'.repeat(p.level)}</div><div id="problemTimer" class="metric-foot">${mock?'60:00':'00:00 / '+fmtTime(targetSeconds(p))}</div></div></div>
      <div class="problem-body">${escapeHtml(p.prompt)}</div>${p.diagram?`<div class="problem-diagram">${p.diagram}</div>`:''}
      <div class="answer-box"><input id="answerInput" inputmode="text" autocomplete="off" placeholder="${mock?'答案を入力して保存':'答えを入力'}" value="${mock?escapeHtml(state.mock.answers[p.id]||''):''}"><button class="btn primary" id="submitAnswer">${mock?'答案を保存':'判定'}</button></div><div id="answerStatus" class="status-panel"></div>
      ${mock?`<div class="coach-box"><div class="coach-title">COMPETITION MODE</div><div class="coach-text">採点・ヒント・解説は終了まで表示しません。解けない問題は答案を空欄のまま次へ進めます。</div><div class="coach-actions"><button class="btn small ghost" id="mockPrev">← 前</button><button class="btn small primary" id="mockNext">次へ →</button></div></div>`:`<div class="coach-box"><div class="coach-title">COACH</div><div class="coach-text">${state.aiFree?'試験モードです。終了までヒント・解説を表示しません。':'最初の3分はヒント禁止。小さい例・図・表を自分で作ってください。'}</div><div class="coach-actions">${state.aiFree?'':`<button class="btn small ghost" id="hintBtn">ヒントを1つ見る</button><button class="btn small ghost" id="giveUpBtn">解説を見る</button>`}</div>${state.aiFree?'<div class="locked-note">試験会場の条件を再現しています。</div>':''}</div>
      ${!state.aiFree&&state.hintsShown?`<div class="hint-stack">${p.hints.slice(0,state.hintsShown).map((h,i)=>`<div class="hint"><b>ヒント${i+1}</b><br>${h}</div>`).join('')}</div>`:''}
      ${!state.aiFree&&state.solutionOpen?solutionHtml(p,journal):''}`}
      </section><aside class="card scratch-card"><div class="scratch-head"><div><div style="font-weight:900">考えるノート</div><div class="metric-foot">Apple Pencil / 指</div></div><div class="scratch-tools"><button class="tool active" data-tool="pen">✎</button><button class="tool" data-tool="eraser">⌫</button><button class="tool" data-tool="clear">×</button></div></div><div class="scratch-wrap"><canvas id="scratchCanvas"></canvas></div><div class="scratch-foot"><span>試行錯誤を消さずに残す</span><span>端末内処理</span></div></aside></div>`;
  }
  function solutionHtml(p,journal){return `<div class="solution"><div class="explain-gate"><label>自分の考えを1〜3文で説明する</label><textarea class="textarea" id="journalText" placeholder="なぜこの方法を選んだ？ どこが決め手だった？">${escapeHtml(journal)}</textarea><div class="coach-actions"><button class="btn small primary" id="saveJournal">説明を保存</button></div></div>
    ${journal?`<div style="margin-top:18px"><div class="section-title">解説</div>${p.solution.map((x,i)=>`<div class="solution-step"><div class="step-num">${i+1}</div><div>${x}</div></div>`).join('')}<div class="essence"><h4>この問題の本質</h4><div>${p.essence}</div></div><button class="btn small ghost" id="backgroundBtn" style="margin-top:12px">${state.backgroundOpen?'数学の背景を閉じる':'数学の本質・背景まで見る'}</button>${state.backgroundOpen?`<div class="background-box"><h4>数学の背景</h4><div>${p.background}</div><div style="margin-top:12px;color:#c8c0f4"><b>発展問い：</b>${p.transfer}</div></div>`:''}<div class="coach-actions" style="margin-top:16px"><button class="btn primary" id="nextRecommended">次のおすすめへ</button></div></div>`:`<div class="locked-note">説明を保存すると、解説と数学背景が開きます。</div>`}</div>`}

  function libraryView(){return `<header class="page-head"><div><h1 class="page-title">思考の型ライブラリ</h1><div class="page-sub">技法名は解いた後に与えます。暗記ではなく「初見で発見できるか」を評価。</div></div></header><div class="library-grid">${skills.map(s=>{const mastery=skillMastery(s[0]);return `<div class="card skill-card"><div class="skill-name">${s[0]}</div><div class="skill-desc">${s[1]}</div><div class="skill-meter"><span>定着度</span><b>${mastery}%</b></div><div class="progress"><span style="width:${mastery}%"></span></div></div>`}).join('')}</div>`}
  function skillMastery(skill){const ps=PROBLEMS.filter(p=>p.tags.includes(skill));if(!ps.length)return 0;const attempted=ps.filter(p=>stat(p.id).attempts>0);if(!attempted.length)return 0;return Math.round(attempted.reduce((a,p)=>a+(isMastered(stat(p.id))?100:stat(p.id).quality==='○'?65:stat(p.id).solved?35:0),0)/attempted.length)}

  function dueReviews(){const t=Date.now();return PROBLEMS.filter(p=>{const s=stat(p.id);return s.nextReview&&new Date(s.nextReview).getTime()<=t}).sort((a,b)=>new Date(stat(a.id).nextReview)-new Date(stat(b.id).nextReview))}
  function reviewView(){
    const due=dueReviews(),pending=PROBLEMS.filter(p=>stat(p.id).solved&&!isMastered(stat(p.id)));
    return `<header class="page-head"><div><h1 class="page-title">復習・弱点克服</h1><div class="page-sub">定着判定は「正解→説明→時間を空けて2回自力再現」。ヒント正解は△。</div></div>${due.length?'<button class="btn gold" id="startReview">期限が来た1問を試験モードで</button>':''}</header>
      <div class="grid cols-4"><div class="card"><div class="metric-label">今日の再テスト</div><div class="metric-value">${due.length}</div><div class="metric-foot">期限到来</div></div><div class="card"><div class="metric-label">定着途中</div><div class="metric-value">${pending.length}</div><div class="metric-foot">説明・遅延再現が未完</div></div><div class="card"><div class="metric-label">定着済み</div><div class="metric-value">${masteredCount()}</div><div class="metric-foot">2回以上の遅延再現</div></div><div class="card"><div class="metric-label">ブックマーク</div><div class="metric-value">${state.bookmarks.length}</div><div class="metric-foot">あとで深く考える</div></div></div>
      <section class="section"><div class="section-title">再テスト待ち</div><div class="challenge-list" style="margin-top:12px">${(due.length?due:pending.slice(0,30)).map((p,i)=>`<div class="challenge-row"><div class="challenge-num">${String(i+1).padStart(2,'0')}</div><div><div class="challenge-name">${p.title}</div><div class="challenge-sub">${p.familyName||p.family||'旗艦'} ・ 再現段階 ${stat(p.id).reviewStage||0}/2 ・ ${stat(p.id).hints?'ヒント使用歴あり':'自力確認'}</div></div><button class="btn small" data-open-review="${p.id}">AIなしで解く</button></div>`).join('')||'<div class="card">再テスト待ちはありません。新しい問題へ進みましょう。</div>'}</div></section>`;
  }

  function analysisView(){
    const vals=Object.values(state.stats).filter(s=>s.attempts>0),totalAttempts=vals.reduce((a,s)=>a+s.attempts,0),correct=vals.reduce((a,s)=>a+s.correct,0),noHint=vals.reduce((a,s)=>a+s.noHintCorrect,0);
    const accuracy=totalAttempts?Math.round(correct/totalAttempts*100):0,independence=correct?Math.round(noHint/correct*100):0;
    const byTrack=Object.keys(trackInfo).map(k=>{const ps=PROBLEMS.filter(p=>p.track===k&&stat(p.id).attempts>0),a=ps.reduce((x,p)=>x+stat(p.id).attempts,0),c=ps.reduce((x,p)=>x+stat(p.id).correct,0);return[k,a?Math.round(c/a*100):0]});
    const weak=Object.entries(weaknessMap()).sort((a,b)=>b[1]-a[1]).slice(0,6);
    const errorLabels={A:'A 読み違い',B:'B 知識不足',C:'C 方針',D:'D 論理',E:'E 計算',F:'F 整理',G:'G 時間'},errorTotals={};vals.forEach(st=>Object.entries(st.errors||{}).forEach(([k,v])=>errorTotals[k]=(errorTotals[k]||0)+v));const errorRank=Object.entries(errorTotals).sort((a,b)=>b[1]-a[1]);
    const familiesTried=new Set(PROBLEMS.filter(p=>stat(p.id).attempts>0).map(p=>p.family).filter(Boolean)).size;
    const mockLast=(state.mockHistory||[]).at(-1);
    return `<header class="page-head"><div><h1 class="page-title">記録と分析</h1><div class="page-sub">正答率より、自力・説明・遅延再現・誤答原因を分けて見る。</div></div></header>
      <div class="grid cols-4"><div class="card"><div class="metric-label">総合思考指数</div><div class="metric-value">${abilityScore()}</div><div class="metric-foot">発想・再現・説明</div></div><div class="card"><div class="metric-label">自力率</div><div class="metric-value">${independence}%</div><div class="metric-foot">正解のうちヒントなし</div></div><div class="card"><div class="metric-label">定着</div><div class="metric-value">${masteredCount()}</div><div class="metric-foot">遅延再現2回＋説明</div></div><div class="card"><div class="metric-label">思考ファミリー</div><div class="metric-value">${familiesTried}<small> / ${PROBLEM_ENGINE_META.families}</small></div><div class="metric-foot">幅を広げすぎない</div></div></div>
      <section class="section analysis-grid"><div class="card"><div class="section-title">トラック別正答率</div>${byTrack.map(([k,v])=>`<div class="weak-row"><span>${trackInfo[k].short}</span><div class="weak-track"><span style="width:${v}%"></span></div><b>${v}%</b></div>`).join('')}</div><div class="card"><div class="section-title">独自模試</div>${mockLast?`<div class="metric-value">${mockLast.score}/${mockLast.total}</div><div class="metric-foot">${mockLast.date} ・ ${mockLast.minutes}分</div>`:'<p class="muted">まだ受験していません。</p>'}</div></section>
      <section class="section analysis-grid"><div class="card"><div class="section-title">今、直すべき領域</div>${weak.length?weak.map(([t,n])=>`<div class="weak-row"><span>${t}</span><div class="weak-track"><span style="width:${Math.min(100,n*18)}%"></span></div><b>${n.toFixed?n.toFixed(1):n}</b></div>`).join(''):'<p class="muted">6〜10問解くと弱点を自動分解します。</p>'}</div><div class="card"><div class="section-title">誤答原因 A〜G</div>${errorRank.length?errorRank.map(([k,n])=>`<div class="weak-row"><span>${errorLabels[k]||k}</span><div class="weak-track"><span style="width:${Math.min(100,n*25)}%"></span></div><b>${n}</b></div>`).join(''):'<p class="muted">誤答後に原因を選ぶと、方針不足・計算・整理不足などを分離します。</p>'}</div></section>
      <section class="section"><div class="card"><div class="section-title">問題バンク到達度</div><div class="bank-coverage"><div><b>${attemptedCount()}</b><span>挑戦済み / ${PROBLEM_BANK_META.total}</span></div><div><b>${masteredCount()}</b><span>定着済み</span></div><div><b>${accuracy}%</b><span>全試行正答率</span></div></div></div></section>`;
  }

  function settingsView(){return `<header class="page-head"><div><h1 class="page-title">設定</h1><div class="page-sub">年間計画と学習記録。データはこの端末内に保存します。</div></div></header><div class="card">
      <div class="setting-row"><div><div class="setting-title">プロフィール</div><div class="setting-desc">名前・学年・目標</div></div><button class="btn small" id="editProfile">編集</button></div>
      <div class="setting-row"><div><div class="setting-title">年間カリキュラム開始日</div><div class="setting-desc">現在 W${currentWeekIndex()} / 52</div></div><input class="select" type="date" id="curriculumStart" value="${state.curriculumStart}"></div>
      <div class="setting-row"><div><div class="setting-title">通常の試験モード</div><div class="setting-desc">ヒント・解説を隠して1問ずつ解く</div></div><button class="switch ${state.aiFree?'on':''}" id="settingsAIFree" aria-label="試験モード"></button></div>
      <div class="setting-row"><div><div class="setting-title">学習記録のバックアップ</div><div class="setting-desc">端末変更・PWA再インストールに備える</div></div><div class="coach-actions"><button class="btn small ghost" id="exportData">書き出す</button><label class="btn small ghost" for="importData">読み込む</label><input id="importData" type="file" accept="application/json" hidden></div></div>
      <div class="setting-row"><div><div class="setting-title">学習データ初期化</div><div class="setting-desc">全記録をこの端末から削除</div></div><button class="btn small danger" id="resetData">初期化</button></div>
      <div class="setting-row"><div><div class="setting-title">PWAインストール</div><div class="setting-desc">Safariの共有 →「ホーム画面に追加」</div></div><span class="tag green">オフライン対応</span></div>
      <div class="setting-row"><div><div class="setting-title">コンテンツと権利</div><div class="setting-desc">収録問題は独自作成。公式過去問本文は転載しません。本アプリは算数オリンピック委員会の公式・提携製品ではありません。</div></div><span class="tag">非公式教材</span></div>
      </div>`}

  function bindCommon(){
    $$('[data-open-problem]').forEach(b=>b.onclick=()=>openProblem(b.dataset.openProblem,'practice'));
    $$('[data-track-start]').forEach(b=>b.onclick=()=>{state.activeTrack=b.dataset.trackStart;state.listLimit=40;state.route='challenge';save();render()});
    const topicFilter=$('#topicFilter');if(topicFilter)topicFilter.onchange=()=>{state.activeTopic=topicFilter.value;state.listLimit=40;save();render()};
    $$('[data-filter]').forEach(b=>b.onclick=()=>{state.activeTrack=b.dataset.filter;state.listLimit=40;save();render()});
    $$('[data-open-review]').forEach(b=>b.onclick=()=>openProblem(b.dataset.openReview,'review'));
    const daily=$('#startDaily');if(daily)daily.onclick=()=>openProblem(recommended(1)[0].id,'practice');
    $$('[data-integrated-math]').forEach(b=>b.onclick=()=>{if(b.dataset.integratedMath==='review'){const p=dueReviews()[0];if(p)openProblem(p.id,'review');else navigate('review')}else openProblem(recommended(1)[0].id,'practice')});
    const swp=$('#startWeekProblem');if(swp)swp.onclick=()=>openProblem(weekRecommendations(1)[0].id,'practice');
    const af=$('#toggleAIFree');if(af)af.onclick=()=>{state.aiFree=!state.aiFree;save();render()};
    const sa=$('#settingsAIFree');if(sa)sa.onclick=()=>{state.aiFree=!state.aiFree;save();render()};
    const sr=$('#startReview');if(sr)sr.onclick=()=>{const p=dueReviews()[0];if(p)openProblem(p.id,'review')};
    const lm=$('#loadMore');if(lm)lm.onclick=()=>{state.listLimit=(state.listLimit||40)+40;save();render()};
    const lf=$('#levelFilter');if(lf)lf.onchange=()=>{state.activeLevel=lf.value;state.listLimit=40;save();render()};
    const sm=$('#startMock');if(sm)sm.onclick=startMockSession;
    const dm=$('#dismissMock');if(dm)dm.onclick=()=>{state.mock=null;save();render()};
    const ep=$('#editProfile');if(ep)ep.onclick=profileModal;
    const cs=$('#curriculumStart');if(cs)cs.onchange=()=>{state.curriculumStart=cs.value||today();save();render();toast('年間カリキュラム開始日を更新しました')};
    const ex=$('#exportData');if(ex)ex.onclick=exportData;
    const im=$('#importData');if(im)im.onchange=importData;
    const rd=$('#resetData');if(rd)rd.onclick=()=>{if(confirm('この端末の学習記録をすべて消しますか？')){localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(LEGACY_KEY);state=structuredClone(defaultState);save();render();toast('学習記録を初期化しました')}};
  }

  function openProblem(id,mode='practice'){
    const p=PROBLEMS.find(x=>x.id===id);if(!p)return;
    state.currentProblem=id;state.route='challenge';state.problemMode=mode;state.hintsShown=0;state.solutionOpen=false;state.backgroundOpen=false;state.startedAt=Date.now();state.sessionWrong=0;
    if(mode==='review')state.aiFree=true;
    state.recentFamilies=state.recentFamilies||[];if(p.family){state.recentFamilies.push(p.family);state.recentFamilies=state.recentFamilies.slice(-8)}
    save();render();window.scrollTo(0,0)
  }
  function bindProblem(){
    const p=activeProblem(),mock=state.mock?.active&&state.problemMode==='mock';if(!p)return;
    $('#backProblems').onclick=()=>{if(mock){state.currentProblem=null;save();render()}else{state.currentProblem=null;state.solutionOpen=false;state.backgroundOpen=false;save();render()}};
    if(mock){
      $('#submitAnswer').onclick=()=>saveMockAnswer(p,true);$('#answerInput').addEventListener('keydown',e=>{if(e.key==='Enter')saveMockAnswer(p,true)});
      $('#mockPrev').onclick=()=>moveMock(-1);$('#mockNext').onclick=()=>{saveMockAnswer(p,false);moveMock(1)};$('#finishMock').onclick=finishMockSession;
    }else{
      $('#bookmarkBtn').onclick=()=>{const i=state.bookmarks.indexOf(p.id);if(i>=0)state.bookmarks.splice(i,1);else state.bookmarks.push(p.id);save();render();toast(i>=0?'保存を解除しました':'あとで復習に保存しました')};
      $('#submitAnswer').onclick=()=>checkAnswer(p);$('#answerInput').addEventListener('keydown',e=>{if(e.key==='Enter')checkAnswer(p)});
      const hint=$('#hintBtn');if(hint)hint.onclick=()=>{if(state.hintsShown<p.hints.length){state.hintsShown++;stat(p.id).hints++;save();render();toast(`ヒント${state.hintsShown}を開きました`)}else toast('ヒントはここまでです')};
      const give=$('#giveUpBtn');if(give)give.onclick=()=>{state.solutionOpen=true;stat(p.id).quality='△';save();render()};
      const sj=$('#saveJournal');if(sj)sj.onclick=()=>{const txt=$('#journalText').value.trim();if(txt.length<8){toast('考え方をもう少し具体的に書いてみよう');return}state.journal[p.id]=txt;stat(p.id).explained=true;logEvent({type:'explain',id:p.id,mode:state.problemMode,seconds:0});save();render();toast('説明を保存しました')};
      const bg=$('#backgroundBtn');if(bg)bg.onclick=()=>{state.backgroundOpen=!state.backgroundOpen;save();render()};
      const nr=$('#nextRecommended');if(nr)nr.onclick=()=>{const n=recommended(8).find(x=>x.id!==p.id);if(n)openProblem(n.id,'practice')};
    }
    initScratch();startProblemTimer(p,mock);
  }
  function startProblemTimer(p,mock){
    clearInterval(drawingTimer);const el=$('#problemTimer');if(!el)return;
    const tick=()=>{
      if(mock){const remain=state.mock.durationMin*60-(Date.now()-state.mock.startedAt)/1000;el.textContent='残り '+fmtTime(remain);if(remain<=0){clearInterval(drawingTimer);finishMockSession(true)}}
      else{const sec=(Date.now()-(state.startedAt||Date.now()))/1000;el.textContent=fmtTime(sec)+' / '+fmtTime(targetSeconds(p));if(sec>targetSeconds(p))el.style.color='var(--orange)'}
    };tick();drawingTimer=setInterval(tick,1000)
  }

  function parseMixedNumber(raw){const s=String(raw).replace(/\s/g,'');let m=s.match(/^(\d+)[と+](\d+)\/(\d+)$/);if(m)return +m[1]+(+m[2]/+m[3]);m=s.match(/^(\d+)\/(\d+)$/);if(m)return +m[1]/+m[2];const x=Number(s);return Number.isFinite(x)?x:null}
  function isAnswerCorrect(p,raw){
    if(p.answerType==='number'){const x=Number(String(raw).replace(/[^0-9.\-]/g,''));return Number.isFinite(x)&&Math.abs(x-Number(p.answer))<1e-6}
    if(p.answerType==='fraction'){const numeric=parseMixedNumber(raw);return (numeric!=null&&Math.abs(numeric-Number(p.answer))<1e-6)||normalize(raw)===normalize(p.displayAnswer||'')}
    return normalize(raw)===normalize(p.answer)
  }
  function recordError(p,code){const s=stat(p.id);s.errors=s.errors||{};s.errors[code]=(s.errors[code]||0)+1;save();toast('誤答原因 '+code+' を記録しました');$$('[data-error-code]').forEach(b=>b.disabled=true)}
  function scheduleReview(s,days){const d=new Date();d.setDate(d.getDate()+days);s.nextReview=d.toISOString()}
  function scheduleByStage(s,mode,independent){
    if(!independent){s.reviewStage=0;s.quality='△';scheduleReview(s,1);return}
    s.quality='○';
    if(mode==='review'){s.reviewStage=(s.reviewStage||0)+1;const intervals=[7,21,60,120];scheduleReview(s,intervals[Math.min(s.reviewStage-1,intervals.length-1)])}
    else{scheduleReview(s,3)}
  }
  function checkAnswer(p){
    const raw=$('#answerInput').value,s=stat(p.id),firstExposure=s.attempts===0,duration=(Date.now()-(state.startedAt||Date.now()))/1000,ok=isAnswerCorrect(p,raw);s.attempts++;s.last=new Date().toISOString();s.lastSeconds=Math.round(duration);
    const box=$('#answerStatus');box.className='status-panel show '+(ok?'correct':'wrong');
    if(ok){
      s.correct++;const independent=state.hintsShown===0&&!state.solutionOpen&&state.sessionWrong===0&&duration<=targetSeconds(p);if(independent)s.noHintCorrect++;s.solved=true;s.lastMode=state.problemMode;
      scheduleByStage(s,state.problemMode,independent);state.xp+=independent?30:15;state.solutionOpen=!state.aiFree;state.lastStudy=today();
      logEvent({type:'answer',id:p.id,mode:state.problemMode,correct:true,independent,seconds:Math.round(duration),firstExposure});save();
      box.textContent=state.aiFree?(independent?'正解。試験条件で自力到達しました。':'正解。ただし再試行・時間超過等があるため△で再確認します。'):'正解。次は「なぜこの方法か」を自分の言葉で説明してください。';setTimeout(()=>render(),750)
    }else{
      state.sessionWrong++;scheduleByStage(s,state.problemMode,false);logEvent({type:'answer',id:p.id,mode:state.problemMode,correct:false,independent:false,seconds:Math.round(duration),firstExposure});save();
      box.innerHTML=`<div>まだ違います。答えではなく、条件の読み取り・図・小さい例を確認してください。</div><div class="error-codes"><span>今回の原因：</span>${[['A','読み違い'],['B','知識'],['C','方針'],['D','論理'],['E','計算'],['F','整理'],['G','時間']].map(([c,l])=>`<button class="error-code" data-error-code="${c}">${c} ${l}</button>`).join('')}</div>`;$$('[data-error-code]',box).forEach(b=>b.onclick=()=>recordError(p,b.dataset.errorCode));
    }
  }

  function allocateMockCounts(ratio,total=12){let s=Math.max(1,Math.round(total*ratio.school/100)),j=Math.max(1,Math.round(total*ratio.junior/100));let o=total-s-j;if(o<1){o=1;if(j>s)j--;else s--}while(s+j+o<total)j++;while(s+j+o>total){if(s>1)s--;else if(j>1)j--;else o--}return{school:s,junior:j,olympiad:o}}
  function buildMockSet(){
    const counts=allocateMockCounts(currentPlan().trackRatio),out=[];
    for(const [track,count] of Object.entries(counts)){
      const pool=PROBLEMS.filter(p=>p.track===track).sort((a,b)=>adaptiveScore(b)-adaptiveScore(a));const used=new Set();
      for(const p of pool){if(out.length>=12)break;if(out.filter(x=>x.track===track).length>=count)break;if(p.family&&used.has(p.family))continue;out.push(p);if(p.family)used.add(p.family)}
      for(const p of pool){if(out.filter(x=>x.track===track).length>=count)break;if(!out.some(x=>x.id===p.id))out.push(p)}
    }
    return out.slice(0,12)
  }
  function startMockSession(){
    if(state.mock?.active&&!confirm('進行中の模試を最初からやり直しますか？'))return;const set=buildMockSet();
    state.mock={active:true,finished:false,ids:set.map(p=>p.id),answers:{},startedAt:Date.now(),durationMin:60,result:null};state.aiFree=true;state.problemMode='mock';state.currentProblem=state.mock.ids[0];state.route='challenge';save();render();window.scrollTo(0,0)
  }
  function saveMockAnswer(p,notify=true){const input=$('#answerInput');if(!input)return;state.mock.answers[p.id]=input.value.trim();save();if(notify)toast('答案を保存しました')}
  function moveMock(delta){const idx=state.mock.ids.indexOf(state.currentProblem),next=clamp(idx+delta,0,state.mock.ids.length-1);state.currentProblem=state.mock.ids[next];state.startedAt=Date.now();save();render();window.scrollTo(0,0)}
  function finishMockSession(auto=false){
    if(!state.mock?.active)return;if(!auto&&!confirm('模試を終了して採点しますか？'))return;const elapsed=Math.round((Date.now()-state.mock.startedAt)/60000),results=[];
    state.mock.ids.forEach(id=>{const p=PROBLEMS.find(x=>x.id===id),raw=state.mock.answers[id]||'',s=stat(id),firstExposure=s.attempts===0,ok=raw!==''&&isAnswerCorrect(p,raw);s.attempts++;s.last=new Date().toISOString();s.lastMode='mock';if(ok){s.correct++;s.noHintCorrect++;s.solved=true;s.quality='○';scheduleReview(s,3)}else{s.quality='△';scheduleReview(s,1)};logEvent({type:'answer',id,mode:'mock',correct:ok,independent:ok,seconds:0,firstExposure});results.push({id,ok,raw})});
    const score=results.filter(r=>r.ok).length,result={score,total:results.length,date:today(),minutes:Math.min(60,elapsed),results};state.mock.active=false;state.mock.finished=true;state.mock.result=result;state.mockHistory=state.mockHistory||[];state.mockHistory.push(result);state.mockHistory=state.mockHistory.slice(-20);state.currentProblem=null;state.aiFree=false;state.problemMode='practice';save();render();toast('模試を採点しました')
  }

  function initScratch(){
    const canvas=$('#scratchCanvas');if(!canvas)return;const rect=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#24334a';ctx.lineWidth=2.2;let mode='pen',down=false,last=null;
    const pos=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
    canvas.onpointerdown=e=>{down=true;last=pos(e);canvas.setPointerCapture(e.pointerId)};canvas.onpointermove=e=>{if(!down)return;const q=pos(e);ctx.strokeStyle=mode==='eraser'?'#f7f4ea':'#24334a';ctx.lineWidth=mode==='eraser'?18:2.2;ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(q.x,q.y);ctx.stroke();last=q};canvas.onpointerup=()=>{down=false;last=null};canvas.onpointercancel=()=>{down=false;last=null};
    $$('[data-tool]').forEach(b=>b.onclick=()=>{const t=b.dataset.tool;if(t==='clear'){ctx.clearRect(0,0,rect.width,rect.height);return}mode=t;$$('[data-tool]').forEach(x=>x.classList.toggle('active',x.dataset.tool===mode))})
  }
  function profileModal(){
    $('#modalRoot').innerHTML=`<div class="modal-backdrop" id="modalBack"><div class="modal"><h3>プロフィール</h3><p>難度は学年だけで固定せず、実際の自力率・再現率から調整します。</p><div class="form-grid"><div class="field"><label>名前</label><input id="profileName" value="${escapeHtml(state.profile.name)}"></div><div class="field"><label>学年</label><select id="profileGrade">${[3,4,5,6].map(g=>`<option ${state.profile.grade==g?'selected':''} value="${g}">小学${g}年</option>`).join('')}</select></div><div class="field"><label>目標</label><select id="profileTarget">${['ジュニア算オリ全国上位','算数オリ全国上位','最難関中学算数','競技算数を楽しむ'].map(x=>`<option ${state.profile.target===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="coach-actions"><button class="btn primary" id="saveProfile">保存</button><button class="btn ghost" id="closeProfile">閉じる</button></div></div></div></div>`;
    $('#saveProfile').onclick=()=>{state.profile.name=$('#profileName').value.trim()||'挑戦者';state.profile.grade=Number($('#profileGrade').value);state.profile.target=$('#profileTarget').value;save();$('#modalRoot').innerHTML='';render();toast('プロフィールを更新しました')};$('#closeProfile').onclick=()=>$('#modalRoot').innerHTML='';$('#modalBack').onclick=e=>{if(e.target.id==='modalBack')$('#modalRoot').innerHTML=''}
  }
  function exportData(){const payload={app:'算数王',version:'2.0.0',exportedAt:new Date().toISOString(),state};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`sansuo-king-backup-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);toast('バックアップを書き出しました')}
  function importData(e){const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const data=JSON.parse(r.result);if(!data.state)throw new Error('invalid');state=deepMerge(structuredClone(defaultState),data.state);save();render();toast('バックアップを読み込みました')}catch(err){toast('読み込めないバックアップです')}};r.readAsText(f)}

  // Refresh only the visible home, without interrupting an active question or parent panel.
  const refreshQuest=()=>{if(state.route==='home'&&document.querySelector('[data-integrated-math]'))render();};
  window.addEventListener?.('storage',e=>{if(!e.key||Object.values(window.AdaptiveQuality.keys).includes(e.key))refreshQuest();});
  window.addEventListener?.('pageshow',refreshQuest);
  window.addEventListener?.('focus',refreshQuest);
  if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  render();
})();
