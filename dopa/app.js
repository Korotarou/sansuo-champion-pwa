(() => {
  'use strict';

  const KEY='four_subject_dopa_v1';
  const SUBJECTS={
    math:{name:'算数',mark:'算',storage:'sansuo_champion_state_v2',url:'../?home=1'},
    japanese:{name:'国語',mark:'国',storage:'kokugoLabV1',url:'../japanese/'},
    science:{name:'理科',mark:'理',storage:'hayabusaScienceV1',url:'../science/'},
    social:{name:'社会',mark:'社',storage:'socialLabV2',url:'../social/'}
  };
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
  const def=()=>({version:1,dopa:0,combo:0,fx:1,lastSubject:'math',history:[],run:{active:false,answers:0,correct:0,subjects:{math:0,japanese:0,science:0,social:0},score:null,finished:false,perfect:false},extra:{unlocked:false,active:false,index:0,correct:0,feverSlots:0,answered:false}});
  let state=load();
  let snap={};
  let popTimer=null;
  let scanTimer=null;

  function load(){try{return Object.assign(def(),JSON.parse(localStorage.getItem(KEY)||'null')||{})}catch{return def()}}
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

  function dopaGain(){return 10+Math.min(20,Math.floor(Math.max(0,state.combo-1)/2)*5)}
  function onAnswer(subject,correct){
    state.lastSubject=subject;
    let gain=0;
    if(correct){
      state.combo++;
      gain=dopaGain();
      state.dopa+=gain;
      state.fx=Math.min(8,1+Math.floor(state.combo/2));
      reward(`正解  +${gain} DOPA`,gain);
      burst(state.fx);
    }else{
      state.combo=0;state.fx=1;reward('再挑戦。DOPAは減らない',0);
    }
    state.history.push({at:now(),subject,correct,gain});if(state.history.length>300)state.history=state.history.slice(-300);
    if(state.run.active&&!state.run.finished){
      state.run.answers++;state.run.subjects[subject]=(state.run.subjects[subject]||0)+1;if(correct)state.run.correct++;
      if(state.run.answers>=8)finishRun();
    }
    save();render();
    const live=$('#liveGain');if(live){live.textContent=gain?`+${gain}`:'0';setTimeout(()=>{if(live)live.textContent='0'},900)}
  }

  function startRun(){
    state.run={active:true,answers:0,correct:0,subjects:{math:0,japanese:0,science:0,social:0},score:null,finished:false,perfect:false};
    save();render();reward('PERFECT RUN START',0);
  }
  function finishRun(){
    const r=state.run;r.active=false;r.finished=true;r.score=Math.round(r.correct/8*100);
    const all=Object.values(r.subjects).every(n=>n>0);r.perfect=r.correct===8&&all;
    if(r.perfect){state.extra.unlocked=true;reward('100点！ EXTRA TEST 解放',50);burst(8,true)}
  }

  function openSubject(subject){
    const cfg=SUBJECTS[subject]||SUBJECTS.math;state.lastSubject=subject;save();
    $('#homePanel').hidden=true;$('#extraPanel').hidden=true;$('#stagePanel').hidden=false;
    $('#stageSubject').textContent=cfg.name;$('#subjectFrame').src=cfg.url;window.scrollTo(0,0);
  }
  function showHome(){
    $('#stagePanel').hidden=true;$('#extraPanel').hidden=true;$('#homePanel').hidden=false;$('#subjectFrame').src='about:blank';render();window.scrollTo(0,0);
  }

  function startExtra(){
    if(!state.extra.unlocked)return;
    state.extra={...state.extra,active:true,index:0,correct:0,feverSlots:5,answered:false};save();
    $('#homePanel').hidden=true;$('#stagePanel').hidden=true;$('#extraPanel').hidden=false;renderExtra();render();reward('FEVER START｜最初の5問',0);burst(8,true);window.scrollTo(0,0);
  }
  function renderExtra(){
    const ex=state.extra;if(!ex.active)return;
    const q=EXTRA[ex.index];$('#extraNow').textContent=ex.index+1;$('#exProgress').style.width=(ex.index/EXTRA.length*100)+'%';
    const subject=SUBJECTS[q.s];
    $('#extraQuestion').innerHTML=`<span class="ex-subject">${subject.mark}｜${subject.name}</span><h3>${q.q}</h3><div class="ex-options">${q.o.map((x,i)=>`<button data-ex-answer="${i}" ${ex.answered?'disabled':''}>${String.fromCharCode(65+i)}　${x}</button>`).join('')}</div><div id="exFeedback"></div>`;
    document.querySelectorAll('[data-ex-answer]').forEach(b=>b.onclick=()=>answerExtra(Number(b.dataset.exAnswer)));
  }
  function answerExtra(choice){
    const ex=state.extra;if(ex.answered)return;const q=EXTRA[ex.index],ok=choice===q.a;ex.answered=true;
    let gain=0;if(ok){state.combo++;gain=dopaGain()*(ex.feverSlots>0?2:1);state.dopa+=gain;state.fx=Math.min(8,1+Math.floor(state.combo/2));ex.correct++;reward(`${ex.feverSlots>0?'FEVER ×2｜':''}+${gain} DOPA`,gain);burst(ex.feverSlots>0?8:state.fx,ex.feverSlots>0)}else{state.combo=0;state.fx=1;reward('惜しい。DOPAは減らない',0)}
    if(ex.feverSlots>0)ex.feverSlots--;
    state.history.push({at:now(),subject:q.s,correct:ok,gain,extra:true});save();render();
    $('#exFeedback').innerHTML=`<div class="ex-feedback"><b>${ok?'正解':'確認しよう'}</b><br>${q.e}<br><button id="exNext" class="cta" style="margin-top:12px">${ex.index===EXTRA.length-1?'結果を見る':'次の問題 →'}</button></div>`;
    $('#exNext').onclick=nextExtra;
  }
  function nextExtra(){
    const ex=state.extra;if(ex.index>=EXTRA.length-1){
      const score=Math.round(ex.correct/EXTRA.length*100);ex.active=false;save();
      $('#extraQuestion').innerHTML=`<span class="ex-subject">EXTRA COMPLETE</span><h3>${ex.correct}/8 正解｜${score}点</h3><p>フィーバーは終了。間違えた問題は答えを確認して、通常4科へ戻ろう。</p><button id="extraDone" class="cta">DOPAホームへ</button>`;
      $('#exProgress').style.width='100%';$('#extraDone').onclick=showHome;render();return;
    }
    ex.index++;ex.answered=false;save();renderExtra();render();
  }

  function reward(text,gain){
    const p=$('#rewardPop');p.textContent=text;p.classList.add('show');clearTimeout(popTimer);popTimer=setTimeout(()=>p.classList.remove('show'),1200);
    if(gain>=25){const fx=$('#fxLayer');fx.classList.add('flash');setTimeout(()=>fx.classList.remove('flash'),380)}
  }
  function burst(level=1,max=false){
    const layer=$('#fxLayer'),count=max?30:Math.min(20,4+level*2),cx=window.innerWidth/2,cy=Math.min(window.innerHeight*.35,280);
    for(let i=0;i<count;i++){
      const d=document.createElement('i');d.className='particle';const a=Math.PI*2*i/count+(i%3)*.12,r=70+level*13+(i%4)*14;
      d.style.left=cx+'px';d.style.top=cy+'px';d.style.setProperty('--dx',Math.cos(a)*r+'px');d.style.setProperty('--dy',Math.sin(a)*r+'px');
      if(i%3===1)d.style.background='var(--pink)';if(i%3===2)d.style.background='var(--gold)';layer.appendChild(d);setTimeout(()=>d.remove(),900);
    }
  }

  function render(){
    $('#dopaTotal').textContent=state.dopa;$('#reactorValue').textContent=state.dopa;$('#comboCount').textContent=state.combo;$('#fxLevel').textContent=state.fx;
    document.body.className=`fx${state.fx}${state.extra.active&&state.extra.feverSlots>0?' fever':''}`;
    const r=state.run;
    $('#runScore').textContent=r.finished?r.score:(r.active?Math.round(r.correct/8*100):'—');
    $('#runMeter').style.width=((r.answers||0)/8*100)+'%';
    $('#runStatus').textContent=r.active?`${r.answers}/8 回答中`:r.finished?(r.perfect?'PERFECT!':'FINISH'):'未開始';
    $('#runNote').textContent=r.active?`正解 ${r.correct}/${r.answers}。4科すべてに1問以上挑戦しよう。`:r.finished?(r.perfect?'8/8正解＋4科達成。EXテストが開きました。':'もう一度なら、新しい8回答として挑戦できます。'):'8回答・4科すべてに挑戦して、8/8正解なら100点。';
    $('#subjectTicks').innerHTML=Object.entries(SUBJECTS).map(([k,v])=>`<span class="tick ${(r.subjects&&r.subjects[k]>0)?'on':''}">${v.mark} ${r.subjects?.[k]||0}問</span>`).join('');
    const extra=state.extra.unlocked;$('#extraCard').classList.toggle('locked',!extra);$('#extraTitle').textContent=extra?'UNLOCKED｜FEVER READY':'LOCKED';$('#extraNote').textContent=extra?'8問の4科MIX。最初の5問だけ正解DOPAが2倍。':'PERFECT RUNで100点を取ると解放。';$('#extraBtn').disabled=!extra;$('#extraBtn').textContent=extra?'EXテスト START':'LOCKED';
    if(state.extra.active&&state.extra.feverSlots>0){$('#fxLevel').textContent='MAX';$('#fxLevel').parentElement.classList.add('fever-badge')}else $('#fxLevel').parentElement.classList.remove('fever-badge');
  }

  function bind(){
    $('#startRunBtn').onclick=startRun;$('#openLastBtn').onclick=()=>openSubject(state.lastSubject||'math');$('#backHomeBtn').onclick=showHome;$('#extraBackBtn').onclick=showHome;$('#extraBtn').onclick=startExtra;
    document.querySelectorAll('[data-subject]').forEach(b=>b.onclick=()=>openSubject(b.dataset.subject));
    window.addEventListener('storage',e=>{if(Object.values(SUBJECTS).some(x=>x.storage===e.key))setTimeout(scan,20)});
    scanTimer=setInterval(scan,400);
    window.addEventListener('pagehide',()=>clearInterval(scanTimer));
    if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  }

  capture();bind();render();
})();