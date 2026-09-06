(() => {
  'use strict';

  const ERROR_LABELS = {
    A:'問題文の読み違い',
    B:'知識不足',
    C:'方針が立たない',
    D:'途中の論理ミス',
    E:'計算ミス',
    F:'図・表・整理不足',
    G:'時間不足'
  };

  const CAUSE_ACTIONS = {
    A:'問題文の「条件」と「何を求めるか」を分けて印を付け、式を書く前に言い直す。',
    B:'不足した知識を1項目だけ確認し、24〜72時間後に同じ知識を使う問題をヒントなしで再テストする。',
    C:'式を書く前に図・表・小さい例のどれか1つを必ず作り、入口を言葉にする。',
    D:'途中式ごとに「何が分かったか」を短く書き、条件の取り違えがないか確認する。',
    E:'暗算を減らし、途中式を残して最後に逆算・概算のどちらかで検算する。',
    F:'式より先に図か表を1回作る。数量・対応・場合分けを見える形にしてから計算する。',
    G:'一定時間で入口が立たなければ印を付けて飛ばし、取れる問題を先に確保する。'
  };

  const DOMAIN_RULES = [
    [/計算/, '計算'],
    [/平面図形|角度|面積/, '平面図形'],
    [/立体図形|体積|展開図/, '立体図形'],
    [/規則|周期|数列/, '規則性'],
    [/場合の数|組合せ|並べ方|選び方/, '場合の数'],
    [/速さ|旅人算|通過算|流水算/, '速さ'],
    [/割合|比|比例/, '割合・比'],
    [/数の性質|倍数|約数|余り|整数/, '数の性質'],
    [/分数/, '分数'],
    [/つるかめ|過不足|差集め/, '文章題'],
    [/小問集合/, '小問集合']
  ];

  const DOMAIN_KEYWORDS = {
    '計算':['計算','整数','数の性質'],
    '平面図形':['平面図形','図形','角度','面積'],
    '立体図形':['立体図形','立体','体積','展開図'],
    '規則性':['規則性','規則','周期','数列'],
    '場合の数':['場合の数','場合分け','数え上げ','組合せ'],
    '速さ':['速さ','旅人算','通過算','流水算'],
    '割合・比':['比','割合','比例'],
    '数の性質':['数の性質','整数','倍数','約数','余り'],
    '分数':['分数','数の性質'],
    '文章題':['条件整理','逆向き思考'],
    '小問集合':['条件整理','逆向き思考']
  };

  function canonicalDomain(name) {
    const s=String(name||'');
    for (const [re,label] of DOMAIN_RULES) if (re.test(s)) return label;
    return s.replace(/[0-9０-９（）()・]/g,' ').trim() || 'その他';
  }

  function byDateDesc(a,b) {
    const ad=String(a&&a.date||''), bd=String(b&&b.date||'');
    if (ad!==bd) return bd.localeCompare(ad);
    return String(b&&b.importedAt||'').localeCompare(String(a&&a.importedAt||''));
  }

  function uniquePush(arr,value) {
    if (value && !arr.includes(value)) arr.push(value);
  }

  function weakDomainsForTest(a) {
    const seen={};
    (a.mathSections||[]).forEach(s=>{
      const scoreRate=Number(s.scoreRate||0);
      const avgRate=Number(s.avgRate||0);
      const delta=scoreRate-avgRate;
      if (!(delta<=-5 || scoreRate<60)) return;
      const domain=canonicalDomain(s.name);
      const severity=Math.max(0,-delta)+Math.max(0,60-scoreRate)*0.5;
      if (!seen[domain] || severity>seen[domain].severity) {
        seen[domain]={domain,severity,delta,scoreRate,name:s.name};
      }
    });
    return Object.values(seen);
  }

  function mean(values) {
    const nums=values.filter(v=>Number.isFinite(v));
    return nums.length ? nums.reduce((a,b)=>a+b,0)/nums.length : null;
  }

  function trend(latest, prior, getter, threshold, lowerIsBetter) {
    if (!latest || !prior.length) return {status:'insufficient',delta:null,latest:getter(latest),priorAvg:null};
    const current=getter(latest);
    const avg=mean(prior.map(getter));
    if (!Number.isFinite(current) || !Number.isFinite(avg)) return {status:'insufficient',delta:null,latest:current,priorAvg:avg};
    const delta=Math.round((current-avg)*10)/10;
    let status='stable';
    if (lowerIsBetter) {
      if (delta<=-threshold) status='improving';
      else if (delta>=threshold) status='worsening';
    } else {
      if (delta>=threshold) status='improving';
      else if (delta<=-threshold) status='worsening';
    }
    return {status,delta,latest:current,priorAvg:Math.round(avg*10)/10};
  }

  function analyze(analyses,limit=5) {
    const tests=(Array.isArray(analyses)?analyses:[]).slice().sort(byDateDesc).slice(0,limit);
    const total=tests.length;
    const causeStats={A:{tests:0,occurrences:0},B:{tests:0,occurrences:0},C:{tests:0,occurrences:0},D:{tests:0,occurrences:0},E:{tests:0,occurrences:0},F:{tests:0,occurrences:0},G:{tests:0,occurrences:0}};
    let causeEnteredTests=0;
    const domainStats={};
    let highMissTests=0, highMissPoints=0;

    tests.forEach((a,index)=>{
      const causes=Object.values(a.causes||{}).filter(c=>causeStats[c]);
      const causeSet=[...new Set(causes)];
      if (causeSet.length) causeEnteredTests++;
      causes.forEach(c=>causeStats[c].occurrences++);
      causeSet.forEach(c=>{
        causeStats[c].tests++;
        causeStats[c].recentWeight=(causeStats[c].recentWeight||0)+(limit-index);
      });

      weakDomainsForTest(a).forEach(d=>{
        if (!domainStats[d.domain]) domainStats[d.domain]={domain:d.domain,tests:0,severity:0,recentWeight:0,latest:false};
        const x=domainStats[d.domain];
        x.tests++;
        x.severity+=d.severity;
        x.recentWeight+=(limit-index);
        if (index===0) x.latest=true;
      });

      const m=a.metrics||{};
      if ((m.mustCount||0)>0) {
        highMissTests++;
        highMissPoints+=Number(m.mustPoints||0);
      }
    });

    const causes=Object.entries(causeStats).map(([code,x])=>({
      code,
      label:ERROR_LABELS[code],
      tests:x.tests,
      occurrences:x.occurrences,
      recentWeight:x.recentWeight||0
    })).sort((a,b)=>b.tests-a.tests || b.recentWeight-a.recentWeight || b.occurrences-a.occurrences);

    const domains=Object.values(domainStats).sort((a,b)=>
      b.tests-a.tests || b.recentWeight-a.recentWeight || b.severity-a.severity
    );

    const candidates=[];
    if (total>=2 && highMissTests>=2) {
      candidates.push({
        type:'high-miss',
        score:highMissTests*6+highMissPoints/5,
        title:'高正答率問題の取りこぼしを止める',
        evidence:'直近'+total+'回中'+highMissTests+'回で、正答率70%以上の問題を失点',
        action:'新しい難問を増やす前に、該当問題を元答案で原因確認→解き直し→数日後のヒントなし再テストまで行う。'
      });
    }

    const topCause=causes.find(x=>x.tests>=2);
    if (topCause) {
      candidates.push({
        type:'cause',
        code:topCause.code,
        score:topCause.tests*7+topCause.occurrences*1.5+topCause.recentWeight,
        title:topCause.code+'：'+topCause.label,
        evidence:'A〜G入力済み'+causeEnteredTests+'回中'+topCause.tests+'回で出現（計'+topCause.occurrences+'件）',
        action:CAUSE_ACTIONS[topCause.code]
      });
    }

    const topDomain=domains.find(x=>x.tests>=2 && x.domain!=='小問集合');
    if (topDomain) {
      candidates.push({
        type:'domain',
        domain:topDomain.domain,
        score:topDomain.tests*6+topDomain.recentWeight+topDomain.severity/8,
        title:topDomain.domain+'が繰り返し弱い',
        evidence:'直近'+total+'回中'+topDomain.tests+'回で、平均との差-5pt以下または得点率60%未満',
        action:'この分野の基本〜SAPIX標準を2〜3問だけ選び、解法暗記ではなく「入口を説明できるか」まで確認する。'
      });
    }

    const priorities=candidates.sort((a,b)=>b.score-a.score).slice(0,2);

    const latest=tests[0]||null;
    const prior=tests.slice(1,4);
    const recoverableTrend=trend(
      latest,prior,
      a=>Number(a&&a.metrics&&a.metrics.recoverablePoints),
      5,true
    );
    const mathDevTrend=trend(
      latest,prior,
      a=>Number(a&&a.summary&&a.summary.math&&a.summary.math.dev),
      2,false
    );

    const recommendationKeywords=[];
    domains.filter(x=>x.tests>=2).slice(0,2).forEach(d=>
      (DOMAIN_KEYWORDS[d.domain]||[d.domain]).forEach(k=>uniquePush(recommendationKeywords,k))
    );

    return {
      version:'2.3.0',
      window:total,
      causeEnteredTests,
      causes,
      domains,
      highMiss:{tests:highMissTests,totalPoints:highMissPoints},
      priorities,
      recoverableTrend,
      mathDevTrend,
      recommendationKeywords:recommendationKeywords.slice(0,10),
      tests:tests.map(a=>({
        date:a.date||'',
        name:a.name||'SAPIXテスト',
        mathDev:a.summary&&a.summary.math?a.summary.math.dev:null,
        mustCount:a.metrics?a.metrics.mustCount||0:0,
        mustPoints:a.metrics?a.metrics.mustPoints||0:0,
        recoverablePoints:a.metrics?a.metrics.recoverablePoints||0:0
      }))
    };
  }

  window.LongitudinalAnalyzer={
    version:'2.3.0',
    analyze,
    canonicalDomain,
    weakDomainsForTest
  };
})();