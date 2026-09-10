function showView(name){
  $$('.view').forEach(v=>v.classList.remove('active'));
  const view=$(`#view-${name}`);
  if(view) view.classList.add('active');
  $$('.nav-item').forEach(n=>n.classList.toggle('active', n.dataset.view===name));
  if(name==='home') renderHome();
  if(name==='record') renderRecord();
  if(name==='library') renderLibrary();
  window.scrollTo({top:0,behavior:'smooth'});
}

function startMode(mode, domain=null){
  const cfg=modeConfig[mode] || {label:`${domain}トレーニング`,count:8,time:null};
  const qs=selectQuestions(mode,domain);
  if(!qs.length){ toast('このモードの問題がまだありません'); return; }
  session={mode,domain,cfg,questions:qs,index:0,answers:[],correct:0,explained:0,needsReview:0,startedAt:Date.now(),remaining:cfg.time,lockedFeedback:!!cfg.noAI,selected:null,hintIndex:0,answeredCurrent:false};
  $('#quizModeLabel').textContent=domain ? `${domain}｜単元別` : cfg.label;
  $('#quizTimer').hidden=!cfg.time;
  $('#hintBtn').hidden=!!cfg.noAI;
  if(cfg.noAI) $('#checkBtn').textContent='回答を確定'; else $('#checkBtn').textContent='答え合わせ';
  showView('quiz');
  renderQuestion();
  startTimer();
}

function startTopic(topic){
  const pool=topicQuestionPool(topic).filter(q=>q.grade<=4 && q.type==='choice');
  const qs=sample(pool,Math.min(8,pool.length));
  if(!qs.length){ toast('この単元の問題はまだありません'); return; }
  const cfg={label:topic+'トレーニング',count:qs.length,time:null};
  session={mode:'topic',domain:null,topic,cfg,questions:qs,index:0,answers:[],correct:0,explained:0,needsReview:0,startedAt:Date.now(),remaining:null,lockedFeedback:false,selected:null,hintIndex:0,answeredCurrent:false};
  $('#quizModeLabel').textContent=topic+'｜単元別';
  $('#quizTimer').hidden=true;
  $('#hintBtn').hidden=false;
  $('#checkBtn').textContent='答え合わせ';
  showView('quiz');
  renderQuestion();
  startTimer();
}

function startTimer(){
  clearInterval(timerHandle);
  if(!session?.cfg.time) return;
  updateTimerDisplay();
  timerHandle=setInterval(()=>{
    session.remaining--;
    updateTimerDisplay();
    if(session.remaining<=0){ clearInterval(timerHandle); finishSession(true); }
  },1000);
}
function updateTimerDisplay(){
  const s=Math.max(0,session?.remaining||0); const m=Math.floor(s/60), sec=s%60;
  $('#quizTimer').textContent=`${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function renderFigure(fig){
  const box=$('#qFigure');
  if(!fig){ box.hidden=true; box.innerHTML=''; return; }
  box.hidden=false;
  if(fig.type==='table'){
    let html='<table class="figure-table"><thead><tr>';
    fig.headers.forEach(h=>html+=`<th>${escapeHtml(h)}</th>`);
    html+='</tr></thead><tbody>';
    fig.rows.forEach(row=>{html+='<tr>';row.forEach(c=>html+=`<td>${escapeHtml(c)}</td>`);html+='</tr>';});
    html+='</tbody></table>'; box.innerHTML=html;
  } else if(fig.type==='bars'){
    const max=Math.max(...fig.values.map(v=>v.value));
    box.innerHTML=`<div class="simple-bars">${fig.values.map(v=>`<div class="bar-wrap"><span class="bar-value">${v.value}</span><div class="simple-bar" style="height:${Math.max(8,v.value/max*110)}px"></div><span class="bar-label">${escapeHtml(v.label)}</span></div>`).join('')}</div>`;
  }
}
function renderQuestion(){
  const q=session.questions[session.index];
  session.selected=null; session.hintIndex=0; session.answeredCurrent=false;
  $('#quizCounter').textContent=`${session.index+1} / ${session.questions.length}`;
  $('#quizProgressBar').style.width=`${session.index/session.questions.length*100}%`;
  $('#qDomain').textContent=q.domain; $('#qLevel').textContent=`Lv.${q.level}`; $('#qSkill').textContent=q.skill;
  $('#qPrompt').textContent=q.prompt; renderFigure(q.figure);
  $('#hintBox').hidden=true; $('#hintBox').textContent='';
  $('#feedbackBox').hidden=true; $('#feedbackBox').className='feedback-box'; $('#feedbackBox').innerHTML='';
  $('#reasonPanel').hidden=true; $('#causePanel').hidden=true; $('#nextBtn').hidden=true;
  $('#hintBtn').disabled=false; $('#checkBtn').disabled=false;
  if(q.type==='choice'){
    $('#qFree').hidden=true; $('#qChoices').hidden=false;
    $('#qChoices').innerHTML=q.choices.map((c,i)=>`<button class="choice-btn" data-choice="${i}"><span class="choice-letter">${String.fromCharCode(65+i)}</span><span>${escapeHtml(c)}</span></button>`).join('');
  } else {
    $('#qChoices').hidden=true; $('#qFree').hidden=false; $('#qFree').value='';
  }
}

function selectChoice(i){
  if(session.answeredCurrent) return;
  session.selected=i;
  $$('.choice-btn').forEach(b=>b.classList.toggle('selected',Number(b.dataset.choice)===i));
}
function showHint(){
  const q=session.questions[session.index];
  if(session.cfg.noAI) return;
  const hints=q.hints||[];
  if(session.hintIndex>=hints.length){ toast('ヒントはここまで。もう一度自分で考えよう。'); return; }
  $('#hintBox').hidden=false;
  $('#hintBox').innerHTML=`<strong>ヒント ${session.hintIndex+1}</strong><br>${escapeHtml(hints[session.hintIndex])}`;
  session.hintIndex++;
}
function checkAnswer(){
  if(session.answeredCurrent) return;
  const q=session.questions[session.index];
  if(q.type==='choice'){
    if(session.selected===null){ toast('まず自分の答えを選ぼう'); return; }
    const isCorrect=session.selected===q.answer;
    session.answeredCurrent=true;
    if(session.cfg.noAI){
      session.answers.push({id:q.id,selected:session.selected,correct:isCorrect,explained:false});
      if(isCorrect) session.correct++;
      markAttempt(q,isCorrect,false,null,true);
      $('#nextBtn').hidden=false; $('#nextBtn').textContent=session.index===session.questions.length-1?'テストを終了 →':'次の問題 →';
      $('#checkBtn').disabled=true;
      return;
    }
    revealChoiceFeedback(q,isCorrect);
  } else {
    const text=$('#qFree').value.trim();
    if(text.length<3){ toast('まず自分の言葉で書いてみよう'); return; }
    session.answeredCurrent=true;
    $('#feedbackBox').hidden=false; $('#feedbackBox').classList.add('correct');
    $('#feedbackBox').innerHTML=`<div class="feedback-title">確認ポイント</div><div>${escapeHtml(q.sample)}</div><div class="microcopy" style="color:#5d6a76;margin-top:8px">自分の答えに大切な要素が入っているか比べよう。</div>`;
    $('#reasonPanel').hidden=false;
    $('#checkBtn').disabled=true; $('#hintBtn').disabled=true;
  }
}
function revealChoiceFeedback(q,isCorrect){
  session.answers.push({id:q.id,selected:session.selected,correct:isCorrect,explained:false});
  if(isCorrect) session.correct++; else session.needsReview++;
  $$('.choice-btn').forEach(b=>{
    const i=Number(b.dataset.choice);
    if(i===q.answer) b.classList.add('correct');
    if(i===session.selected && !isCorrect) b.classList.add('wrong');
    b.disabled=true;
  });
  const f=$('#feedbackBox'); f.hidden=false; f.classList.add(isCorrect?'correct':'wrong');
  f.innerHTML=`<div class="feedback-title">${isCorrect?'正解':'ここを確認'}</div><div>${escapeHtml(q.explanation)}</div>`;
  $('#reasonPanel').hidden=false;
  $('#causePanel').hidden=isCorrect;
  $('#checkBtn').disabled=true; $('#hintBtn').disabled=true;
}

function markReason(value){
  const q=session.questions[session.index];
  const ans=session.answers[session.answers.length-1];
  const explained=value==='yes';
  if(explained){ session.explained++; if(ans) ans.explained=true; }
  if(q.type==='free'){
    session.answers.push({id:q.id,selected:null,correct:explained,explained});
    if(explained) session.correct++; else session.needsReview++;
    markAttempt(q,explained,explained, explained?null:'principle', false);
  } else {
    const isCorrect=ans?.correct||false;
    if(isCorrect) markAttempt(q,true,explained, explained?null:'principle', false);
    else if(!$('#causePanel').hidden) {
    } else markAttempt(q,false,explained,'strategy',false);
  }
  $('#reasonPanel').hidden=true;
  $('#nextBtn').hidden=false;
  $('#nextBtn').textContent=session.index===session.questions.length-1?'結果を見る →':'次の問題 →';
}
function markCause(cause){
  const q=session.questions[session.index];
  const ans=session.answers[session.answers.length-1];
  state.causes[cause]=(state.causes[cause]||0)+1;
  markAttempt(q,false,ans?.explained||false,cause,false);
  $('#causePanel').hidden=true;
  if($('#reasonPanel').hidden){ $('#nextBtn').hidden=false; }
  saveState();
}
