(() => {
  'use strict';

  const CORE_KEY = 'sansuo_champion_state_v2';
  const LEGACY_KEY = 'sansuo_champion_state_v1';
  const DASH_KEY = 'sansuo_parent_dashboard_v1';
  let dashboardActive = false;

  const ERROR_LABELS = {
    A: '問題文の読み違い',
    B: '知識不足',
    C: '方針が立たない',
    D: '途中の論理ミス',
    E: '計算ミス',
    F: '図・表・整理不足',
    G: '時間不足'
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, function(c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c];
    });
  }

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function coreState() {
    return loadJson(CORE_KEY, loadJson(LEGACY_KEY, {
      profile:{name:'挑戦者',grade:4},
      stats:{},
      studyLog:[],
      curriculumStart:new Date().toISOString().slice(0,10)
    }));
  }

  function dashState() {
    const saved = loadJson(DASH_KEY, {});
    const alphaGoal = saved.alphaGoal && typeof saved.alphaGoal==='object' ? saved.alphaGoal : {};
    return {
      tests: Array.isArray(saved.tests) ? saved.tests : [],
      weeklyFocus: saved.weeklyFocus || '',
      sapixAnalyses: Array.isArray(saved.sapixAnalyses) ? saved.sapixAnalyses : [],
      recoveryRecords: Array.isArray(saved.recoveryRecords) ? saved.recoveryRecords : [],
      alphaGoal: {
        enabled: alphaGoal.enabled !== false,
        label: alphaGoal.label || 'SAPIX α1入室',
        currentClass: alphaGoal.currentClass || '',
        margin: Number.isFinite(Number(alphaGoal.margin)) ? Math.max(0,Math.min(50,Number(alphaGoal.margin))) : 0,
        cutoffs: alphaGoal.cutoffs && typeof alphaGoal.cutoffs==='object' ? alphaGoal.cutoffs : {}
      }
    };
  }

  function saveDash(next) {
    try { localStorage.setItem(DASH_KEY, JSON.stringify(next)); } catch (e) {}
  }

  function problemBank() {
    try { return typeof PROBLEMS !== 'undefined' && Array.isArray(PROBLEMS) ? PROBLEMS : []; }
    catch (e) { return []; }
  }

  function isMastered(s) {
    return !!(s && s.solved && s.explained && (s.noHintCorrect || 0) > 0 && (s.reviewStage || 0) >= 2);
  }

  function todayStart() {
    const d = new Date();
    d.setHours(0,0,0,0);
    return d;
  }

  function weekStart() {
    const d = todayStart();
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return d;
  }

  function dueReviews(state) {
    const now = Date.now();
    return problemBank().filter(function(p) {
      const s = state.stats && state.stats[p.id];
      return s && s.nextReview && new Date(s.nextReview).getTime() <= now && !isMastered(s);
    }).sort(function(a,b) {
      return new Date(state.stats[a.id].nextReview) - new Date(state.stats[b.id].nextReview);
    });
  }

  function aggregateErrors(state) {
    const out = {A:0,B:0,C:0,D:0,E:0,F:0,G:0};
    Object.values(state.stats || {}).forEach(function(s) {
      const errors = s && s.errors ? s.errors : {};
      Object.keys(out).forEach(function(k) {
        const v = errors[k];
        if (typeof v === 'number') out[k] += v;
        else if (v) out[k] += 1;
      });
    });
    const ds = dashState();
    (ds.sapixAnalyses || []).forEach(function(a) {
      Object.values(a.causes || {}).forEach(function(cause) {
        if (Object.prototype.hasOwnProperty.call(out, cause)) out[cause] += 1;
      });
    });
    return out;
  }

  function weakTags(state) {
    const scores = {};
    const byId = {};
    problemBank().forEach(function(p) { byId[p.id] = p; });
    Object.keys(state.stats || {}).forEach(function(id) {
      const s = state.stats[id];
      const p = byId[id];
      if (!p || !s || !(s.attempts > 0)) return;
      const penalty = Math.max(0, (s.attempts || 0) - (s.correct || 0)) + (s.hints || 0) * 0.5 + (s.quality === '△' ? 1 : 0);
      (p.tags || []).forEach(function(tag) { scores[tag] = (scores[tag] || 0) + penalty; });
    });
    return Object.entries(scores).sort(function(a,b){ return b[1]-a[1]; }).slice(0,5);
  }

  function weekActivity(state) {
    const start = weekStart().getTime();
    const events = (state.studyLog || []).filter(function(e) {
      const t = new Date(e.at || 0).getTime();
      return t >= start;
    });
    const newIds = {};
    let reviews = 0, explains = 0, seconds = 0;
    events.forEach(function(e) {
      if (e.firstExposure && e.id) newIds[e.id] = true;
      if (e.mode === 'review') reviews++;
      if (e.type === 'explain') explains++;
      seconds += Number(e.seconds || 0);
    });
    return {newCount:Object.keys(newIds).length, reviews:reviews, explains:explains, minutes:Math.round(seconds/60)};
  }

  function currentWeekNumber(state) {
    const start = new Date((state.curriculumStart || new Date().toISOString().slice(0,10)) + 'T00:00:00');
    const now = todayStart();
    if (isNaN(start.getTime())) return 1;
    return Math.max(1, Math.min(52, Math.floor((now-start)/604800000)+1));
  }

  function currentPlan(state) {
    try {
      if (typeof CURRICULUM_WEEKS !== 'undefined' && Array.isArray(CURRICULUM_WEEKS)) {
        return CURRICULUM_WEEKS[currentWeekNumber(state)-1] || null;
      }
    } catch (e) {}
    return null;
  }

  function recommended(state, limit) {
    const dueIds = {};
    dueReviews(state).forEach(function(p){ dueIds[p.id] = true; });
    const weak = weakTags(state);
    const weakSet = {};
    weak.slice(0,3).forEach(function(x){ weakSet[x[0]] = x[1]; });
    const ds = dashState();
    const latest = latestSapix(ds);
    const latestWords = latest && Array.isArray(latest.focusKeywords) ? latest.focusKeywords : [];
    const longitudinal = longitudinalReport(ds);
    const repeatWords = longitudinal && Array.isArray(longitudinal.recommendationKeywords) ? longitudinal.recommendationKeywords : [];
    return problemBank().filter(function(p) {
      const st = state.stats && state.stats[p.id];
      return !dueIds[p.id] && !isMastered(st);
    }).map(function(p) {
      const st = state.stats && state.stats[p.id] ? state.stats[p.id] : {};
      let score = st.attempts ? 15 : 30;
      if (st.quality === '△') score += 50;
      if ((st.hints || 0) > 0) score += 20;
      (p.tags || []).forEach(function(t){ score += (weakSet[t] || 0) * 6; });
      const haystack = [p.title,p.familyName,p.family].concat(p.tags || []).join(' ');
      latestWords.forEach(function(word) {
        if (word && haystack.indexOf(word) >= 0) score += 28;
      });
      repeatWords.forEach(function(word) {
        if (word && haystack.indexOf(word) >= 0) score += 58;
      });
      return [p, score];
    }).sort(function(a,b){ return b[1]-a[1]; }).slice(0,limit).map(function(x){ return x[0]; });
  }

  function metric(label, value, foot) {
    return '<div class="pd-metric"><div class="pd-metric-label">'+esc(label)+'</div><div class="pd-metric-value">'+esc(value)+'</div><div class="pd-metric-foot">'+esc(foot || '')+'</div></div>';
  }

  function emptyNote(text) {
    return '<div class="pd-empty">'+esc(text)+'</div>';
  }

  function latestSapix(ds) {
    return (ds.sapixAnalyses || []).slice().sort(function(a,b) {
      const ad=String(a&&a.date||''), bd=String(b&&b.date||'');
      if (ad!==bd) return bd.localeCompare(ad);
      return String(b&&b.importedAt||'').localeCompare(String(a&&a.importedAt||''));
    })[0] || null;
  }

  function longitudinalReport(ds) {
    if (!window.LongitudinalAnalyzer) return null;
    try { return window.LongitudinalAnalyzer.analyze(ds.sapixAnalyses || [], 5); }
    catch (e) { return null; }
  }

  function trendWord(t) {
    if (!t || t.status==='insufficient') return '判定保留';
    if (t.status==='improving') return '改善';
    if (t.status==='worsening') return '悪化';
    return '横ばい';
  }

  function trendClass(t) {
    if (!t) return '';
    return t.status==='improving'?'good':t.status==='worsening'?'bad':'';
  }

  function longitudinalHtml(report) {
    if (!report || report.window < 2) {
      return '<div class="pd-long-empty"><b>2回以上のSAPIX結果で継続弱点を判定します。</b><p>単回の失点を「弱点」と決めつけず、同じ誤答原因・分野が繰り返すかを確認します。</p></div>';
    }
    const priorities=(report.priorities||[]).map(function(p,i) {
      return '<div class="pd-long-priority"><span>重点 '+(i+1)+'</span><div><b>'+esc(p.title)+'</b><small>'+esc(p.evidence)+'</small><p>'+esc(p.action)+'</p></div></div>';
    }).join('') || '<div class="pd-long-ok"><b>繰り返し弱点はまだ確定していません。</b><p>単発の失点より、次のテストで同じ原因が再発するかを見ます。</p></div>';

    const causes=(report.causes||[]).filter(function(x){return x.tests>0;}).slice(0,4).map(function(x) {
      return '<div class="pd-long-row"><div><b>'+esc(x.code+' '+x.label)+'</b><small>計'+x.occurrences+'件</small></div><span>A〜G入力済み'+report.causeEnteredTests+'回中 '+x.tests+'回</span></div>';
    }).join('') || emptyNote('A〜Gの原因入力がまだありません。答案を確認したものだけ記録します。');

    const domains=(report.domains||[]).filter(function(x){return x.tests>0;}).slice(0,4).map(function(x) {
      return '<div class="pd-long-row"><div><b>'+esc(x.domain)+'</b><small>'+(x.latest?'直近テストでも弱い':'過去に反復')+'</small></div><span>直近'+report.window+'回中 '+x.tests+'回</span></div>';
    }).join('') || emptyNote('分野別の反復弱点はまだ検出されていません。');

    const tr=report.recoverableTrend||{};
    const md=report.mathDevTrend||{};
    const history=(report.tests||[]).map(function(t) {
      return '<div class="pd-long-test"><span>'+esc(t.date||'')+'</span><b>算 '+esc(t.mathDev==null?'—':t.mathDev)+'</b><span>70%以上失点 '+t.mustCount+'問</span><span>回収候補 '+t.recoverablePoints+'点</span></div>';
    }).join('');

    return '<div class="pd-long-wrap">'+
      '<div class="pd-long-priorities">'+priorities+'</div>'+
      '<div class="pd-long-grid"><div><h4>繰り返す誤答原因</h4>'+causes+'</div><div><h4>繰り返す分野</h4>'+domains+'</div></div>'+
      '<div class="pd-long-trends"><div><span>正答率50%以上の失点</span><b class="'+trendClass(tr)+'">'+trendWord(tr)+'</b><small>'+(tr.priorAvg==null?'比較データ不足':'直近 '+tr.latest+'点 / それ以前平均 '+tr.priorAvg+'点')+'</small></div><div><span>算数偏差値</span><b class="'+trendClass(md)+'">'+trendWord(md)+'</b><small>'+(md.priorAvg==null?'比較データ不足':'直近 '+md.latest+' / それ以前平均 '+md.priorAvg)+'</small></div></div>'+
      '<div class="pd-long-history">'+history+'</div>'+
      '<div class="pd-long-note">分野の反復判定は「平均との差−5pt以下」または「得点率60%未満」。A〜Gは自動推定せず、手動確定した原因だけ集計します。テスト難度が異なるため、偏差値の上下だけで理解度を断定しません。</div>'+
      '</div>';
  }

  function recoveryReport(ds) {
    if (!window.RecoveryEngine) return {records:[],summary:null,causeLifecycle:[],domainLifecycle:[]};
    ds.recoveryRecords = window.RecoveryEngine.sync(ds.sapixAnalyses || [], ds.recoveryRecords || []);
    return {
      records: ds.recoveryRecords,
      summary: window.RecoveryEngine.summary(ds.recoveryRecords),
      causeLifecycle: window.RecoveryEngine.causeLifecycle(ds.sapixAnalyses || [],5),
      domainLifecycle: window.RecoveryEngine.domainLifecycle(ds.sapixAnalyses || [],5)
    };
  }

  function alphaReport(ds) {
    if (!window.RecoveryEngine) return null;
    const latest = latestSapix(ds);
    const goal = ds.alphaGoal || {label:'SAPIX α1入室',cutoffs:{}};
    const cutoff = latest ? (goal.cutoffs || {})[analysisKey(latest)] : '';
    return window.RecoveryEngine.alphaStatus(ds.sapixAnalyses || [], {
      enabled:goal.enabled,
      label:goal.label,
      currentClass:goal.currentClass,
      cutoffScore:cutoff
    });
  }

  function alphaPlanReport(ds,recovery,longitudinal) {
    if (!window.Alpha1Planner) return null;
    try {
      return window.Alpha1Planner.analyze(
        ds.sapixAnalyses || [],
        ds.alphaGoal || {},
        recovery && recovery.summary ? recovery.summary : null,
        longitudinal || null
      );
    } catch (e) { return null; }
  }

  function alphaRouteText(plan) {
    if (!plan || plan.scenarioTarget===null) return '実際のα1基準点を入力すると、得点ルートを作ります。';
    if (plan.routeStatus==='at-or-above') return '直近実基準＋余裕点のシナリオでは、今回得点が目標以上です。次回は再現性を優先します。';
    if (plan.routeStatus==='must-only') return '正答率70%以上の取りこぼし回収だけで、今回の差を埋められる構造です。難問追加は後回しです。';
    if (plan.routeStatus==='within-50plus') return '正答率70%以上＋50〜70%の取りこぼし回収で、今回の差を埋められる構造です。';
    if (plan.routeStatus==='needs-30to50') return '正答率50%以上をすべて回収しても不足し、30〜50%帯の問題も一部必要な構造です。';
    return '算数の正答率30%以上の失点をすべて回収しても差が残ります。他科の底上げか、より難しい問題の獲得が必要です。';
  }

  function alphaPlanHtml(plan) {
    if (!plan || !plan.latest) {
      return '<div class="pd-alpha-plan-empty"><b>SAPIXテストを取り込むと、α1への得点ルートを作ります。</b></div>';
    }
    if (plan.scenarioTarget===null) {
      return '<div class="pd-alpha-plan-empty"><b>まず上の「このテストのα1基準点」を入力してください。</b><p>基準点を推測せず、実値がある回だけ得点設計します。</p></div>';
    }
    const routeRows=(plan.route.steps||[]).map(function(x) {
      const cls=x.key==='must'?'must':x.key==='target'?'target':'growth';
      return '<div class="pd-alpha-route-row '+cls+'"><div><b>'+esc(x.label)+'</b><small>今回の失点 '+x.available+'点</small></div><span>シナリオで必要 '+(x.use==null?'—':x.use)+'点</span></div>';
    }).join('');
    const subjectRows=(plan.subjectRoles||[]).map(function(r) {
      const cls=r.role==='強み'?'strong':r.role==='底上げ候補'?'weak':'';
      return '<div class="pd-alpha-subject '+cls+'"><div><b>'+esc(r.label)+'</b><span>'+esc(r.role)+'</span></div><div><strong>'+esc(r.score==null?'—':r.score)+' / '+esc(r.max==null?'—':r.max)+'</strong><small>偏差値 '+esc(r.dev==null?'—':r.dev)+'</small></div></div>';
    }).join('');
    const process=(plan.processTargets||[]).map(function(x,i) {
      return '<div class="pd-alpha-process"><span>'+(i+1)+'</span><div><b>'+esc(x.area)+'｜'+esc(x.target)+'</b><small>'+esc(x.reason)+'</small></div></div>';
    }).join('');
    const h=plan.cutoffHistory||{};
    const history=h.count
      ? '登録済み実基準 '+h.count+'回：'+h.min+'〜'+h.max+'点（中央値 '+h.median+'点）'
      : 'α1実基準の履歴はまだ1回未満です。';
    const cf50=plan.counterfactual50==null?'—':plan.counterfactual50;
    const cf30=plan.counterfactual30==null?'—':plan.counterfactual30;
    return '<div class="pd-alpha-plan-wrap">'+
      '<div class="pd-alpha-plan-hero"><div><span>直近実基準を使ったシミュレーション</span><h3>'+esc(alphaRouteText(plan))+'</h3></div><div class="pd-alpha-plan-gap"><small>今回との差</small><b>'+plan.gap+'点</b></div></div>'+
      '<div class="pd-alpha-plan-kpis">'+
        metric('今回4科',plan.current+'点','実得点')+
        metric('実α1基準',plan.latestCutoff+'点','今回の実値')+
        metric('目標余裕',plan.margin+'点','任意設定')+
        metric('シナリオ目標',plan.scenarioTarget+'点','基準＋余裕')+
      '</div>'+
      '<div class="pd-alpha-plan-cols"><div><h4>差をどこから埋めるか</h4>'+routeRows+'<div class="pd-alpha-counter"><span>50%以上の失点を全回収した場合</span><b>'+cf50+'点</b><span>さらに30〜50%も全回収</span><b>'+cf30+'点</b></div></div>'+
      '<div><h4>科目別の現在地</h4><div class="pd-alpha-subjects">'+subjectRows+'</div></div></div>'+
      '<div class="pd-alpha-process-list"><h4>次回テストのプロセス目標</h4>'+process+'</div>'+
      '<div class="pd-alpha-history-note">'+esc(history)+'。これは次回基準の予測ではありません。テスト難度・校舎・時期で基準は変わります。</div>'+
      '</div>';
  }

  function lifecycleLabel(status) {
    return status==='graduated'?'卒業':status==='improving'?'改善中':status==='active'?'継続中':'判定保留';
  }

  function lifecycleClass(status) {
    return status==='graduated'?'graduated':status==='improving'?'improving':status==='active'?'active':'';
  }

  function recoveryHtml(report) {
    const sum=report&&report.summary;
    if (!sum || sum.total===0) {
      return '<div class="pd-recovery-empty"><b>正答率50%以上の失点を取り込むと、ここで再テストを追跡します。</b><p>1回解けただけでは卒業にしません。別日に再現できるかを確認します。</p></div>';
    }
    const today=window.RecoveryEngine?window.RecoveryEngine.dateOnly():'';
    const active=(report.records||[]).filter(function(r){return r.status!=='graduated';}).slice(0,10);
    const rows=active.map(function(r) {
      const due=!r.nextReview||r.nextReview<=today;
      const status=r.status==='strengthening'?'1回目合格':'未定着';
      const attempts=(r.attempts||[]).length;
      return '<div class="pd-recovery-row '+(due?'due':'')+'">'+
        '<div><b>'+esc(r.testName)+' '+esc(r.questionId)+'</b><small>'+esc(r.testDate)+' ・ '+r.points+'点 ・ 正答率 '+r.correctRate+'%'+(r.cause?' ・ '+esc(r.cause+' '+ERROR_LABELS[r.cause]):'')+'</small></div>'+
        '<div class="pd-recovery-state"><span>'+status+'</span><small>'+(r.nextReview?'次回 '+esc(r.nextReview):'')+' ・ 記録'+attempts+'回</small></div>'+
        '<div class="pd-recovery-actions">'+
          '<button class="btn small primary" data-recovery-pass="'+esc(r.id)+'" '+(due?'':'disabled')+'>自力○＋説明○</button>'+
          '<button class="btn small ghost" data-recovery-fail="'+esc(r.id)+'" '+(due?'':'disabled')+'>×</button>'+
        '</div></div>';
    }).join('') || emptyNote('現在、未卒業の再テストはありません。');

    const graduates=(sum.recentGraduates||[]).map(function(r){
      return '<div class="pd-graduate-chip"><b>'+esc(r.questionId)+'</b><span>'+esc(r.testName)+'</span><small>'+esc(r.graduatedAt||'')+' 卒業</small></div>';
    }).join('');

    const causeLife=(report.causeLifecycle||[]).filter(function(x){return x.total>=2;}).map(function(x){
      return '<span class="pd-life-chip '+lifecycleClass(x.status)+'">'+esc(x.code+' '+ERROR_LABELS[x.code])+'：'+lifecycleLabel(x.status)+'</span>';
    }).join('');
    const domainLife=(report.domainLifecycle||[]).filter(function(x){return x.tests>=2;}).slice(0,5).map(function(x){
      return '<span class="pd-life-chip '+lifecycleClass(x.status)+'">'+esc(x.domain)+'：'+lifecycleLabel(x.status)+'</span>';
    }).join('');

    return '<div class="pd-recovery-wrap">'+
      '<div class="pd-recovery-kpis">'+
        metric('再テスト期限',sum.due+'問','今日やる対象')+
        metric('未定着',sum.unresolved+'問','まだ自力再現なし')+
        metric('定着途中',sum.strengthening+'問','1回目は合格')+
        metric('卒業',sum.graduated+'問 / '+sum.graduatedPoints+'点','別日に2回再現')+
      '</div>'+
      '<div class="pd-recovery-rule"><b>卒業条件</b><span>ヒントなしで正解し、自分の言葉で説明できる → 3日以上空けてもう一度同条件で正解。途中で失敗した場合は連続確認をやり直します。</span></div>'+
      '<div class="pd-recovery-list">'+rows+'</div>'+
      (graduates?'<div class="pd-graduates"><h4>最近卒業した問題</h4>'+graduates+'</div>':'')+
      '<div class="pd-lifecycle"><div><h4>A〜Gの弱点状態</h4>'+(causeLife||'<span class="pd-life-note">2回以上の再発で判定します。</span>')+'</div><div><h4>分野の弱点状態</h4>'+(domainLife||'<span class="pd-life-note">2回以上の再発で判定します。</span>')+'</div></div>'+
      '</div>';
  }

  function alphaGoalHtml(report,goal,latest) {
    const g=goal||{label:'SAPIX α1入室',currentClass:'',cutoffs:{}};
    const testKey=latest?analysisKey(latest):'';
    const cutoff=latest?(g.cutoffs||{})[testKey]||'':'';
    if(!latest) {
      return '<div class="pd-alpha-empty"><b>中期目標：SAPIX α1入室</b><p>SAPIXテストPDFを取り込むと、実得点と実際のα1基準点との差を追跡します。</p></div>';
    }
    let status='';
    if(report&&report.gap!==null) {
      if(report.gap===0) status='入力したα1基準点との差は0点です。';
      else if(report.recoverableCoversGap) status='同じ基準点なら、正答率50%以上で失った'+report.recoverablePoints+'点の回収余地が、現在の差'+report.gap+'点を上回ります。';
      else status='入力した基準点まであと'+report.gap+'点。正答率50%以上の失点は'+report.recoverablePoints+'点です。';
    } else {
      status='α1基準点は校舎・時期・テストで変わるため自動推定しません。実際の基準点が分かったら入力してください。';
    }
    return '<div class="pd-alpha-wrap">'+
      '<div class="pd-alpha-main"><div class="pd-alpha-mark">α1</div><div><span>中期目標</span><h3>'+esc(g.label||'SAPIX α1入室')+'</h3><p>'+esc(status)+'</p></div></div>'+
      '<div class="pd-alpha-stats">'+
        '<div><span>今回4科得点</span><b>'+esc(report&&report.ownScore!=null?report.ownScore:'—')+(report&&report.maxScore?' / '+report.maxScore:'')+'</b></div>'+
        '<div><span>実際のα1基準</span><b>'+esc(report&&report.cutoffScore!=null?report.cutoffScore:'未入力')+'</b></div>'+
        '<div><span>基準との差</span><b>'+esc(report&&report.gap!=null?report.gap+'点':'—')+'</b></div>'+
        '<div><span>回収可能点</span><b>'+esc(report?report.recoverablePoints+'点':'—')+'</b></div>'+
      '</div>'+
      '<div class="pd-alpha-form">'+
        '<label>現在クラス<input id="pdAlphaCurrentClass" type="text" value="'+esc(g.currentClass||'')+'" placeholder="例：H"></label>'+
        '<label>このテストのα1基準点<input id="pdAlphaCutoff" type="number" min="0" step="1" value="'+esc(cutoff)+'" placeholder="実際の基準点"></label>'+
        '<label>目標余裕点<input id="pdAlphaMargin" type="number" min="0" max="50" step="1" value="'+esc(g.margin||0)+'" placeholder="0"></label>'+
        '<button class="btn primary small" id="pdSaveAlpha">α1目標を更新</button>'+
      '</div>'+
      '<div class="pd-alpha-note">'+esc(latest.name||'')+' '+esc(latest.date||'')+'を基準に表示。基準点未確認時は推測値を使いません。</div>'+
      '</div>';
  }

  function analysisKey(a) {
    return String(a && a.date || '') + '|' + String(a && a.name || '');
  }

  function saveSapixAnalysis(analysis) {
    const ds = dashState();
    const key = analysisKey(analysis);
    const old = (ds.sapixAnalyses || []).find(function(a){ return analysisKey(a) === key; });
    if (old && old.causes) analysis.causes = old.causes;
    ds.sapixAnalyses = (ds.sapixAnalyses || []).filter(function(a){ return analysisKey(a) !== key; });
    ds.sapixAnalyses.unshift(analysis);
    ds.sapixAnalyses = ds.sapixAnalyses.slice(0,12);

    const summary = analysis.summary || {};
    const autoTest = {
      date:analysis.date || '',
      name:analysis.name || 'SAPIXテスト',
      dev4:summary.total4 && summary.total4.dev != null ? summary.total4.dev : '',
      math:summary.math && summary.math.dev != null ? summary.math.dev : '',
      jp:summary.jp && summary.jp.dev != null ? summary.jp.dev : '',
      source:'pdf'
    };
    const testKey = String(autoTest.date) + '|' + String(autoTest.name);
    ds.tests = (ds.tests || []).filter(function(t){ return String(t.date)+'|'+String(t.name) !== testKey; });
    ds.tests.push(autoTest);
    if (window.RecoveryEngine) ds.recoveryRecords = window.RecoveryEngine.sync(ds.sapixAnalyses || [], ds.recoveryRecords || []);
    saveDash(ds);
  }

  function causeOptions(selected) {
    const opts = ['','A','B','C','D','E','F','G'];
    return opts.map(function(k) {
      const label = k ? k+' '+ERROR_LABELS[k] : '原因を選ぶ';
      return '<option value="'+k+'" '+(selected===k?'selected':'')+'>'+esc(label)+'</option>';
    }).join('');
  }

  function sapixAnalysisHtml(a) {
    if (!a) {
      return '<div class="pd-sapix-empty"><b>PDFを入れると自動分析します。</b><p>総合偏差値、算数の分野別成績、設問ごとの○×・配点・正答率を端末内で読み取り、「取るべき問題」の取りこぼしから優先順位を作ります。</p></div>';
    }
    const m = a.metrics || {};
    const sections = (a.mathSections || []).slice().sort(function(x,y){
      const xd=(x.scoreRate||0)-(x.avgRate||0), yd=(y.scoreRate||0)-(y.avgRate||0);
      return xd-yd;
    });
    const sectionRows = sections.map(function(x) {
      const delta = Math.round(((x.scoreRate||0)-(x.avgRate||0))*10)/10;
      return '<div class="pd-sapix-section"><div><b>'+esc(x.name)+'</b><small>'+x.score+' / '+x.max+'点</small></div><div><span>本人 '+x.scoreRate+'%</span><span>平均 '+x.avgRate+'%</span><b class="'+(delta<0?'neg':'pos')+'">'+(delta>0?'+':'')+delta+'pt</b></div></div>';
    }).join('') || emptyNote('分野別成績は読み取れませんでした。');

    const important = (a.mathQuestions || []).filter(function(q){ return !q.correct || q.rate < 50; }).slice(0,14);
    const questionRows = important.map(function(q) {
      const cause = a.causes && a.causes[q.id] || '';
      return '<div class="pd-sapix-question '+esc(q.bucket || '')+'"><div class="pd-sq-id">'+esc(q.id)+'</div><div class="pd-sq-mark '+(q.correct?'ok':'ng')+'">'+(q.correct?'○':'×')+'</div><div><b>'+q.points+'点</b><small>正答率 '+q.rate+'%</small></div><div class="pd-sq-label">'+esc(q.bucketLabel || '')+'</div>'+(q.correct?'<span class="pd-sq-win">獲得</span>':'<select class="pd-cause-select" data-pd-cause="'+esc(q.id)+'">'+causeOptions(cause)+'</select>')+'</div>';
    }).join('') || emptyNote('設問別正答率は読み取れませんでした。');

    const quality = a.parseQuality || {};
    const qualityOk = quality.summary && quality.sectionsTotal === ((a.summary && a.summary.math && a.summary.math.max) || 150) && quality.questionsTotal === ((a.summary && a.summary.math && a.summary.math.max) || 150);
    return '<div class="pd-sapix-result">'+
      '<div class="pd-sapix-title"><div><b>'+esc(a.name || 'SAPIXテスト')+'</b><small>'+esc(a.date || '')+' ・ PDFローカル解析</small></div><span class="pd-parse-badge '+(qualityOk?'ok':'warn')+'">'+(qualityOk?'全項目読取':'一部読取')+'</span></div>'+
      (a.warning?'<div class="pd-sapix-warning">'+esc(a.warning)+'</div>':'')+
      '<div class="pd-sapix-kpis">'+
        metric('70%以上の失点', (m.mustCount||0)+'問 / '+(m.mustPoints||0)+'点', '最優先で再確認')+
        metric('50〜70%の失点', (m.targetCount||0)+'問 / '+(m.targetPoints||0)+'点', '次に回収')+
        metric('回収可能点', (m.recoverablePoints||0)+'点', '正答率50%以上の失点')+
        metric('30%未満を正解', (m.hardWinCount||0)+'問', '難問獲得')+
      '</div>'+
      '<div class="pd-sapix-columns"><div><h4>分野別：平均との差</h4>'+sectionRows+'</div><div><h4>設問優先順位</h4><div class="pd-sapix-questions">'+questionRows+'</div></div></div>'+
      '<div class="pd-sapix-foot"><span>A〜Gは正誤だけでは推定しません。答案を確認して原因を選ぶと、上の誤答原因集計へ反映します。</span><button class="btn ghost small" id="pdDeleteSapix">この解析結果を削除</button></div>'+
      '</div>';
  }

  function renderDashboard() {
    const main = document.getElementById('main');
    if (!main) return;
    const state = coreState();
    const ds = dashState();
    const stats = Object.values(state.stats || {});
    const attempted = stats.filter(function(s){ return (s.attempts || 0) > 0; }).length;
    const mastered = stats.filter(isMastered).length;
    const noHint = stats.reduce(function(a,s){ return a + (s.noHintCorrect || 0); },0);
    const triangle = stats.filter(function(s){ return s.quality === '△'; }).length;
    const due = dueReviews(state);
    const weak = weakTags(state);
    const errors = aggregateErrors(state);
    const topErrors = Object.entries(errors).sort(function(a,b){ return b[1]-a[1]; });
    const week = weekActivity(state);
    const plan = currentPlan(state);
    const rec = recommended(state, 3);
    const sapix = latestSapix(ds);
    const longitudinal = longitudinalReport(ds);
    const recovery = recoveryReport(ds);
    const alpha = alphaReport(ds);
    const alphaPlan = alphaPlanReport(ds,recovery,longitudinal);
    const latestTests = ds.tests.slice().sort(function(a,b){ return String(b.date).localeCompare(String(a.date)); }).slice(0,5);
    if (window.RecoveryEngine) saveDash(ds);

    let actionHtml = '';
    let actionIndex=1;
    const sapixDue=recovery&&recovery.summary?recovery.summary.dueRecords.slice(0,3):[];
    sapixDue.forEach(function(r) {
      if(actionIndex>3) return;
      actionHtml += '<button class="pd-action-row" data-pd-scroll-recovery="1"><span class="pd-action-num">'+actionIndex+'</span><span><b>SAPIX再テスト：'+esc(r.questionId)+'</b><small>'+esc(r.testName)+' ・ '+r.points+'点 ・ 正答率 '+r.correctRate+'%</small></span><span>記録 →</span></button>';
      actionIndex++;
    });
    due.slice(0,3).forEach(function(p) {
      if(actionIndex>3) return;
      actionHtml += '<button class="pd-action-row" data-pd-problem="'+esc(p.id)+'"><span class="pd-action-num">'+actionIndex+'</span><span><b>再テスト：'+esc(p.title)+'</b><small>期限到来。ヒントなしで再現できるか確認</small></span><span>開く →</span></button>';
      actionIndex++;
    });
    rec.slice(0,3).forEach(function(p) {
      if(actionIndex>3) return;
      actionHtml += '<button class="pd-action-row" data-pd-problem="'+esc(p.id)+'"><span class="pd-action-num">'+actionIndex+'</span><span><b>重点問題：'+esc(p.title)+'</b><small>'+esc((p.tags || []).slice(0,3).join('・'))+'</small></span><span>開く →</span></button>';
      actionIndex++;
    });
    if (!actionHtml) actionHtml = emptyNote('現在、期限到来の再テストはありません。新問は通常の「問題に挑戦」から進めます。');

    let weakHtml = weak.length ? weak.map(function(x) {
      return '<div class="pd-bar-row"><div><b>'+esc(x[0])+'</b><span>'+x[1].toFixed(1)+'</span></div><div class="pd-bar"><i style="width:'+Math.min(100,x[1]*12)+'%"></i></div></div>';
    }).join('') : emptyNote('弱点タグは、挑戦・誤答・ヒント利用が蓄積すると自動表示されます。');

    const maxErr = Math.max(1, topErrors[0] ? topErrors[0][1] : 1);
    let errHtml = topErrors.map(function(x) {
      return '<div class="pd-error-row"><span class="pd-error-code">'+x[0]+'</span><span class="pd-error-name">'+esc(ERROR_LABELS[x[0]])+'</span><div class="pd-error-meter"><i style="width:'+Math.round(x[1]/maxErr*100)+'%"></i></div><b>'+x[1]+'</b></div>';
    }).join('');

    let testsHtml = latestTests.length ? latestTests.map(function(t, idx) {
      return '<div class="pd-test-row"><div><b>'+esc(t.name || 'テスト')+'</b><small>'+esc(t.date || '')+(t.source==='pdf'?' ・ PDF取込':'')+'</small></div><div><span>4科 '+esc(t.dev4 || '—')+'</span><span>算 '+esc(t.math || '—')+'</span><span>国 '+esc(t.jp || '—')+'</span></div><button class="pd-delete" data-pd-delete-test="'+idx+'" aria-label="削除">×</button></div>';
    }).join('') : emptyNote('SAPIXテストPDFを取り込むか、手入力すると推移を残せます。');

    const sapixMetrics = sapix && sapix.metrics || {};
    const longTop = longitudinal && longitudinal.priorities && longitudinal.priorities[0];
    const sapixDueCount = recovery && recovery.summary ? recovery.summary.due : 0;
    const priority = sapixDueCount>0
      ? 'SAPIXの再テスト期限が'+sapixDueCount+'問。α1を目指すため、新しい難問より先に「取るべき問題」を自力で再現できる状態へ戻す。'
      : longTop
        ? '継続弱点：'+longTop.title+'。'+longTop.action
        : sapix && (sapixMetrics.mustCount || 0) > 0
          ? 'SAPIXで正答率70%以上の取りこぼしが '+sapixMetrics.mustCount+'問・'+sapixMetrics.mustPoints+'点。まず元答案で原因を特定して解き直す。'
          : due.length > 0
            ? '今日の最優先は再テスト '+due.length+'問。新問より先に、ヒントなしで再現できるか確認する。'
            : triangle > 0
              ? '△問題が '+triangle+'問あります。新しい難問を増やす前に、説明できる状態まで戻す。'
              : '再テスト期限はありません。今週テーマに沿って新問を進める。';

    main.innerHTML =
      '<header class="page-head pd-head"><div><div class="pd-eyebrow">PARENT DASHBOARD</div><h1 class="page-title">学習改善ダッシュボード</h1><div class="page-sub">成績を見る画面ではなく、次に何を直すかを決める画面です。</div></div><div class="page-actions"><button class="btn ghost" id="pdGoReview">復習一覧</button><button class="btn primary" id="pdGoChallenge">問題に挑戦</button></div></header>'+
      '<section class="pd-priority"><div><span>今日の判断</span><h2>'+esc(priority)+'</h2></div><div class="pd-week-badge">W'+String(currentWeekNumber(state)).padStart(2,'0')+'<small>'+esc(plan ? plan.title : '年間計画')+'</small></div></section>'+
      '<section class="pd-metrics">'+
        metric('定着', mastered+'問', '説明＋自力正解＋間隔反復')+
        metric('挑戦済み', attempted+'問', '問題バンク '+problemBank().length+'問')+
        metric('自力正解', noHint+'回', 'ヒントなし')+
        metric('再テスト期限', due.length+'問', triangle+'問が△')+
      '</section>'+
      '<section class="pd-grid pd-grid-main"><article class="pd-panel pd-span-2"><div class="pd-panel-head"><div><span>01</span><h3>今日やること</h3></div><small>最大3件に絞る</small></div><div class="pd-action-list">'+actionHtml+'</div></article>'+
      '<article class="pd-panel"><div class="pd-panel-head"><div><span>02</span><h3>今週の実績</h3></div><small>自力時間を優先</small></div><div class="pd-week-stats"><div><b>'+week.newCount+'</b><span>新問</span></div><div><b>'+week.reviews+'</b><span>再テスト</span></div><div><b>'+week.explains+'</b><span>説明</span></div><div><b>'+week.minutes+'</b><span>分</span></div></div></article></section>'+
      '<section class="pd-grid"><article class="pd-panel"><div class="pd-panel-head"><div><span>03</span><h3>弱点タグ</h3></div><small>誤答・ヒント・△を反映</small></div>'+weakHtml+'</article>'+
      '<article class="pd-panel pd-span-2"><div class="pd-panel-head"><div><span>04</span><h3>A〜G 誤答原因</h3></div><small>原因を直してから問題数を増やす</small></div><div class="pd-errors">'+errHtml+'</div></article></section>'+
      '<section class="pd-panel pd-alpha"><div class="pd-panel-head"><div><span>05</span><h3>SAPIX α1入室目標</h3></div><small>基準点は実値のみ使用</small></div>'+alphaGoalHtml(alpha,ds.alphaGoal,sapix)+'</section>'+
      '<section class="pd-panel pd-alpha-plan"><div class="pd-panel-head"><div><span>06</span><h3>α1 次回得点設計</h3></div><small>難問より先に取りこぼしを回収</small></div>'+alphaPlanHtml(alphaPlan)+'</section>'+
      '<section class="pd-panel pd-recovery" id="pdRecoveryPanel"><div class="pd-panel-head"><div><span>07</span><h3>弱点卒業トラッカー</h3></div><small>発見→再テスト→卒業</small></div>'+recoveryHtml(recovery)+'</section>'+
      '<section class="pd-panel pd-longitudinal"><div class="pd-panel-head"><div><span>08</span><h3>継続弱点｜直近5回</h3></div><small>再発頻度から今週の重点を最大2つに絞る</small></div>'+longitudinalHtml(longitudinal)+'</section>'+
      '<section class="pd-panel pd-sapix" id="pdSapixPanel"><div class="pd-panel-head"><div><span>09</span><h3>SAPIXテスト自動分析</h3></div><small>PDFは端末内で解析・生データは保存しない</small></div>'+
        '<div class="pd-sapix-import"><input type="file" id="pdSapixPdf" accept=".pdf,application/pdf" hidden><button class="btn primary" id="pdSapixPick">SAPIX成績票PDFを解析</button><span id="pdSapixStatus">PDF.jsは解析時だけ読み込みます。</span><details><summary>PDFが読めない場合：テキスト貼り付け</summary><textarea id="pdSapixText" rows="5" placeholder="PDFから抽出したテキストを貼り付け"></textarea><button class="btn ghost small" id="pdSapixAnalyzeText">貼り付け内容を解析</button></details></div>'+
        sapixAnalysisHtml(sapix)+'</section>'+
      '<section class="pd-panel pd-tests"><div class="pd-panel-head"><div><span>10</span><h3>SAPIXテスト履歴</h3></div><small>PDF取込＋必要時のみ手入力</small></div>'+
        '<div class="pd-test-form"><input type="date" id="pdTestDate"><input type="text" id="pdTestName" placeholder="例：9月度マンスリー"><input type="number" step="0.1" id="pdDev4" placeholder="4科偏差値"><input type="number" step="0.1" id="pdMath" placeholder="算数"><input type="number" step="0.1" id="pdJp" placeholder="国語"><button class="btn primary small" id="pdSaveTest">手入力</button></div>'+
        '<div class="pd-test-list">'+testsHtml+'</div></section>'+
      '<section class="pd-panel pd-focus"><div class="pd-panel-head"><div><span>11</span><h3>今週直すこと</h3></div><small>最大2項目まで</small></div><textarea id="pdWeeklyFocus" rows="3" placeholder="例：式を書く前に図か表を1回作る。">'+esc(ds.weeklyFocus)+'</textarea><div class="pd-focus-actions"><span>端末内だけに保存します。</span><button class="btn ghost small" id="pdSaveFocus">保存</button></div></section>';

    bindDashboard();
  }

  function setCoreRoute(route, problemId) {
    const state = coreState();
    state.route = route;
    state.currentProblem = problemId || null;
    if (problemId) state.problemMode = 'practice';
    try { localStorage.setItem(CORE_KEY, JSON.stringify(state)); } catch (e) {}
    location.reload();
  }

  function bindDashboard() {
    document.querySelectorAll('[data-pd-problem]').forEach(function(btn) {
      btn.addEventListener('click', function(){ setCoreRoute('challenge', btn.getAttribute('data-pd-problem')); });
    });
    const review = document.getElementById('pdGoReview');
    const challenge = document.getElementById('pdGoChallenge');
    if (review) review.onclick = function(){ setCoreRoute('review'); };
    if (challenge) challenge.onclick = function(){ setCoreRoute('challenge'); };

    document.querySelectorAll('[data-pd-scroll-recovery]').forEach(function(btn) {
      btn.onclick = function() {
        const panel=document.getElementById('pdRecoveryPanel');
        if(panel) panel.scrollIntoView({behavior:'smooth',block:'start'});
      };
    });

    document.querySelectorAll('[data-recovery-pass]').forEach(function(btn) {
      btn.onclick = function() {
        if(!window.RecoveryEngine) return;
        const ds=dashState();
        ds.recoveryRecords=window.RecoveryEngine.sync(ds.sapixAnalyses||[],ds.recoveryRecords||[]);
        ds.recoveryRecords=window.RecoveryEngine.addAttempt(ds.recoveryRecords,btn.getAttribute('data-recovery-pass'),'pass');
        saveDash(ds);
        renderDashboard();
      };
    });
    document.querySelectorAll('[data-recovery-fail]').forEach(function(btn) {
      btn.onclick = function() {
        if(!window.RecoveryEngine) return;
        const ds=dashState();
        ds.recoveryRecords=window.RecoveryEngine.sync(ds.sapixAnalyses||[],ds.recoveryRecords||[]);
        ds.recoveryRecords=window.RecoveryEngine.addAttempt(ds.recoveryRecords,btn.getAttribute('data-recovery-fail'),'fail');
        saveDash(ds);
        renderDashboard();
      };
    });

    const saveAlpha=document.getElementById('pdSaveAlpha');
    if(saveAlpha) saveAlpha.onclick=function() {
      const ds=dashState();
      const latest=latestSapix(ds);
      ds.alphaGoal=ds.alphaGoal||{enabled:true,label:'SAPIX α1入室',currentClass:'',margin:0,cutoffs:{}};
      ds.alphaGoal.currentClass=(document.getElementById('pdAlphaCurrentClass')||{}).value||'';
      const marginRaw=(document.getElementById('pdAlphaMargin')||{}).value;
      ds.alphaGoal.margin=marginRaw===''?0:Math.max(0,Math.min(50,Number(marginRaw)||0));
      if(latest) {
        const key=analysisKey(latest);
        const raw=(document.getElementById('pdAlphaCutoff')||{}).value;
        ds.alphaGoal.cutoffs=ds.alphaGoal.cutoffs||{};
        if(raw==='') delete ds.alphaGoal.cutoffs[key];
        else ds.alphaGoal.cutoffs[key]=Number(raw);
      }
      saveDash(ds);
      renderDashboard();
    };

    const pickPdf = document.getElementById('pdSapixPick');
    const pdfInput = document.getElementById('pdSapixPdf');
    const sapixStatus = document.getElementById('pdSapixStatus');
    if (pickPdf && pdfInput) pickPdf.onclick = function(){ pdfInput.click(); };
    if (pdfInput) pdfInput.onchange = async function() {
      const file = pdfInput.files && pdfInput.files[0];
      if (!file) return;
      if (!window.SapixAnalyzer) {
        if (sapixStatus) sapixStatus.textContent = '解析エンジンを読み込めません。';
        return;
      }
      pickPdf.disabled = true;
      try {
        const analysis = await window.SapixAnalyzer.analyzePdf(file, function(msg){
          if (sapixStatus) sapixStatus.textContent = msg;
        });
        saveSapixAnalysis(analysis);
        renderDashboard();
        const status2 = document.getElementById('pdSapixStatus');
        if (status2) status2.textContent = '解析完了：個人名・受験番号・PDF本文は保存していません。';
      } catch (e) {
        if (sapixStatus) sapixStatus.textContent = '解析失敗：'+(e && e.message ? e.message : String(e));
      } finally {
        pickPdf.disabled = false;
        pdfInput.value = '';
      }
    };

    const analyzeText = document.getElementById('pdSapixAnalyzeText');
    if (analyzeText) analyzeText.onclick = function() {
      const box = document.getElementById('pdSapixText');
      const raw = box ? box.value : '';
      if (!raw.trim()) { if (box) box.focus(); return; }
      try {
        const analysis = window.SapixAnalyzer.analyzeText(raw, 'pasted-text');
        saveSapixAnalysis(analysis);
        renderDashboard();
      } catch (e) {
        if (sapixStatus) sapixStatus.textContent = '解析失敗：'+(e && e.message ? e.message : String(e));
      }
    };

    document.querySelectorAll('[data-pd-cause]').forEach(function(sel) {
      sel.onchange = function() {
        const ds = dashState();
        const a = latestSapix(ds);
        if (!a) return;
        a.causes = a.causes || {};
        const id = sel.getAttribute('data-pd-cause');
        if (sel.value) a.causes[id] = sel.value; else delete a.causes[id];
        if(window.RecoveryEngine) ds.recoveryRecords=window.RecoveryEngine.sync(ds.sapixAnalyses||[],ds.recoveryRecords||[]);
        saveDash(ds);
        renderDashboard();
      };
    });

    const deleteSapix = document.getElementById('pdDeleteSapix');
    if (deleteSapix) deleteSapix.onclick = function() {
      const ds = dashState();
      const a = latestSapix(ds);
      if (!a) return;
      const key = analysisKey(a);
      ds.sapixAnalyses = (ds.sapixAnalyses || []).filter(function(x){ return analysisKey(x)!==key; });
      if(window.RecoveryEngine) ds.recoveryRecords=window.RecoveryEngine.sync(ds.sapixAnalyses||[],ds.recoveryRecords||[]);
      saveDash(ds);
      renderDashboard();
    };

    const date = document.getElementById('pdTestDate');
    if (date && !date.value) date.value = new Date().toISOString().slice(0,10);

    const saveTest = document.getElementById('pdSaveTest');
    if (saveTest) saveTest.onclick = function() {
      const ds = dashState();
      const item = {
        date: document.getElementById('pdTestDate').value,
        name: document.getElementById('pdTestName').value.trim(),
        dev4: document.getElementById('pdDev4').value,
        math: document.getElementById('pdMath').value,
        jp: document.getElementById('pdJp').value
      };
      if (!item.name) { document.getElementById('pdTestName').focus(); return; }
      ds.tests.push(item);
      saveDash(ds);
      renderDashboard();
    };

    document.querySelectorAll('[data-pd-delete-test]').forEach(function(btn) {
      btn.onclick = function() {
        const ds = dashState();
        const sorted = ds.tests.slice().sort(function(a,b){ return String(b.date).localeCompare(String(a.date)); });
        const target = sorted[Number(btn.getAttribute('data-pd-delete-test'))];
        const originalIndex = ds.tests.indexOf(target);
        if (originalIndex >= 0) ds.tests.splice(originalIndex,1);
        saveDash(ds);
        renderDashboard();
      };
    });

    const saveFocus = document.getElementById('pdSaveFocus');
    if (saveFocus) saveFocus.onclick = function() {
      const ds = dashState();
      ds.weeklyFocus = document.getElementById('pdWeeklyFocus').value.trim();
      saveDash(ds);
      saveFocus.textContent = '保存済み';
      setTimeout(function(){ saveFocus.textContent = '保存'; }, 1200);
    };
  }

  function injectNav() {
    const nav = document.getElementById('nav');
    if (nav && !nav.querySelector('[data-parent-dashboard]')) {
      const btn = document.createElement('button');
      btn.className = 'nav-item pd-nav' + (dashboardActive ? ' active' : '');
      btn.setAttribute('data-parent-dashboard','1');
      btn.innerHTML = '<span class="nav-icon">◎</span>保護者ダッシュボード';
      btn.onclick = function() {
        dashboardActive = true;
        document.querySelectorAll('.nav-item').forEach(function(x){ x.classList.remove('active'); });
        btn.classList.add('active');
        renderDashboard();
        window.scrollTo(0,0);
      };
      nav.appendChild(btn);
    }

    if (!document.getElementById('pdMobileFab')) {
      const fab = document.createElement('button');
      fab.id = 'pdMobileFab';
      fab.className = 'pd-mobile-fab';
      fab.textContent = '保護者';
      fab.onclick = function() { dashboardActive = true; renderDashboard(); window.scrollTo(0,0); };
      document.body.appendChild(fab);
    }
  }

  document.addEventListener('click', function(e) {
    if (e.target.closest && e.target.closest('[data-route]')) dashboardActive = false;
  }, true);

  const nav = document.getElementById('nav');
  if (nav) new MutationObserver(injectNav).observe(nav, {childList:true,subtree:true});
  injectNav();
})();