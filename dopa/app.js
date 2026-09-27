(() => {
  'use strict';

  const KEY='four_subject_dopa_v1';
  const SUBJECTS={
    math:{name:'算数',mark:'算',storage:'sansuo_champion_state_v2',url:'../?home=1'},
    japanese:{name:'国語',mark:'国',storage:'kokugoLabV1',url:'../japanese/'},
    science:{name:'理科',mark:'理',storage:'hayabusaScienceV1',url:'../science/'},
    social:{name:'社会',mark:'社',storage:'socialLabV2',url:'../social/'}
  };
  const DRIVE=[
    {min:0,name:'IGNITION',label:'起動',fx:1},
    {min:100,name:'BOOST',label:'加速',fx:2},
    {min:250,name:'SURGE',label:'上昇',fx:3},
    {min:500,name:'OVERDRIVE',label:'超加速',fx:4},
    {min:900,name:'HYPER',label:'覚醒',fx:5},
    {min:1400,name:'MAX DRIVE',label:'最大出力',fx:6},
    {min:2200,name:'LEGEND',label:'伝説',fx:7}
  ];
  const EXTRA=[
    {s:'math',q:'1から20までの整数のうち、3の倍数はいくつ？',o:['5個','6個','7個','8個'],a:1,e:'3, 6, 9, 12, 15, 18 の6個。'},
    {s:'japanese',q:'「雨が強く降っていた。＿＿＿、試合は予定どおり行われた。」最も自然な接続語は？',o:['だから','しかし','つまり','たとえば'],a:1,e:'前後が反対の内容なので「しかし」。'},
    {s:'science',q:'1気圧のもとで、水が沸騰する温度は？',o:['0℃','50℃','100℃','150℃'],a:2,e:'1気圧では水の沸点は100℃。'},
    {s:'social',q:'日本で最も長い川は？',o:['利根川','石狩川','信濃川','木曽川'],a:2,e:'信濃川が日本最長。'},
    {s:'math',q:'36の約数は全部でいくつ？',o:['6個','8個','9個','12個'],a:2,e:'1,2,3,4,6,9,12,18,36 の9個。'},
    {s:'japanese',q:'「弟が公園でボールを投げた。」この文の主語は？',o:['弟が','公園で','ボールを','投げた'],a:0,e:'「だれが」に当たる「弟が」が主語。'},
    {s:'science',q:'植物の葉にあり、気体の出入りや水の蒸散に関わる小さな穴は？',o:['葉脈','気孔','根毛','胚珠'],a:1,e:'葉の表面にある気孔が気体交換や蒸散に関わる。'},
    {s:'social',q:'日本の都道府県で、面積が最も大きいのは？',o:['岩手県','長野県','北海道','福島県'],a:2,e:'北海道が最も大きい。'}
  ];

  const $=s=>document.querySelector(s);
  const now=()=>new Date().toISOString();
  const blankRun=()=>({active:false,answers:0,correct:0,subjects:{math:0,japanese:0,science:0,social:0},correctSubjects:{math:0,japanese:0,science:0,social:0},score:null,finished:false,perfect:false});
  const blankExtra=()=>({unlocked:false,active:false,index:0,correct:0,feverSlots:0,answered:false,bossClears:0});
  const def=()=>({version:2,dopa:0,combo:0,peakCombo:0,fx:1,lastSubject:'math',sound:false,history:[],run:blankRun(),extra:blankExtra()});
  let state=load();
  let snap={};
  let popTimer=null;
  let rankTimer=null;
  let scanTimer=null;
  let audioCtx=null;

  function load(){
    try{
      const base=def(),raw=JSON.parse(localStorage.getItem(KEY)||'null')||{};
      return {...base,...raw,version:2,run:{...blankRun(),...(raw.run||{})},extra:{...blankExtra(),...(raw.extra||{})}};
    }catch{return def()}
  }
  function save(){localStorage.setItem(KEY,JSON.stringify(state))}
  function safe(raw){try{return JSON.parse(raw||'null')}catch{return null}}
  function metric(subject){
    const cfg=SUBJECTS[subject],x=safe(localStorage.getItem(cfg.storage));
    if(!x)return {attempts:0,correct:0};
    if(subject==='math'){
      const vals=Object.values(x.stats||{});return {attempts:vals.reduce((n,v)=>n+(Number(v.attempts)||0),0),correct:vals.reduce((n,v)=>n+(Number(v.correct)||0),0)};
    }
    if(subject==='japanese'){
      const a=Array.isArray(x.attempts)?x.attempts:[];return {attempts:a.filter(v=>typeof v.success==='boolean').length,correct:a.filter(v=>v.success===true).length};
    }
    if(subject==='science')return {attempts:Number(x.answered)||0,correct:Number(x.correct)||0};
    const a=Array.isArray(x.attempts)?x.attempts:[];return {attempts:a.length,correct:a.filter(v=>v.correct===true).length};
  }
  function capture(){Object.keys(SUBJECTS).forEach(s=>snap[s]=metric(s))}
  function scan(){
    Object.keys(SUBJECTS).forEach(subject=>{
      const m=metric(subject),p=snap[subject]||m;
      if(m.attempts<p.attempts||m.correct<p.correct){snap[subject]=m;return}
      const da=m.attempts-p.attempts,dc=Math.min(da,Math.max(0,m.correct-p.correct));
      if(da>0){for(let i=0;i<da;i++)onAnswer(subject,i<dc);snap[subject]=m}
    });
  }

  function driveIndex(value=state.dopa){
    let idx=0;for(let i=0;i<DRIVE.length;i++)if(value>=DRIVE[i].min)idx=i;return idx;
  }
  function comboWord(c=state.combo){
    if(c>=10)return 'MAXIMUM';
    if(c>=7)return 'HYPER';
    if(c>=5)return 'OVERDRIVE';
    if(c>=3)return 'SURGE';
    if(c>=2)return 'BOOST';
    return c===1?'JUST!':'IGNITION';
  }
  function dopaGain(){return 15+Math.min(30,Math.floor(Math.max(0,state.combo-1)/2)*5)}
  function coreFirst(subject,correct){
    return !!(correct&&state.run.active&&!state.run.finished&&!(state.run.correctSubjects?.[subject]>0));
  }

  function onAnswer(subject,correct){
    state.lastSubject=subject;
    const oldDrive=driveIndex();
    const firstCore=coreFirst(subject,correct);
    let gain=0;
    if(correct){
      state.combo++;state.peakCombo=Math.max(state.peakCombo||0,state.combo);
      gain=dopaGain()+(firstCore?15:0);
      state.dopa+=gain;
      state.fx=Math.min(8,1+Math.floor(state.combo/2));
      reward(`${comboWord()}  +${gain} DOPA`,gain);
      burst(state.fx,state.combo>=7);
      if(firstCore)setTimeout(()=>announce(`${SUBJECTS[subject].mark} CORE ONLINE`,SUBJECTS[subject].name+' CORE 起動'),280);
      if([3,5,7,10].includes(state.combo))shock();
      playTone('correct',state.combo);
    }else{
      state.combo=0;state.fx=1;reward('RETRY｜DOPAはそのまま',0);playTone('wrong',0);
    }
    state.history.push({at:now(),subject,correct,gain,combo:state.combo});if(state.history.length>400)state.history=state.history.slice(-400);
    if(state.run.active&&!state.run.finished){
      state.run.answers++;
      state.run.subjects[subject]=(state.run.subjects[subject]||0)+1;
      if(correct){state.run.correct++;state.run.correctSubjects[subject]=(state.run.correctSubjects[subject]||0)+1}
      const online=Object.values(state.run.correctSubjects).filter(n=>n>0).length;
      if(online===4&&correct)setTimeout(()=>announce('4 CORE SYNC','4科CORE 同期完了'),620);
      if(state.run.answers>=8)finishRun();
    }
    const newDrive=driveIndex();
    if(newDrive>oldDrive)setTimeout(()=>announce('DRIVE UP',DRIVE[newDrive].name),850);
    save();render();
    const live=$('#liveGain');if(live){live.textContent=gain?`+${gain}`:'0';setTimeout(()=>{if(live)live.textContent='0'},900)}
  }

  function startRun(){
    state.run=blankRun();state.run.active=true;save();render();reward('PERFECT RUN｜IGNITION',0);announce('MISSION START','4 CORE → 8/8 → BOSS');playTone('start',0);
  }
  function finishRun(){
    const r=state.run;r.active=false;r.finished=true;r.score=Math.round(r.correct/8*100);
    const all=Object.values(r.subjects).every(n=>n>0);r.perfect=r.correct===8&&all;
    if(r.perfect){
      state.extra.unlocked=true;state.dopa+=100;
      reward('PERFECT 100｜+100 DOPA',100);burst(8,true);shock();playTone('boss',8);
      setTimeout(()=>announce('BOSS GATE OPEN','EXTRA TEST 解放'),420);
    }else{
      setTimeout(()=>announce(`${r.score} POINT`,'次は100点を狙おう'),250);
    }
  }

  function openSubject(subject){
    const cfg=SUBJECTS[subject]||SUBJECTS.math;state.lastSubject=subject;save();
    $('#homePanel').hidden=true;$('#extraPanel').hidden=true;$('#stagePanel').hidden=false;
    $('#stageSubject').textContent=cfg.name;$('#subjectFrame').src=cfg.url;render();window.scrollTo(0,0);
  }
  function showHome(){
    $('#stagePanel').hidden=true;$('#extraPanel').hidden=true;$('#homePanel').hidden=false;$('#subjectFrame').src='about:blank';render();window.scrollTo(0,0);
  }

  function startExtra(){
    if(!state.extra.unlocked)return;
    state.extra={...state.extra,active:true,index:0,correct:0,feverSlots:5,answered:false};save();
    $('#homePanel').hidden=true;$('#stagePanel').hidden=true;$('#extraPanel').hidden=false;renderExtra();render();
    reward('BOSS BATTLE START',0);announce('FEVER ×2','最初の5問だけDOPA 2倍');burst(8,true);playTone('boss',8);window.scrollTo(0,0);
  }
  function renderExtra(){
    const ex=state.extra;if(!ex.active)return;
    const q=EXTRA[ex.index];$('#extraNow').textContent=ex.index+1;$('#exProgress').style.width=(ex.index/EXTRA.length*100)+'%';
    const hp=Math.max(0,100-ex.correct/EXTRA.length*100);$('#bossHp').style.width=hp+'%';
    const subject=SUBJECTS[q.s];
    $('#extraQuestion').innerHTML=`<div class="boss-status"><span>BOSS HP ${Math.round(hp)}%</span><b>${ex.feverSlots>0?'FEVER ×2｜残り'+ex.feverSlots+'問':'NORMAL DRIVE'}</b></div><span class="ex-subject">${subject.mark}｜${subject.name}</span><h3>${q.q}</h3><div class="ex-options">${q.o.map((x,i)=>`<button data-ex-answer="${i}" ${ex.answered?'disabled':''}>${String.fromCharCode(65+i)}　${x}</button>`).join('')}</div><div id="exFeedback"></div>`;
    document.querySelectorAll('[data-ex-answer]').forEach(b=>b.onclick=()=>answerExtra(Number(b.dataset.exAnswer)));
  }
  function answerExtra(choice){
    const ex=state.extra;if(ex.answered)return;const q=EXTRA[ex.index],ok=choice===q.a;ex.answered=true;
    let gain=0;
    if(ok){
      state.combo++;state.peakCombo=Math.max(state.peakCombo||0,state.combo);
      gain=dopaGain()*(ex.feverSlots>0?2:1);state.dopa+=gain;state.fx=Math.min(8,1+Math.floor(state.combo/2));ex.correct++;
      reward(`${ex.feverSlots>0?'FEVER ×2｜':''}${comboWord()} +${gain}`,gain);burst(ex.feverSlots>0?8:state.fx,ex.feverSlots>0);playTone('correct',state.combo);
      if([3,5,7,10].includes(state.combo))shock();
    }else{state.combo=0;state.fx=1;reward('GUARD｜DOPAは減らない',0);playTone('wrong',0)}
    if(ex.feverSlots>0)ex.feverSlots--;
    state.history.push({at:now(),subject:q.s,correct:ok,gain,extra:true,combo:state.combo});save();render();
    const hp=Math.max(0,100-ex.correct/EXTRA.length*100);$('#bossHp').style.width=hp+'%';
    $('#exFeedback').innerHTML=`<div class="ex-feedback ${ok?'hit':'guard'}"><b>${ok?'HIT!｜正解':'GUARD｜確認しよう'}</b><br>${q.e}<br><button id="exNext" class="cta" style="margin-top:12px">${ex.index===EXTRA.length-1?'BOSS RESULT':'NEXT ATTACK →'}</button></div>`;
    $('#exNext').onclick=nextExtra;
  }
  function nextExtra(){
    const ex=state.extra;if(ex.index>=EXTRA.length-1){
      const score=Math.round(ex.correct/EXTRA.length*100),perfect=ex.correct===EXTRA.length;
      ex.active=false;
      if(perfect){ex.bossClears=(ex.bossClears||0)+1;state.dopa+=150;reward('BOSS BREAK! +150 DOPA',150);burst(8,true);shock();playTone('boss',10)}
      save();
      $('#bossHp').style.width=(perfect?0:Math.max(0,100-ex.correct/EXTRA.length*100))+'%';
      $('#extraQuestion').innerHTML=`<span class="ex-subject">${perfect?'BOSS BREAK':'BOSS RESULT'}</span><h3>${ex.correct}/8 正解｜${score}点</h3><p>${perfect?'完全撃破。固定BONUS +150 DOPA。':'ここで終了。間違えた問題は答えを確認して通常4科へ戻ろう。'}</p><button id="extraDone" class="cta">DOPAホームへ</button>`;
      $('#exProgress').style.width='100%';$('#extraDone').onclick=showHome;render();return;
    }
    ex.index++;ex.answered=false;save();renderExtra();render();
  }

  function ensureAudio(){
    if(!audioCtx){const C=window.AudioContext||window.webkitAudioContext;if(C)audioCtx=new C()}
    if(audioCtx?.state==='suspended')audioCtx.resume().catch(()=>{});
    return audioCtx;
  }
  function toggleSound(){state.sound=!state.sound;if(state.sound)ensureAudio();save();render();if(state.sound)playTone('start',0)}
  function playTone(kind,level=0){
    if(!state.sound)return;const ctx=ensureAudio();if(!ctx)return;
    const notes=kind==='wrong'?[180]:kind==='boss'?[260,390,520,780]:kind==='start'?[300,450,600]:[360+Math.min(8,level)*35,540+Math.min(8,level)*45];
    const start=ctx.currentTime;
    notes.forEach((f,i)=>{
      const o=ctx.createOscillator(),g=ctx.createGain();o.type=kind==='boss'?'sawtooth':'sine';o.frequency.value=f;g.gain.setValueAtTime(0.0001,start+i*.07);g.gain.exponentialRampToValueAtTime(kind==='boss'?.08:.05,start+i*.07+.015);g.gain.exponentialRampToValueAtTime(.0001,start+i*.07+.18);o.connect(g).connect(ctx.destination);o.start(start+i*.07);o.stop(start+i*.07+.2);
    });
  }

  function reward(text,gain){
    const p=$('#rewardPop');p.textContent=text;p.classList.add('show');clearTimeout(popTimer);popTimer=setTimeout(()=>p.classList.remove('show'),1250);
    if(gain>=30){const fx=$('#fxLayer');fx.classList.add('flash');setTimeout(()=>fx.classList.remove('flash'),380)}
  }
  function announce(kicker,title){
    const p=$('#rankPop');p.innerHTML=`<small>${kicker}</small><strong>${title}</strong>`;p.classList.add('show');clearTimeout(rankTimer);rankTimer=setTimeout(()=>p.classList.remove('show'),1450);
  }
  function shock(){document.body.classList.remove('shock');void document.body.offsetWidth;document.body.classList.add('shock');setTimeout(()=>document.body.classList.remove('shock'),450)}
  function burst(level=1,max=false){
    const layer=$('#fxLayer'),count=max?44:Math.min(28,7+level*3),cx=window.innerWidth/2,cy=Math.min(window.innerHeight*.35,280);
    for(let i=0;i<count;i++){
      const d=document.createElement('i');d.className='particle';const a=Math.PI*2*i/count+(i%5)*.11,r=80+level*15+(i%5)*17;
      d.style.left=cx+'px';d.style.top=cy+'px';d.style.setProperty('--dx',Math.cos(a)*r+'px');d.style.setProperty('--dy',Math.sin(a)*r+'px');
      if(i%4===1)d.style.background='var(--pink)';if(i%4===2)d.style.background='var(--gold)';if(i%4===3)d.style.background='var(--green)';layer.appendChild(d);setTimeout(()=>d.remove(),950);
    }
  }

  function renderDrive(){
    const idx=driveIndex(),cur=DRIVE[idx],next=DRIVE[idx+1];
    $('#driveName').textContent=cur.name;$('#driveBadge').textContent=`DRIVE ${idx+1}`;
    $('#driveMessage').textContent=idx===0?'まず1問。正解すると起動。':`${cur.label}状態。COMBOで演出出力がさらに上がる。`;
    if(next){
      const span=next.min-cur.min,done=state.dopa-cur.min,pct=Math.max(0,Math.min(100,done/span*100));
      $('#driveMeter').style.width=pct+'%';$('#nextUnlock').textContent=`次の覚醒 ${next.name} まで ${Math.max(0,next.min-state.dopa)} DOPA`;
    }else{$('#driveMeter').style.width='100%';$('#nextUnlock').textContent='LEGEND DRIVE 到達'}
    $('#driveMilestones').innerHTML=DRIVE.map((d,i)=>`<div class="drive-node ${state.dopa>=d.min?'on':''} ${i===idx?'current':''}"><span>${i+1}</span><b>${d.name}</b><small>${d.min} DOPA</small></div>`).join('');
  }
  function render(){
    $('#dopaTotal').textContent=state.dopa;$('#reactorValue').textContent=state.dopa;$('#comboCount').textContent=state.combo;
    const cword=comboWord();$('#comboTitle').textContent=cword;$('#stageComboWord').textContent=cword;
    const visual=Math.max(state.fx,DRIVE[driveIndex()].fx);$('#fxLevel').textContent=visual;
    document.body.className=`fx${Math.min(8,visual)}${state.extra.active&&state.extra.feverSlots>0?' fever':''}`;
    $('#soundBtn').textContent=`演出音 ${state.sound?'ON':'OFF'}`;$('#soundBtn').setAttribute('aria-pressed',String(state.sound));
    renderDrive();
    const r=state.run;
    $('#runScore').textContent=r.finished?r.score:(r.active?Math.round(r.correct/8*100):'—');
    $('#runMeter').style.width=((r.answers||0)/8*100)+'%';
    $('#runStatus').textContent=r.active?`${r.answers}/8 ATTACK`:r.finished?(r.perfect?'BOSS GATE OPEN':'RUN END'):'STANDBY';
    $('#runNote').textContent=r.active?`正解 ${r.correct}/${r.answers}。4科COREを全部起動して8/8へ。`:r.finished?(r.perfect?'PERFECT 100。BOSS GATEが開きました。':'RUN終了。もう一度なら新しい8回答として挑戦できます。'):'8回答・4科すべてに挑戦して、8/8正解なら100点。';
    $('#coreGrid').innerHTML=Object.entries(SUBJECTS).map(([k,v])=>{const on=r.correctSubjects?.[k]>0;return `<div class="core-unit ${on?'on':''} ${k}"><span>${v.mark}</span><div><b>${v.name} CORE</b><small>${on?'ONLINE':'STANDBY'}</small></div><i></i></div>`}).join('');
    const extra=state.extra.unlocked;$('#extraCard').classList.toggle('locked',!extra);$('#extraTitle').textContent=extra?'BOSS GATE OPEN':'LOCKED';$('#extraNote').textContent=extra?`8問4科MIX。最初の5問はDOPA×2。撃破数 ${state.extra.bossClears||0}。`:'PERFECT RUNで100点を取ると解放。';$('#extraBtn').disabled=!extra;$('#extraBtn').textContent=extra?'BOSS BATTLE START':'LOCKED';$('#bossOrbText').textContent=extra?'OPEN':'LOCK';
    if(state.extra.active&&state.extra.feverSlots>0){$('#fxLevel').textContent='MAX';$('#fxLevel').parentElement.classList.add('fever-badge')}else $('#fxLevel').parentElement.classList.remove('fever-badge');
  }

  function bind(){
    $('#startRunBtn').onclick=startRun;$('#openLastBtn').onclick=()=>openSubject(state.lastSubject||'math');$('#soundBtn').onclick=toggleSound;$('#backHomeBtn').onclick=showHome;$('#extraBackBtn').onclick=showHome;$('#extraBtn').onclick=startExtra;
    document.querySelectorAll('[data-subject]').forEach(b=>b.onclick=()=>openSubject(b.dataset.subject));
    window.addEventListener('storage',e=>{if(Object.values(SUBJECTS).some(x=>x.storage===e.key))setTimeout(scan,20)});
    scanTimer=setInterval(scan,400);
    window.addEventListener('pagehide',()=>clearInterval(scanTimer));
    if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  }

  capture();bind();render();
})();