function exportData(){
  const payload={app:'理科ラボ',version:APP_VERSION,exportedAt:new Date().toISOString(),state};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download=`hayabusa-science-backup-${todayKey()}.json`; a.click(); URL.revokeObjectURL(url);
}
function importData(file){
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const data=JSON.parse(reader.result);
      if(!data.state || typeof data.state.answered!=='number') throw new Error('invalid');
      state={...defaultState(),...data.state}; saveState(); renderHome(); toast('学習記録を読み込みました');
    } catch { toast('このバックアップは読み込めません'); }
  };
  reader.readAsText(file);
}
function escapeHtml(s){ return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function toast(msg){
  const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._timer); t._timer=setTimeout(()=>t.classList.remove('show'),2200);
}
addEventListener('click', e=>{
  const view=e.target.closest('[data-view]'); if(view){ showView(view.dataset.view); return; }
  const start=e.target.closest('[data-start]'); if(start){ startMode(start.dataset.start); return; }
  const choice=e.target.closest('[data-choice]'); if(choice){ selectChoice(Number(choice.dataset.choice)); return; }
  const reason=e.target.closest('[data-reason]'); if(reason){ markReason(reason.dataset.reason); return; }
  const cause=e.target.closest('[data-cause]'); if(cause){ markCause(cause.dataset.cause); return; }
  const domain=e.target.closest('[data-domain]'); if(domain){ startMode('domain',domain.dataset.domain); return; }
});
$('#hintBtn').addEventListener('click',showHint);
$('#checkBtn').addEventListener('click',checkAnswer);
$('#nextBtn').addEventListener('click',nextQuestion);
$('#exportBtn').addEventListener('click',exportData);
$('#importInput').addEventListener('change',e=>{ if(e.target.files?.[0]) importData(e.target.files[0]); e.target.value=''; });
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); deferredPrompt=e; $('#installBtn').hidden=false; });
$('#installBtn').addEventListener('click',async()=>{ if(!deferredPrompt){ toast('Safariでは共有 →「ホーム画面に追加」を使ってください'); return; } deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; $('#installBtn').hidden=true; });
if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
normalizeDaily(); renderHome(); renderLibrary();
