/* Four-subject closed-loop quality engine v1. Local-only; stores aggregates, never raw answers/question IDs. */
(function(root){
  'use strict';
  const DAY=86400000, KEY='four_subject_improvement_loop_v1';
  const SUBJECTS=[['math','算数'],['japanese','国語'],['science','理科'],['social','社会']];
  const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
  const arr=x=>Array.isArray(x)?x.filter(Boolean):[];
  const num=x=>Number.isFinite(Number(x))?Number(x):0;
  const time=x=>x==null?NaN:new Date(x).getTime();
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const dateKey=(d=new Date())=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  function read(storage,key){try{return obj(JSON.parse(storage.getItem(key)||'null'));}catch(_){return {};}}
  function median(xs){const a=xs.filter(Number.isFinite).slice().sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
  function eventsFor(id,s,start,end){
    if(id==='math')return arr(s.studyLog).filter(e=>e&&e.type==='answer').map(e=>({id:e.id,at:e.at,ok:e.correct,seconds:num(e.seconds)})).filter(e=>typeof e.ok==='boolean'&&time(e.at)>=start&&time(e.at)<end);
    if(id==='japanese')return arr(s.attempts).map(e=>({id:e.qid,at:e.created,ok:e.success,seconds:num(e.seconds)})).filter(e=>typeof e.ok==='boolean'&&time(e.at)>=start&&time(e.at)<end);
    if(id==='social')return arr(s.attempts).map(e=>({id:e.qid,at:e.created,ok:e.correct,seconds:num(e.seconds)})).filter(e=>typeof e.ok==='boolean'&&time(e.at)>=start&&time(e.at)<end);
    return [];
  }
  function scienceAggregate(s,start,end){
    const rows=Object.values(obj(s.history)).map(obj).filter(h=>time(h.lastAt)>=start&&time(h.lastAt)<end);
    const attempts=rows.reduce((n,h)=>n+num(h.attempts),0), wrong=rows.reduce((n,h)=>n+num(h.wrong),0);
    const repeated=rows.reduce((n,h)=>n+Math.max(0,num(h.wrong)-1),0);
    const seconds=rows.map(h=>num(h.totalSeconds)>0&&num(h.attempts)>0?num(h.totalSeconds)/num(h.attempts):NaN).filter(Number.isFinite);
    return {attempts,wrong,repeated,seconds};
  }
  function analyze(input,date=dateKey()){
    input=obj(input);const start=time(date+'T00:00:00'),end=start+DAY,recent14=start-13*DAY,recent7=start-6*DAY;
    if(!Number.isFinite(start))throw new Error('Valid local date required');
    const aq=root.AdaptiveQuality&&root.AdaptiveQuality.plan?root.AdaptiveQuality.plan(input,date):null;
    const adaptive=aq?Object.fromEntries(aq.items.map(x=>[x.id,x.evidence])):{};
    const subjects={};let total7=0;
    for(const [id,name] of SUBJECTS){
      const s=obj(input[id]),e14=eventsFor(id,s,recent14,end),e7=e14.filter(e=>time(e.at)>=recent7),a=obj(adaptive[id]);
      let attempts=e14.length,wrong=e14.filter(e=>!e.ok).length,repeated=0,times=e14.map(e=>e.seconds).filter(x=>x>0&&x<7200);
      const miss=new Map();e14.filter(e=>!e.ok&&typeof e.id==='string').forEach(e=>miss.set(e.id,(miss.get(e.id)||0)+1));
      repeated=[...miss.values()].reduce((n,v)=>n+Math.max(0,v-1),0);
      let attempts7=e7.length;
      if(id==='science'){
        if(Array.isArray(s.attemptLog)){
          const exact=arr(s.attemptLog).map(e=>({id:e.qid,at:e.at,ok:e.correct,seconds:num(e.seconds)})).filter(e=>typeof e.ok==='boolean'&&time(e.at)>=recent14&&time(e.at)<end);
          const exact7=exact.filter(e=>time(e.at)>=recent7),miss2=new Map();exact.filter(e=>!e.ok&&typeof e.id==='string').forEach(e=>miss2.set(e.id,(miss2.get(e.id)||0)+1));
          attempts=exact.length;wrong=exact.filter(e=>!e.ok).length;repeated=[...miss2.values()].reduce((n,v)=>n+Math.max(0,v-1),0);times=exact.map(e=>e.seconds).filter(x=>x>0&&x<7200);attempts7=exact7.length;
        }else{
          const x=scienceAggregate(s,recent14,end),x7=scienceAggregate(s,recent7,end);
          attempts=x.attempts;wrong=x.wrong;repeated=x.repeated;times=x.seconds;attempts7=x7.attempts;
        }
      }
      const med=median(times),slowThreshold=med===null?null:Math.max(90,med*1.6),slow=slowThreshold===null?0:times.filter(x=>x>slowThreshold).length;
      subjects[id]={id,name,attempts14:attempts,attempts7,wrong14:wrong,repeated14:repeated,timingCount:times.length,avgSeconds:times.length?Math.round(times.reduce((x,y)=>x+y,0)/times.length):null,medianSeconds:med===null?null:Math.round(med),slowRate:times.length?Math.round(slow/times.length*100)/100:null,overdue:num(a.overdue),due:num(a.due),recoverable:num(a.recoverable),neglect:a.neglect==null?null:num(a.neglect)};
      total7+=attempts7;
    }
    Object.values(subjects).forEach(s=>s.share7=total7?Math.round(s.attempts7/total7*100)/100:0);
    const candidates=[];const add=(subject,type,score,title,evidence,action)=>candidates.push({subject,type,score:Math.round(score*10)/10,title,evidence,action});
    for(const s of Object.values(subjects)){
      if(s.recoverable>0)add(s.id,'recoverable',100+s.recoverable*6,s.name+'の「取るべき失点」を回収',`正答率70%以上の未卒業失点 ${s.recoverable}件`,'新しい難問より先に、元答案の原因確認→解き直し→数日後の自力再テストを行う。');
      if(s.overdue>0)add(s.id,'overdue',90+s.overdue*4,s.name+'の期限超過を解消',`期限超過 ${s.overdue}件 / 期限到来 ${s.due}件`,'期限を過ぎた再テストから消化し、ヒントなしで再現できるか確認する。');
      if(s.repeated14>0)add(s.id,'repeat',80+s.repeated14*5,s.name+'の繰り返しミスを止める',`直近14日で反復ミス ${s.repeated14}回`,'同じ型を追加で解く前に、誤答原因を1つ決めて次の1問で再発しないか確認する。');
      if(s.timingCount>=4&&s.slowRate>=0.35)add(s.id,'timing',55+s.slowRate*20,s.name+'の時間のかかり方を確認',`時間記録 ${s.timingCount}件 / 遅い回答比率 ${Math.round(s.slowRate*100)}%`,'正解数を増やすより、時間がかかった問題で入口・整理・計算のどこに時間を使ったか確認する。');
    }
    if(total7>=12){
      for(const s of Object.values(subjects)){
        if(s.share7<0.15&&s.attempts7<3)add(s.id,'balance',35+(0.15-s.share7)*100,s.name+'の空白を小さく戻す',`直近7日の4科回答に占める比率 ${Math.round(s.share7*100)}%`,'他科の復習を圧迫しない範囲で、基本〜標準を2問だけ追加する。');
      }
    }
    const remediation=candidates.some(c=>['recoverable','overdue','repeat'].includes(c.type));
    const priority={recoverable:0,overdue:1,repeat:2,timing:3,balance:4};
    candidates.sort((a,b)=>(priority[a.type]??9)-(priority[b.type]??9)||b.score-a.score||a.subject.localeCompare(b.subject));
    const selected=candidates.slice(0,3);
    const errors=[];
    if(selected.length>3)errors.push('too_many_candidates');
    if(remediation&&selected.some(c=>c.type==='balance')&&!selected.some(c=>['recoverable','overdue','repeat'].includes(c.type)))errors.push('balance_before_remediation');
    const serialized=JSON.stringify(selected);
    if(/(?:qid|questionId|answer|profile|受験番号|氏名)/i.test(serialized))errors.push('raw_identifier_leak');
    if(/筑駒|開成|偏差値/.test(serialized))errors.push('premature_stretch_pressure');
    return {version:1,date,status:errors.length?'REVIEW':'PASS',subjects,candidates:selected,validation:{errors,remediationFirst:remediation,rawQuestionIdsStored:false,externalTransfer:false,total7}};
  }
  function load(storage){
    const input=root.AdaptiveQuality&&root.AdaptiveQuality.load?root.AdaptiveQuality.load(storage):{};
    if(!input.parent)input.parent=read(storage,'sansuo_parent_dashboard_v1');
    return input;
  }
  function compact(report){
    return {date:report.date,version:1,status:report.status,subjects:Object.fromEntries(Object.entries(report.subjects).map(([id,s])=>[id,{attempts7:s.attempts7,attempts14:s.attempts14,wrong14:s.wrong14,repeated14:s.repeated14,timingCount:s.timingCount,avgSeconds:s.avgSeconds,slowRate:s.slowRate,overdue:s.overdue,due:s.due,recoverable:s.recoverable,neglect:s.neglect,share7:s.share7}])),candidates:report.candidates.map(c=>({subject:c.subject,type:c.type,score:c.score,title:c.title,evidence:c.evidence,action:c.action})),validation:report.validation};
  }
  function capture(storage,report){
    const saved=read(storage,KEY),days=arr(saved.days).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&x.date<report.date&&time(x.date)>=time(report.date)-27*DAY);
    const out=[...days,compact(report)].sort((a,b)=>a.date.localeCompare(b.date)).slice(-28);
    try{storage.setItem(KEY,JSON.stringify({version:1,days:out,latest:compact(report)}));}catch(_){}
    return out;
  }
  function current(storage,date=dateKey()){
    if(!storage)try{storage=root.localStorage;}catch(_){}
    const report=analyze(load(storage),date);capture(storage,report);return report;
  }
  function fingerprint(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0');}
  function capsule(report){
    const c=compact(report);return {schema:'four-subject-improvement-capsule-v1',snapshotDate:report.date,policy:{goal:'SAPIXの次回学習で回収可能な失点・復習期限・反復ミスを先に減らす',childFacingPressure:'do-not-display-class-rank-or-school-pressure',privacy:'aggregates-only',autoApply:false},...c};
  }
  function codexReadyText(report){
    const data=JSON.stringify(capsule(report)),task='AI-EVAL-OPS-FOUR-SUBJECT-QUALITY-'+report.date.replace(/-/g,'')+'-'+fingerprint(data).toUpperCase();
    const contract={task_id:task,task_version:'v1',objective:'Create the smallest tested local improvement candidate from the privacy-safe four-subject aggregate capsule.',risk_inputs:{operation_type:'bounded_local_edit',nonlocal_side_effect:false,destructive:false,reversible:true,rollback_available:false,sensitive_data:false,medical_or_legal_high_stakes:false,financial_commitment:false,system_scope_change:false},acceptance_criteria:[{id:'tests-pass',evidence_path:'test_result.status',expected:'PASS',critical:true},{id:'schema-valid',evidence_path:'schema_valid',expected:true,critical:true},{id:'no-critical-regression',evidence_path:'critical_regression',expected:false,critical:true}],deterministic_evidence:{},retry_repair_budget:0,rollback_contract:null};
    const evidence={task_id:task,deterministic_evidence:{evidence_complete:true,paths_touched:[],required_files:[],absent_files:[],command_results:[],test_result:{status:'NOT_RUN'},lint_result:{status:'NOT_RUN'},typecheck_result:{status:'NOT_RUN'},schema_valid:true,forbidden_side_effects:{network_used:false,commit:false,push:false,deploy:false,system_change:false},regression_counters:{critical:0},critical_regression:false}};
    return `# Four-subject quality improvement candidate\n\nTask ID: ${task}\nStatus: READY\nTarget directory: C:\\ChatGPT CODEX\\20260921_sansuo_champion_pwa_v01\\PROJECT\nTimeout minutes: 10\nModel profile: LUNA\nReasoning: LOW\nEval Contract: REQUIRED\n\n<!-- AI_EVAL_OPS_EVALUATOR_REQUEST\n${JSON.stringify(contract)}\n-->\n\n## Privacy-safe aggregate capsule\n\n${data}\n\n## Task\nRead the aggregate capsule only. Propose the smallest local code/content improvement that addresses the highest-priority repeated signal without weakening existing 4-subject routes, offline behavior, child-calm UI, payment safety, or the rule that recovery comes before stretch work. Run existing local validation and any focused deterministic test you add. Do not commit, push, deploy, use network, or alter system settings. Return a tested update candidate only; if evidence is insufficient, return NO_CHANGE.\n\n## Required final evidence\nReport actual observations only. Then emit exactly AI_EVAL_OPS_EVIDENCE_RESULT followed by one compact JSON line with this shape; replace NOT_RUN and empty arrays only with truthful observed values.\nAI_EVAL_OPS_EVIDENCE_RESULT\n${JSON.stringify(evidence)}\n`;
  }
  function download(report,kind='capsule'){
    if(!root.document||!root.Blob||!root.URL)return false;
    const text=kind==='codex'?codexReadyText(report):JSON.stringify(capsule(report),null,2),ext=kind==='codex'?'.md':'.json';
    const blob=new Blob([text],{type:kind==='codex'?'text/markdown':'application/json'}),a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download=(kind==='codex'?'four_subject_codex_ready_':'four_subject_improvement_capsule_')+report.date+ext;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);return true;
  }
  function parentHTML(){
    const r=current(),cards=r.candidates.map((c,i)=>`<div class="pd-improve-card"><span>${i+1}</span><div><b>${c.title}</b><small>${c.evidence}</small><p>${c.action}</p></div></div>`).join('')||'<div class="pd-empty">大きな偏りはまだ検出されていません。今の復習ルールを維持します。</div>';
    return `<section class="pd-panel pd-improvement"><div class="pd-panel-head"><div><span>AUTO</span><h3>4科 自動改善ループ</h3></div><small>${r.status==='PASS'?'自己検証PASS':'要確認'}</small></div><div class="pd-improve-summary"><b>学習履歴から自動で最大3件に絞ります。</b><span>回収可能失点 → 期限超過 → 反復ミス → 時間 → 科目偏りの順。難問追加を先にしません。</span></div>${cards}<div class="pd-improve-actions"><button class="btn ghost small" id="pdImprovementCapsule">匿名改善カプセル</button><button class="btn ghost small" id="pdImprovementCodex">Codex改善依頼</button><small>問題ID・答案・氏名は含めません。自動適用・自動公開はしません。</small></div></section>`;
  }
  root.ImprovementLoop={KEY,analyze,load,current,compact,capture,capsule,codexReadyText,download,parentHTML};
})(typeof window==='undefined'?globalThis:window);
