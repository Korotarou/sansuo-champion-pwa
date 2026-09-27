(() => {
  'use strict';
  const KEY='four_subject_dopa_v1';
  const SEEN='four_subject_dopa_evo_seen_v1';
  const STAGES=[
    {min:0,name:'CORE EGG',jp:'コアエッグ',world:'起動前デッキ',next:100},
    {min:100,name:'SPARK',jp:'スパーク',world:'ネオンラボ',next:250},
    {min:250,name:'VOLT',jp:'ボルト',world:'スカイサーキット',next:500},
    {min:500,name:'NEON BEAST',jp:'ネオンビースト',world:'プラズマシティ',next:900},
    {min:900,name:'OVERDRAGON',jp:'オーバードラゴン',world:'オーロラリフト',next:1400},
    {min:1400,name:'HYPER TITAN',jp:'ハイパータイタン',world:'タイタンオービット',next:2200},
    {min:2200,name:'APEX CORE',jp:'エイペックス・コア',world:'レジェンドコア',next:null}
  ];
  const SUBJECTS={math:['算','MATH'],japanese:['国','JAPANESE'],science:['理','SCIENCE'],social:['社','SOCIAL']};
  let lastSignature='';
  const $=s=>document.querySelector(s);
  function read(){try{return JSON.parse(localStorage.getItem(KEY)||'null')||{}}catch{return {}}}
  function stageIndex(dopa){let n=0;for(let i=0;i<STAGES.length;i++)if(Number(dopa||0)>=STAGES[i].min)n=i;return n}
  function cores(state){
    const out={math:false,japanese:false,science:false,social:false};
    (state.history||[]).forEach(x=>{if(x&&x.correct&&out[x.subject]!==undefined)out[x.subject]=true});
    return out;
  }
  function applyWorld(i){
    for(let n=0;n<STAGES.length;n++)document.body.classList.remove('world-'+n);
    document.body.classList.add('world-'+i);
  }
  function evolutionPop(i){
    const seen=Number(localStorage.getItem(SEEN)||0);
    if(i<=seen){if(i>seen)localStorage.setItem(SEEN,String(i));return}
    localStorage.setItem(SEEN,String(i));
    const root=$('#evolutionPop');if(!root)return;
    root.innerHTML=`<small>EVOLUTION</small><strong>${STAGES[i].name}</strong><span>${STAGES[i].jp}へ進化！</span>`;
    root.classList.add('show');
    setTimeout(()=>root.classList.remove('show'),1900);
  }
  function render(){
    const s=read(),dopa=Number(s.dopa||0),i=stageIndex(dopa),st=STAGES[i],c=cores(s);
    const sig=[dopa,i,s.extra?.bossClears||0,...Object.values(c)].join('|');if(sig===lastSignature)return;lastSignature=sig;
    applyWorld(i);
    const name=$('#creatureName'),stage=$('#creatureStage'),world=$('#worldName'),boss=$('#bossClearCount'),meter=$('#evoMeter'),next=$('#evoNext'),creature=$('#dopaCreature'),grid=$('#evoCoreGrid'),map=$('#worldMap');
    if(name)name.textContent=st.name;if(stage)stage.textContent=st.jp;if(world)world.textContent=st.world;if(boss)boss.textContent=String(s.extra?.bossClears||0);
    if(creature){creature.className='dopa-creature stage-'+i;creature.setAttribute('aria-label',st.jp)}
    const base=st.min,cap=st.next??st.min+1,pct=st.next?Math.max(0,Math.min(100,(dopa-base)/(cap-base)*100)):100;
    if(meter)meter.style.width=pct+'%';
    if(next)next.textContent=st.next?`次の進化まで ${Math.max(0,st.next-dopa)} DOPA`:'FINAL FORM COMPLETE';
    if(grid)grid.innerHTML=Object.entries(SUBJECTS).map(([k,v])=>`<div class="evo-core ${k} ${c[k]?'on':''}"><span>${v[0]}</span><b>${v[1]}</b><i>${c[k]?'EQUIPPED':'LOCK'}</i></div>`).join('');
    if(map)map.innerHTML=STAGES.map((x,n)=>`<div class="world-node ${n<i?'cleared':''} ${n===i?'current':''}"><span>${n+1}</span><b>${x.world}</b><small>${x.min} DOPA</small></div>`).join('');
    evolutionPop(i);
  }
  const obs=new MutationObserver(render);
  window.addEventListener('DOMContentLoaded',()=>{
    const target=$('#dopaTotal');if(target)obs.observe(target,{childList:true,characterData:true,subtree:true});
    render();setInterval(render,700);
  });
})();