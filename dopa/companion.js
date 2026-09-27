(() => {
  'use strict';

  const KEY='four_subject_dopa_v1';
  const STAGES=[
    {min:0,name:'CORE EGG'},
    {min:100,name:'SPARK'},
    {min:250,name:'VOLT'},
    {min:500,name:'NEON BEAST'},
    {min:900,name:'OVERDRAGON'},
    {min:1400,name:'HYPER TITAN'},
    {min:2200,name:'APEX CORE'}
  ];
  const SUBJECTS={math:'算',japanese:'国',science:'理',social:'社'};
  const frame=document.getElementById('subjectFrame');
  if(!frame)return;

  let lastHistory=0;
  let lastStage=0;
  let activeDoc=null;
  let timer=null;

  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')||{}}catch{return {}}};
  const stageOf=d=>{let i=0;for(let n=0;n<STAGES.length;n++)if((Number(d)||0)>=STAGES[n].min)i=n;return i};
  const nextNeed=(d,idx)=>idx>=STAGES.length-1?0:Math.max(0,STAGES[idx+1].min-(Number(d)||0));
  const owns=(state,s)=>Array.isArray(state.history)&&state.history.some(h=>h&&h.subject===s&&h.correct===true);

  function styleText(){return `
#dopa-companion-hud{position:fixed;right:14px;bottom:14px;z-index:2147483000;width:152px;padding:10px 10px 9px;border-radius:18px;background:linear-gradient(145deg,#0d1229ef,#181735ef);border:1px solid #4d5b92;box-shadow:0 12px 34px #0009,0 0 22px #48e7ff22;color:#f8fbff;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",sans-serif;pointer-events:none;backdrop-filter:blur(10px)}
#dopa-companion-hud *{box-sizing:border-box}.dc-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.dc-name{font-size:10px;font-weight:1000;letter-spacing:.07em}.dc-dopa{font-size:9px;color:#ffd85a;font-weight:1000}.dc-field{position:relative;height:92px;display:grid;place-items:center;overflow:hidden}.dc-aura{position:absolute;width:88px;height:88px;border-radius:50%;background:radial-gradient(circle,#48e7ff35,transparent 65%);animation:dcPulse 1.6s ease-in-out infinite alternate}.dc-beast{position:relative;width:66px;height:60px;transition:.2s;filter:drop-shadow(0 0 12px #48e7ff88)}.dc-body{position:absolute;left:8px;top:9px;width:50px;height:46px;border-radius:52% 48% 45% 55%;background:linear-gradient(145deg,#efffff,#54e8ff 35%,#735cff 78%);box-shadow:inset -8px -8px 14px #18224e77,0 0 20px #48e7ff88}.dc-eye{position:absolute;top:23px;width:7px;height:9px;border-radius:50%;background:#091325;box-shadow:0 0 6px #fff}.dc-eye.l{left:24px}.dc-eye.r{right:24px}.dc-core{position:absolute;left:29px;top:38px;width:9px;height:9px;border-radius:50%;background:#ffd85a;box-shadow:0 0 12px #ffd85a}.dc-horn{position:absolute;top:0;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:18px solid #e9faff;opacity:0;transition:.2s}.dc-horn.l{left:7px;transform:rotate(-24deg)}.dc-horn.r{right:7px;transform:rotate(24deg)}.dc-wing{position:absolute;top:18px;width:28px;height:22px;background:linear-gradient(135deg,#ff4fd888,#48e7ff55);clip-path:polygon(0 50%,100% 0,72% 100%);opacity:0;transition:.2s}.dc-wing.l{left:-17px;transform:scaleX(-1)}.dc-wing.r{right:-17px}.dc-tail{position:absolute;right:-17px;bottom:5px;width:31px;height:10px;border-radius:50%;border-top:6px solid #ff4fd8;transform:rotate(22deg);opacity:0}.dc-stage-1 .dc-body{background:linear-gradient(145deg,#fff,#5df4ff 30%,#2b8cff 78%)}.dc-stage-2 .dc-horn{opacity:1}.dc-stage-3 .dc-tail{opacity:1}.dc-stage-4 .dc-wing{opacity:1}.dc-stage-5 .dc-beast{transform:scale(1.08);filter:drop-shadow(0 0 18px #ff4fd8aa)}.dc-stage-6 .dc-beast{transform:scale(1.14);filter:drop-shadow(0 0 22px #ffd85acc)}.dc-stage-6 .dc-body{background:linear-gradient(145deg,#fffbd2,#ffd85a 25%,#ff4fd8 58%,#6f62ff 90%)}
.dc-core-row{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}.dc-core-chip{height:20px;border-radius:7px;display:grid;place-items:center;background:#202641;color:#6e7798;font-size:9px;font-weight:1000;border:1px solid #30385f}.dc-core-chip.on{color:#061018;background:#64f7a2;box-shadow:0 0 9px #64f7a266}.dc-next{margin-top:6px;font-size:8px;color:#aeb7d7;text-align:center}.dc-float{position:absolute;left:50%;top:18px;transform:translateX(-50%);font-size:18px;font-weight:1000;color:#ffd85a;text-shadow:0 0 14px #ffd85a;animation:dcFloat .75s ease-out forwards}.dc-shot{position:absolute;left:34px;top:44px;width:20px;height:7px;border-radius:999px;background:linear-gradient(90deg,#fff,#48e7ff,#ff4fd8);box-shadow:0 0 14px #48e7ff;animation:dcShot .55s ease-out forwards}.dc-hit .dc-beast{animation:dcAttack .42s cubic-bezier(.2,.9,.3,1)}.dc-retry .dc-beast{animation:dcRetry .42s ease}.dc-morph .dc-field:after{content:"EVOLUTION";position:absolute;inset:6px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:10px;font-weight:1000;letter-spacing:.14em;background:radial-gradient(circle,#ffd85a88,#ff4fd844 35%,transparent 70%);animation:dcMorph .9s ease-out forwards}.dc-bubble{position:absolute;right:5px;top:4px;padding:5px 7px;border-radius:10px;background:#111735;border:1px solid #53619b;font-size:8px;font-weight:1000;color:#fff;opacity:0}.dc-bubble.show{animation:dcBubble 1.1s ease-out}.dc-stage-4 .dc-aura,.dc-stage-5 .dc-aura,.dc-stage-6 .dc-aura{background:radial-gradient(circle,#ff4fd83b,#48e7ff18 42%,transparent 68%)}
@keyframes dcPulse{to{transform:scale(1.12);opacity:.55}}@keyframes dcAttack{0%{transform:translateX(0) scale(1)}45%{transform:translateX(-22px) scale(1.12)}100%{transform:translateX(0) scale(1)}}@keyframes dcRetry{20%{transform:translateX(-5px)}40%{transform:translateX(5px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}@keyframes dcFloat{to{transform:translate(-50%,-38px) scale(1.2);opacity:0}}@keyframes dcShot{to{transform:translateX(-190px) scaleX(2.2);opacity:0}}@keyframes dcMorph{0%{transform:scale(.4);opacity:0}35%{opacity:1}100%{transform:scale(1.5);opacity:0}}@keyframes dcBubble{0%{opacity:0;transform:translateY(4px)}15%,72%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-5px)}}
@media(max-width:700px){#dopa-companion-hud{right:8px;bottom:8px;width:126px;padding:8px;border-radius:15px}.dc-field{height:75px}.dc-beast{transform:scale(.88)}.dc-stage-5 .dc-beast{transform:scale(.94)}.dc-stage-6 .dc-beast{transform:scale(1)}}
@media(prefers-reduced-motion:reduce){#dopa-companion-hud *{animation:none!important;transition:none!important}}
`;}

  function inject(){
    try{
      const doc=frame.contentDocument;
      if(!doc||!doc.body||doc.location.href==='about:blank')return;
      activeDoc=doc;
      if(!doc.getElementById('dopa-companion-style')){
        const style=doc.createElement('style');style.id='dopa-companion-style';style.textContent=styleText();(doc.head||doc.documentElement).appendChild(style);
      }
      if(!doc.getElementById('dopa-companion-hud')){
        const hud=doc.createElement('aside');hud.id='dopa-companion-hud';hud.setAttribute('aria-hidden','true');
        hud.innerHTML='<div class="dc-head"><span class="dc-name">CORE EGG</span><span class="dc-dopa">0 DOPA</span></div><div class="dc-field"><i class="dc-aura"></i><div class="dc-beast"><i class="dc-horn l"></i><i class="dc-horn r"></i><i class="dc-wing l"></i><i class="dc-wing r"></i><i class="dc-tail"></i><div class="dc-body"></div><i class="dc-eye l"></i><i class="dc-eye r"></i><i class="dc-core"></i></div><div class="dc-bubble"></div></div><div class="dc-core-row"></div><div class="dc-next"></div>';
        doc.body.appendChild(hud);
      }
      refresh(false);
    }catch(e){activeDoc=null;}
  }

  function hud(){try{return activeDoc&&activeDoc.getElementById('dopa-companion-hud')}catch{return null}}

  function refresh(animate){
    const root=hud();if(!root)return;
    const state=read(),idx=stageOf(state.dopa),dopa=Number(state.dopa)||0;
    root.className=`dc-stage-${idx}`;
    root.querySelector('.dc-name').textContent=STAGES[idx].name;
    root.querySelector('.dc-dopa').textContent=`${dopa} DOPA`;
    root.querySelector('.dc-core-row').innerHTML=Object.entries(SUBJECTS).map(([k,v])=>`<span class="dc-core-chip ${owns(state,k)?'on':''}">${v}</span>`).join('');
    root.querySelector('.dc-next').textContent=idx>=STAGES.length-1?'APEX MODE｜MAX EVOLUTION':`次の進化まで ${nextNeed(dopa,idx)} DOPA`;
    if(animate&&idx>lastStage){root.classList.add('dc-morph');setTimeout(()=>root&&root.classList.remove('dc-morph'),950)}
    lastStage=idx;
  }

  function react(item){
    const root=hud();if(!root||!item)return;
    const field=root.querySelector('.dc-field'),bubble=root.querySelector('.dc-bubble');
    if(item.correct){
      root.classList.remove('dc-retry');void root.offsetWidth;root.classList.add('dc-hit');
      const shot=activeDoc.createElement('i');shot.className='dc-shot';field.appendChild(shot);
      const flo=activeDoc.createElement('b');flo.className='dc-float';flo.textContent=`+${Number(item.gain)||0}`;field.appendChild(flo);
      bubble.textContent=(SUBJECTS[item.subject]||'')+' CORE ATTACK';bubble.classList.remove('show');void bubble.offsetWidth;bubble.classList.add('show');
      setTimeout(()=>{shot.remove();flo.remove();root.classList.remove('dc-hit')},800);
    }else{
      root.classList.remove('dc-hit');void root.offsetWidth;root.classList.add('dc-retry');
      bubble.textContent='RETRY → 次の1問';bubble.classList.remove('show');void bubble.offsetWidth;bubble.classList.add('show');
      setTimeout(()=>root&&root.classList.remove('dc-retry'),700);
    }
  }

  function tick(){
    const state=read(),history=Array.isArray(state.history)?state.history:[];
    if(!hud())inject();
    if(history.length>lastHistory){
      const newest=history[history.length-1];
      const before=lastStage;
      refresh(true);
      react(newest);
      if(stageOf(state.dopa)>before){const root=hud();if(root){root.classList.add('dc-morph');setTimeout(()=>root&&root.classList.remove('dc-morph'),950)}}
    }else refresh(false);
    lastHistory=history.length;
  }

  frame.addEventListener('load',()=>setTimeout(()=>{inject();const s=read();lastHistory=Array.isArray(s.history)?s.history.length:0;lastStage=stageOf(s.dopa)},120));
  const initial=read();lastHistory=Array.isArray(initial.history)?initial.history.length:0;lastStage=stageOf(initial.dopa);
  timer=setInterval(tick,220);
  window.addEventListener('pagehide',()=>clearInterval(timer));
})();