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
  renderSapixHistory();
}
