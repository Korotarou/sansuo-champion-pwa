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
    return {
      tests: Array.isArray(saved.tests) ? saved.tests : [],
      weeklyFocus: saved.weeklyFocus || ''
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
    return problemBank().filter(function(p) {
      const s = state.stats && state.stats[p.id];
      return !dueIds[p.id] && !isMastered(s);
    }).map(function(p) {
      const s = state.stats && state.stats[p.id] ? state.stats[p.id] : {};
      let score = s.attempts ? 15 : 30;
      if (s.quality === '△') score += 50;
      if ((s.hints || 0) > 0) score += 20;
      (p.tags || []).forEach(function(t){ score += (weakSet[t] || 0) * 6; });
      return [p, score];
    }).sort(function(a,b){ return b[1]-a[1]; }).slice(0,limit).map(function(x){ return x[0]; });
  }

  function metric(label, value, foot) {
    return '<div class="pd-metric"><div class="pd-metric-label">'+esc(label)+'</div><div class="pd-metric-value">'+esc(value)+'</div><div class="pd-metric-foot">'+esc(foot || '')+'</div></div>';
  }

  function emptyNote(text) {
    return '<div class="pd-empty">'+esc(text)+'</div>';
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
    const latestTests = ds.tests.slice().sort(function(a,b){ return String(b.date).localeCompare(String(a.date)); }).slice(0,5);

    let actionHtml = '';
    due.slice(0,3).forEach(function(p, i) {
      actionHtml += '<button class="pd-action-row" data-pd-problem="'+esc(p.id)+'"><span class="pd-action-num">'+(i+1)+'</span><span><b>再テスト：'+esc(p.title)+'</b><small>期限到来。ヒントなしで再現できるか確認</small></span><span>開く →</span></button>';
    });
    rec.slice(0, Math.max(0, 3-Math.min(3,due.length))).forEach(function(p, i) {
      actionHtml += '<button class="pd-action-row" data-pd-problem="'+esc(p.id)+'"><span class="pd-action-num">'+(due.length+i+1)+'</span><span><b>重点問題：'+esc(p.title)+'</b><small>'+esc((p.tags || []).slice(0,3).join('・'))+'</small></span><span>開く →</span></button>';
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
      return '<div class="pd-test-row"><div><b>'+esc(t.name || 'テスト')+'</b><small>'+esc(t.date || '')+'</small></div><div><span>4科 '+esc(t.dev4 || '—')+'</span><span>算 '+esc(t.math || '—')+'</span><span>国 '+esc(t.jp || '—')+'</span></div><button class="pd-delete" data-pd-delete-test="'+idx+'" aria-label="削除">×</button></div>';
    }).join('') : emptyNote('SAPIXテストを登録すると、ここに推移を残せます。PDF自動取込は次段階で接続します。');

    const priority = due.length > 0
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
      '<section class="pd-panel pd-tests"><div class="pd-panel-head"><div><span>05</span><h3>SAPIXテスト記録</h3></div><small>まず手入力。PDF自動取込へ拡張</small></div>'+
        '<div class="pd-test-form"><input type="date" id="pdTestDate"><input type="text" id="pdTestName" placeholder="例：9月度マンスリー"><input type="number" step="0.1" id="pdDev4" placeholder="4科偏差値"><input type="number" step="0.1" id="pdMath" placeholder="算数"><input type="number" step="0.1" id="pdJp" placeholder="国語"><button class="btn primary small" id="pdSaveTest">登録</button></div>'+
        '<div class="pd-test-list">'+testsHtml+'</div></section>'+
      '<section class="pd-panel pd-focus"><div class="pd-panel-head"><div><span>06</span><h3>今週直すこと</h3></div><small>最大2項目まで</small></div><textarea id="pdWeeklyFocus" rows="3" placeholder="例：式を書く前に図か表を1回作る。">'+esc(ds.weeklyFocus)+'</textarea><div class="pd-focus-actions"><span>端末内だけに保存します。</span><button class="btn ghost small" id="pdSaveFocus">保存</button></div></section>';

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