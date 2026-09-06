(() => {
  'use strict';

  const DAY = 86400000;

  function dateOnly(d=new Date()) {
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }

  function parseDay(s) {
    const d=new Date(String(s||'')+'T00:00:00');
    return isNaN(d.getTime())?null:d;
  }

  function addDays(s,n) {
    const d=parseDay(s)||new Date();
    d.setDate(d.getDate()+n);
    return dateOnly(d);
  }

  function analysisKey(a) {
    return String(a&&a.date||'')+'|'+String(a&&a.name||'');
  }

  function recordId(a,q) {
    return analysisKey(a)+'|'+String(q&&q.id||'');
  }

  function defaultRecord(a,q) {
    return {
      id:recordId(a,q),
      testKey:analysisKey(a),
      testDate:a.date||'',
      testName:a.name||'SAPIXテスト',
      questionId:q.id||'',
      points:Number(q.points||0),
      correctRate:Number(q.rate||0),
      bucket:q.bucket||'',
      cause:(a.causes&&a.causes[q.id])||'',
      createdAt:new Date().toISOString(),
      attempts:[],
      status:'unresolved',
      nextReview:dateOnly(),
      graduatedAt:null
    };
  }

  function sync(analyses,records) {
    const old={};
    (Array.isArray(records)?records:[]).forEach(r=>{if(r&&r.id) old[r.id]=r;});
    const out=[];
    (Array.isArray(analyses)?analyses:[]).forEach(a=>{
      (a.mathQuestions||[]).filter(q=>!q.correct && Number(q.rate||0)>=50).forEach(q=>{
        const id=recordId(a,q);
        const rec=old[id]||defaultRecord(a,q);
        rec.cause=(a.causes&&a.causes[q.id])||rec.cause||'';
        rec.points=Number(q.points||rec.points||0);
        rec.correctRate=Number(q.rate||rec.correctRate||0);
        rec.bucket=q.bucket||rec.bucket||'';
        normalize(rec);
        out.push(rec);
        delete old[id];
      });
    });
    Object.values(old).forEach(r=>{
      if(r&&r.attempts&&r.attempts.length) {
        normalize(r);
        out.push(r);
      }
    });
    return out.sort((a,b)=>{
      if(a.status!==b.status) return a.status==='graduated'?1:b.status==='graduated'?-1:0;
      const ad=String(a.nextReview||''),bd=String(b.nextReview||'');
      return ad.localeCompare(bd)||String(b.testDate||'').localeCompare(String(a.testDate||''));
    });
  }

  function normalize(rec) {
    rec.attempts=Array.isArray(rec.attempts)?rec.attempts:[];
    const ordered=rec.attempts.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.at||'').localeCompare(String(b.at||'')));
    let anchorPass=null;
    let lastValidPass=null;
    let graduatedAt=null;
    for (const a of ordered) {
      if (a.result==='fail') {
        anchorPass=null;
        lastValidPass=null;
        continue;
      }
      if (!(a.result==='pass'&&a.noHint&&a.explained)) continue;
      const d=parseDay(a.date);
      if (!d) continue;
      lastValidPass=a;
      if (!anchorPass) {
        anchorPass=a;
        continue;
      }
      const first=parseDay(anchorPass.date);
      if (first && (d-first)>=3*DAY) {
        graduatedAt=a.date;
        break;
      }
    }
    if(graduatedAt) {
      rec.status='graduated';
      rec.graduatedAt=graduatedAt;
      rec.nextReview=null;
    } else if(anchorPass && lastValidPass) {
      rec.status='strengthening';
      rec.graduatedAt=null;
      rec.nextReview=addDays(anchorPass.date,3);
    } else {
      rec.status='unresolved';
      rec.graduatedAt=null;
      const last=ordered[ordered.length-1];
      rec.nextReview=last?addDays(last.date,1):(rec.nextReview||dateOnly());
    }
    return rec;
  }

  function addAttempt(records,id,result,date=dateOnly()) {
    return (records||[]).map(r=>{
      if(r.id!==id) return r;
      r.attempts=Array.isArray(r.attempts)?r.attempts:[];
      r.attempts.push({
        date,
        result:result==='pass'?'pass':'fail',
        noHint:result==='pass',
        explained:result==='pass',
        at:new Date().toISOString()
      });
      return normalize(r);
    });
  }

  function summary(records) {
    const rs=(records||[]).map(normalize);
    const today=dateOnly();
    const active=rs.filter(r=>r.status!=='graduated');
    const graduated=rs.filter(r=>r.status==='graduated');
    const due=active.filter(r=>!r.nextReview||r.nextReview<=today);
    return {
      total:rs.length,
      active:active.length,
      strengthening:active.filter(r=>r.status==='strengthening').length,
      unresolved:active.filter(r=>r.status==='unresolved').length,
      graduated:graduated.length,
      graduatedPoints:graduated.reduce((a,r)=>a+Number(r.points||0),0),
      activePoints:active.reduce((a,r)=>a+Number(r.points||0),0),
      due:due.length,
      dueRecords:due.sort((a,b)=>Number(b.correctRate||0)-Number(a.correctRate||0)||Number(b.points||0)-Number(a.points||0)),
      recentGraduates:graduated.slice().sort((a,b)=>String(b.graduatedAt||'').localeCompare(String(a.graduatedAt||''))).slice(0,5)
    };
  }

  function causeLifecycle(analyses,limit=5) {
    const tests=(analyses||[]).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,limit);
    const entered=tests.filter(a=>Object.keys(a.causes||{}).length>0);
    const codes=['A','B','C','D','E','F','G'];
    return codes.map(code=>{
      const seq=entered.map(a=>Object.values(a.causes||{}).includes(code));
      const total=seq.filter(Boolean).length;
      let status='insufficient';
      if(total>=2) {
        if(seq.length>=2&&!seq[0]&&!seq[1]) status='graduated';
        else if(seq.length>=1&&!seq[0]) status='improving';
        else status='active';
      }
      return {code,total,evaluable:entered.length,status};
    }).filter(x=>x.total>0);
  }

  function domainWeak(a,domain) {
    const engine=window.LongitudinalAnalyzer;
    if(!engine) return false;
    return engine.weakDomainsForTest(a).some(x=>x.domain===domain);
  }

  function domainLifecycle(analyses,limit=5) {
    const engine=window.LongitudinalAnalyzer;
    if(!engine) return [];
    const tests=(analyses||[]).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,limit);
    const report=engine.analyze(tests,limit);
    return (report.domains||[]).map(d=>{
      const seq=tests.map(a=>domainWeak(a,d.domain));
      let status='insufficient';
      if(d.tests>=2) {
        if(seq.length>=2&&!seq[0]&&!seq[1]) status='graduated';
        else if(seq.length>=1&&!seq[0]) status='improving';
        else status='active';
      }
      return {...d,status};
    });
  }

  function alphaStatus(analyses,goal) {
    const tests=(analyses||[]).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    const latest=tests[0]||null;
    const g=goal||{};
    const hasCutoff=g.cutoffScore!==''&&g.cutoffScore!==null&&g.cutoffScore!==undefined;
    const cutoff=hasCutoff?Number(g.cutoffScore):NaN;
    const own=latest&&latest.summary&&latest.summary.total4?Number(latest.summary.total4.score):NaN;
    const max=latest&&latest.summary&&latest.summary.total4?Number(latest.summary.total4.max):NaN;
    const recoverable=latest&&latest.metrics?Number(latest.metrics.recoverablePoints||0):0;
    const gap=Number.isFinite(cutoff)&&Number.isFinite(own)?Math.max(0,cutoff-own):null;
    return {
      enabled:g.enabled!==false,
      label:g.label||'SAPIX α1入室',
      currentClass:g.currentClass||'',
      cutoffScore:Number.isFinite(cutoff)?cutoff:null,
      ownScore:Number.isFinite(own)?own:null,
      maxScore:Number.isFinite(max)?max:null,
      gap,
      recoverablePoints:recoverable,
      recoverableCoversGap:gap!==null&&recoverable>=gap,
      testName:latest?latest.name||'':'',
      testDate:latest?latest.date||'':''
    };
  }

  window.RecoveryEngine={
    version:'2.4.0',
    sync,
    addAttempt,
    summary,
    normalize,
    causeLifecycle,
    domainLifecycle,
    alphaStatus,
    dateOnly
  };
})();