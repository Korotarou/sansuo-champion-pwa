function markAttempt(q,isCorrect,explained,cause,noAI){
  if(!state.history[q.id]) state.history[q.id]={attempts:0,correct:0,explained:0,wrong:0,lastAt:null,dueAt:null,cause:null,lastNoAI:false};
  const h=state.history[q.id];
  h.attempts++;
  if(isCorrect) h.correct++; else h.wrong++;
  if(explained) h.explained++;
  h.lastAt=Date.now(); h.cause=cause||h.cause; h.lastNoAI=!!noAI;
  const day=86400000;
  h.dueAt = (!isCorrect || !explained && !noAI) ? Date.now()+day : Date.now()+(noAI?14:7)*day;
  state.answered++; if(isCorrect) state.correct++; if(explained) state.explained++;
  normalizeDaily(); state.daily.count++;
  updateStreakOnStudy(); saveState();
}
function ensureAttemptMarkedBeforeNext(){
  if(!session || !session.answeredCurrent || session.cfg.noAI) return;
  const q=session.questions[session.index];
  if(q.type==='free') return;
  const ans=session.answers[session.answers.length-1];
  const h=state.history[q.id];
  const markedThisAttempt = h && h.lastAt && h.lastAt>=session.startedAt && h.attempts>=1;
  if(!markedThisAttempt){
    const isCorrect=!!ans?.correct;
    markAttempt(q,isCorrect,!!ans?.explained,isCorrect?null:'strategy',false);
    if(!isCorrect) state.causes.strategy=(state.causes.strategy||0)+1;
    saveState();
  }
}
function nextQuestion(){
  if(!session.answeredCurrent) return;
  ensureAttemptMarkedBeforeNext();
  if(session.index>=session.questions.length-1){ finishSession(false); return; }
  session.index++; renderQuestion();
}
function finishSession(timeUp=false){
  clearInterval(timerHandle);
  if(!session) return;
  ensureAttemptMarkedBeforeNext();
  state.sessions++; saveState();
  const total=session.questions.length;
  const pct=Math.round(session.correct/Math.max(1,total)*100);
  $('#resultTitle').textContent=timeUp?'時間終了':'学習完了';
  if(session.cfg.schoolScore){
    const scaled=Math.round(session.correct/total*session.cfg.schoolScore);
    $('#resultScore').textContent=scaled;
    $('#resultScore').nextElementSibling.textContent=`/${session.cfg.schoolScore}`;
  } else {
    $('#resultScore').textContent=pct; $('#resultScore').nextElementSibling.textContent='%';
  }
  $('#resultCorrect').textContent=`${session.correct}/${total}`;
  $('#resultExplain').textContent=`${session.explained}/${total}`;
  $('#resultReview').textContent=`${session.needsReview}問`;
  let msg='';
  if(pct>=90) msg='正答率は高いです。次は「なぜ」を短く説明できるかを重視。';
  else if(pct>=70) msg='土台はあります。間違えた問題だけを翌日AIなしで再確認。';
  else msg='難問を増やさず、今日の誤答を原因別に直すのが先です。';
  if(session.cfg.noAI) msg='ヒントなしの再現結果です。間違いは「未定着」として再確認へ回します。';
  $('#resultMessage').textContent=msg;
  const causes=Object.entries(state.causes).sort((a,b)=>b[1]-a[1]);
  const top=causes[0];
  $('#resultWeakness').innerHTML=top&&top[1]>0?`<strong>現在もっとも多い誤答原因：</strong> ${causeLabel(top[0])}<br><span class="microcopy" style="color:#687386">次回はこの原因が減る行動を1つだけ意識します。</span>`:'誤答原因の記録はまだありません。';
  session=null; showView('result');
}
function causeLabel(k){ return ({knowledge:'知らなかった',principle:'原理があいまい',reading:'資料・条件の読み違い',strategy:'知っていたが使えなかった',calc:'計算ミス',careless:'ケアレスミス'})[k]||k; }
function focusStatus(f){
  if(f.attempted===0) return 'これから確認';
  if(f.mastery<60) return '要補強';
  if(f.mastery<80) return '定着中';
  if(f.mastery<90) return 'あと一歩';
  return '安定';
}
function renderHome(){
  normalizeDaily();
  const r=readiness(); $('#readinessScore').textContent=r; $('#readinessBar').style.width=`${r}%`; $('#readinessText').textContent=readinessText(r);
  $('#streakCount').textContent=state.streak||0; $('#todayProgress').textContent=`${Math.min(5,state.daily.count)} / 5`;
  const list=$('#weeklyFocusList');
  if(list){
    const focus=weeklyFocus().slice(0,3);
    list.innerHTML=focus.map(function(f,i){
      const meta=f.sapixRate!==null ? ('SAPIX '+f.sapixRate+'%') : (f.due ? ('再テスト '+f.due+'問') : ('回答 '+f.attempted+'問'));
      return '<div class="weekly-focus-item">'+
        '<div class="weekly-focus-top">'+
          '<span class="weekly-focus-rank">'+(i+1)+'</span>'+
          '<span class="weekly-focus-name">'+escapeHtml(f.label)+'</span>'+
          '<span class="weekly-focus-status">'+focusStatus(f)+'</span>'+
        '</div>'+
        '<div class="weekly-focus-meter"><div class="weekly-focus-fill" style="width:'+Math.max(3,f.mastery)+'%"></div></div>'+
        '<div class="weekly-focus-meta"><span>定着度 '+f.mastery+'%</span><span>'+meta+'</span></div>'+
      '</div>';
    }).join('');
  }
  saveState();
}
function renderLibrary(){
  $('#bioMastery').textContent=`${domainMastery('生物')}%`; $('#earthMastery').textContent=`${domainMastery('地学')}%`;
  $('#physicsMastery').textContent=`${domainMastery('物理')}%`; $('#chemMastery').textContent=`${domainMastery('化学')}%`;
  const map=$('#topicMap');
  if(map){
    const order={生物:1,化学:2,物理:3,地学:4,総合:5};
    const topics=WEEKLY_CANDIDATES.slice().sort((a,b)=>(order[a.domain]||9)-(order[b.domain]||9) || a.label.localeCompare(b.label,'ja'));
    map.innerHTML=topics.map(p=>{
      const mastery=topicMastery(p.topic);
      const signal=sapixSignal(p.topic);
      const count=topicQuestionPool(p.topic).filter(q=>q.grade<=4&&q.type==='choice').length;
      const test=signal.lastRate===null?'SAPIX未取込':`SAPIX ${signal.lastRate}%`;
      return `<button class="topic-map-card" data-topic="${escapeHtml(p.topic)}">
        <span class="topic-map-domain">${escapeHtml(p.domain||'総合')}</span>
        <strong>${escapeHtml(p.label)}</strong>
        <div class="topic-map-meter"><span style="width:${Math.max(3,mastery)}%"></span></div>
        <div class="topic-map-meta"><span>定着 ${mastery}%</span><span>${test}</span></div>
        <small>${count}問 →</small>
      </button>`;
    }).join('');
  }
}
async function importSapixFile(file){
  const status=$('#sapixImportStatus');
  if(!file) return;
  if(!window.ScienceSapixImport){ if(status) status.textContent='解析器を読み込めません'; return; }
  try{
    if(status) status.textContent='解析準備中…';
    const parsed=await window.ScienceSapixImport.analyzeFile(file,msg=>{if(status) status.textContent=msg;});
    const mapped=(parsed.sections||[]).filter(s=>s.topic);
    if(!mapped.length && !parsed.summary) throw new Error('理科成績を抽出できませんでした。');
    if(!Array.isArray(state.sapixSections)) state.sapixSections=[];
    if(!Array.isArray(state.sapixTests)) state.sapixTests=[];
    let added=0;
    for(const s of mapped){
      const date=parsed.date||todayKey();
      const duplicate=state.sapixSections.some(r=>r.date===date&&r.topic===s.topic&&Number(r.score)===Number(s.score)&&Number(r.max)===Number(s.max));
      if(duplicate) continue;
      state.sapixSections.unshift({
        id:'sapix-'+Date.now()+'-'+added,
        date,topic:s.topic,score:s.score,max:s.max,average:s.average,
        rawName:s.rawName||s.topic,source:'local-file',createdAt:Date.now()
      });
      added++;
    }
    state.sapixSections=state.sapixSections.slice(0,60);
    if(parsed.summary && Number(parsed.summary.max)>0){
      const tdate=parsed.date||todayKey();
      const dupTest=state.sapixTests.some(t=>t.date===tdate&&Number(t.score)===Number(parsed.summary.score)&&Number(t.max)===Number(parsed.summary.max));
      if(!dupTest){
        state.sapixTests.unshift({
          id:'sapix-test-'+Date.now(),date:tdate,
          score:Number(parsed.summary.score),max:Number(parsed.summary.max),
          dev:Number(parsed.summary.dev),average:parsed.summary.average===null?null:Number(parsed.summary.average),
          source:'local-file',createdAt:Date.now()
        });
      }
      state.sapixTests=state.sapixTests.slice(0,20);
    }
    saveState(); renderRecord(); renderHome();
    if(status) status.textContent=added?('理科 '+mapped.length+'分野＋総合成績を反映'):(parsed.summary?'総合成績を反映':'同じ結果は登録済み');
    toast(added?('SAPIX理科 '+added+'分野を反映しました'):'この成績票は登録済みです');
  }catch(err){
    if(status) status.textContent=String(err?.message||err);
    toast('自動取込できませんでした。手入力を利用してください');
  }
}
function saveSapixSection(){
  const date=$('#sapixDate')?.value || todayKey();
  const topic=$('#sapixTopic')?.value || '';
  const score=Number($('#sapixScore')?.value);
  const max=Number($('#sapixMax')?.value);
  const averageRaw=$('#sapixAverage')?.value;
  const average=averageRaw===''?null:Number(averageRaw);
  if(!topic || !Number.isFinite(score) || !Number.isFinite(max) || max<=0 || score<0 || score>max){
    toast('得点と配点を確認してください'); return false;
  }
  if(average!==null && (!Number.isFinite(average) || average<0 || average>max)){
    toast('平均点を確認してください'); return false;
  }
  if(!Array.isArray(state.sapixSections)) state.sapixSections=[];
  state.sapixSections.unshift({id:'sapix-'+Date.now(),date,topic,score,max,average,createdAt:Date.now()});
  state.sapixSections=state.sapixSections.slice(0,40);
  saveState();
  if($('#sapixScore')) $('#sapixScore').value='';
  if($('#sapixMax')) $('#sapixMax').value='';
  if($('#sapixAverage')) $('#sapixAverage').value='';
  renderRecord(); renderHome(); toast('SAPIX結果を重点順位へ反映しました');
  return true;
}
function deleteSapixSection(id){
  state.sapixSections=(state.sapixSections||[]).filter(r=>r.id!==id);
  saveState(); renderRecord(); renderHome(); toast('入力を削除しました');
}
function renderSapixTrend(){
  const box=$('#sapixTrend'); if(!box) return;
  const rows=(state.sapixTests||[]).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,6);
  if(!rows.length){ box.innerHTML='<div class="empty">PDFを取り込むと、理科の得点・偏差値・平均点の推移がここに表示されます。</div>'; return; }
  box.innerHTML=rows.map((r,i)=>{
    const next=rows[i+1];
    const delta=next&&Number.isFinite(r.dev)&&Number.isFinite(next.dev)?Math.round((r.dev-next.dev)*10)/10:null;
    const deltaText=delta===null?'':(delta>0?'▲ '+delta:(delta<0?'▼ '+Math.abs(delta):'±0'));
    const avg=r.average===null||!Number.isFinite(Number(r.average))?'—':Number(r.average).toFixed(1);
    return '<div class="sapix-trend-card">'+
      '<span class="sapix-trend-date">'+escapeHtml(r.date||'')+'</span>'+
      '<strong>'+r.score+'<small>/'+r.max+'</small></strong>'+
      '<div><span>偏差値</span><b>'+Number(r.dev).toFixed(1)+'</b><em>'+deltaText+'</em></div>'+
      '<div><span>平均点</span><b>'+avg+'</b></div>'+
    '</div>';
  }).join('');
}
function renderSapixHistory(){
  const box=$('#sapixHistory'); if(!box) return;
  const rows=(state.sapixSections||[]).slice(0,10);
  if(!rows.length){ box.innerHTML='<div class="empty">まだ入力はありません。次回の成績表から分野ごとに反映できます。</div>'; return; }
  box.innerHTML=rows.map(r=>{
    const rate=Math.round(r.score/r.max*100);
    const avg=r.average===null?'':('・平均 '+r.average+'/'+r.max);
    return '<div class="sapix-history-row">'+
      '<div><strong>'+escapeHtml(r.topic)+'</strong><span>'+escapeHtml(r.date)+'</span></div>'+
      '<div class="sapix-history-score">'+r.score+'/'+r.max+' <b>'+rate+'%</b><small>'+avg+'</small></div>'+
      '<button data-sapix-delete="'+escapeHtml(r.id)+'" aria-label="入力を削除">×</button>'+
    '</div>';
  }).join('');
}
function renderRecord(){
  $('#statAnswered').textContent=state.answered;
  $('#statAccuracy').textContent=`${state.answered?Math.round(state.correct/state.answered*100):0}%`;
  $('#statExplain').textContent=`${state.answered?Math.round(state.explained/state.answered*100):0}%`;
  const due=dueQuestions(); $('#statDue').textContent=due.length;
  const totalCauses=Math.max(1,Object.values(state.causes).reduce((a,b)=>a+b,0));
  $('#causeBars').innerHTML=Object.entries(state.causes).map(([k,v])=>`<div class="cause-row"><span>${causeLabel(k)}</span><div class="cause-track"><div class="cause-fill" style="width:${v/totalCauses*100}%"></div></div><strong>${v}</strong></div>`).join('');
  $('#reviewQueue').innerHTML=due.length?due.slice(0,8).map(q=>`<div class="review-item"><span class="dot"></span><p>${escapeHtml(q.prompt)}</p><small>${q.domain}</small></div>`).join(''):'<div class="empty">今すぐ再テストする問題はありません。</div>';
  renderSapixTrend();
  renderSapixHistory();
}
