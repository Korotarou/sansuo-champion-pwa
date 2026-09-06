(() => {
  'use strict';

  const SUBJECTS=[
    {key:'math',label:'算数'},
    {key:'jp',label:'国語'},
    {key:'science',label:'理科'},
    {key:'social',label:'社会'}
  ];

  function keyOf(a){return String(a&&a.date||'')+'|'+String(a&&a.name||'');}
  function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}
  function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
  function median(values){
    const a=values.filter(Number.isFinite).slice().sort((x,y)=>x-y);
    if(!a.length)return null;
    const m=Math.floor(a.length/2);
    return a.length%2?a[m]:(a[m-1]+a[m])/2;
  }
  function sortedAnalyses(analyses){
    return (Array.isArray(analyses)?analyses:[]).slice().sort((a,b)=>{
      const ad=String(a&&a.date||''),bd=String(b&&b.date||'');
      if(ad!==bd)return bd.localeCompare(ad);
      return String(b&&b.importedAt||'').localeCompare(String(a&&a.importedAt||''));
    });
  }
  function subjectRow(a,key){
    const s=a&&a.summary&&a.summary[key];
    if(!s)return {score:null,max:null,dev:null};
    return {score:finite(s.score),max:finite(s.max),dev:finite(s.dev)};
  }
  function cutoffHistory(analyses,goal){
    const cutoffs=goal&&goal.cutoffs||{};
    return sortedAnalyses(analyses).map(a=>{
      const v=finite(cutoffs[keyOf(a)]);
      return v===null?null:{date:a.date||'',name:a.name||'',cutoff:v,max:a.summary&&a.summary.total4?finite(a.summary.total4.max):null};
    }).filter(Boolean);
  }
  function tierRoute(latest,gap){
    const m=latest&&latest.metrics||{};
    const must=Math.max(0,finite(m.mustPoints)||0);
    const target=Math.max(0,finite(m.targetPoints)||0);
    const growth=Math.max(0,finite(m.growthPoints)||0);
    let remain=gap===null?null:Math.max(0,gap);
    const steps=[];
    function add(key,label,available,priority){
      let use=null;
      if(remain!==null){
        use=Math.min(remain,available);
        remain=Math.max(0,remain-use);
      }
      steps.push({key,label,available,use,priority});
    }
    add('must','正答率70%以上の取りこぼし',must,1);
    add('target','正答率50〜70%の取りこぼし',target,2);
    add('growth','正答率30〜50%の失点',growth,3);
    return {must,target,growth,steps,remaining:remain};
  }
  function subjectRoles(latest){
    if(!latest)return[];
    const totalDev=latest.summary&&latest.summary.total4?finite(latest.summary.total4.dev):null;
    const rows=SUBJECTS.map(s=>({...s,...subjectRow(latest,s.key)}));
    rows.forEach(r=>{
      if(r.dev===null||totalDev===null)r.role='判定保留';
      else if(r.dev>=totalDev+3)r.role='強み';
      else if(r.dev<=totalDev-3)r.role='底上げ候補';
      else r.role='全体並み';
    });
    return rows;
  }
  function buildProcessTargets(latest,recovery,longitudinal,roles){
    if(!latest)return[];
    const m=latest.metrics||{};
    const out=[
      {
        area:'算数',
        target:'正答率70%以上の失点を0にする',
        reason:'今回 '+(m.mustCount||0)+'問・'+(m.mustPoints||0)+'点の取りこぼし'
      }
    ];
    if((m.targetCount||0)>0) out.push({
      area:'算数',
      target:'正答率50〜70%の失点を今回より減らす',
      reason:'今回 '+(m.targetCount||0)+'問・'+(m.targetPoints||0)+'点'
    });
    if(recovery&&recovery.due>0)out.push({
      area:'再テスト',
      target:'期限到来 '+recovery.due+'問を次回テスト前に消化',
      reason:'AIなし再現を優先'
    });
    const top=longitudinal&&longitudinal.priorities&&longitudinal.priorities[0];
    if(top)out.push({
      area:top.type==='cause'?'誤答原因':'弱点分野',
      target:top.title+'を次回は再発させない',
      reason:top.evidence
    });
    const low=roles.filter(r=>r.role==='底上げ候補').sort((a,b)=>(a.dev??999)-(b.dev??999))[0];
    if(low)out.push({
      area:low.label,
      target:'偏差値を少なくとも全体水準へ近づける',
      reason:'今回 '+low.label+' '+low.dev+'、4科 '+(latest.summary.total4&&latest.summary.total4.dev!=null?latest.summary.total4.dev:'—')
    });
    return out.slice(0,5);
  }
  function analyze(analyses,goal,recoverySummary,longitudinal){
    const tests=sortedAnalyses(analyses);
    const latest=tests[0]||null;
    const history=cutoffHistory(tests,goal||{});
    const latestKey=latest?keyOf(latest):'';
    const latestCutoff=latest?finite((goal&&goal.cutoffs||{})[latestKey]):null;
    const margin=clamp(finite(goal&&goal.margin)||0,0,50);
    const current=latest&&latest.summary&&latest.summary.total4?finite(latest.summary.total4.score):null;
    const max=latest&&latest.summary&&latest.summary.total4?finite(latest.summary.total4.max):null;
    const scenarioTarget=latestCutoff===null?null:Math.min(max||Infinity,latestCutoff+margin);
    const gap=scenarioTarget===null||current===null?null:Math.max(0,scenarioTarget-current);
    const route=tierRoute(latest,gap);
    const metrics=latest&&latest.metrics||{};
    const cf50=current===null?null:current+(finite(metrics.mustPoints)||0)+(finite(metrics.targetPoints)||0);
    const cf30=cf50===null?null:cf50+(finite(metrics.growthPoints)||0);
    const roles=subjectRoles(latest);
    const processTargets=buildProcessTargets(latest,recoverySummary,longitudinal,roles);
    const cutoffValues=history.map(x=>x.cutoff);
    let routeStatus='unknown';
    if(gap!==null){
      if(gap===0)routeStatus='at-or-above';
      else if(gap<=route.must)routeStatus='must-only';
      else if(gap<=route.must+route.target)routeStatus='within-50plus';
      else if(gap<=route.must+route.target+route.growth)routeStatus='needs-30to50';
      else routeStatus='beyond-known-math-recovery';
    }
    return {
      version:'2.5.0',
      latest:latest?{date:latest.date||'',name:latest.name||'',key:latestKey}:null,
      current,max,
      latestCutoff,
      margin,
      scenarioTarget,
      gap,
      route,
      routeStatus,
      counterfactual50:cf50,
      counterfactual30:cf30,
      cutoffHistory:{
        count:history.length,
        latest:history[0]||null,
        min:cutoffValues.length?Math.min(...cutoffValues):null,
        max:cutoffValues.length?Math.max(...cutoffValues):null,
        median:median(cutoffValues)
      },
      subjectRoles:roles,
      processTargets
    };
  }

  window.Alpha1Planner={version:'2.5.0',analyze,keyOf};
})();