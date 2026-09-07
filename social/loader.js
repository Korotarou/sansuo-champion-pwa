(function(){
"use strict";
function loadScript(path){
  return new Promise(function(resolve,reject){
    var s=document.createElement("script");
    s.src=path;
    s.onload=resolve;
    s.onerror=function(){reject(new Error(path+" の読み込みに失敗しました"));};
    document.head.appendChild(s);
  });
}
async function get(path){
  var r=await fetch(path,{cache:"no-store"});
  if(!r.ok)throw new Error(path+" の読み込みに失敗しました（"+r.status+"）");
  return r.text();
}
async function gunzip(parts){
  if(!("DecompressionStream" in window))throw new Error("このSafariでは圧縮問題データを展開できません。iPadOS / Safariを更新してください。");
  var xs=await Promise.all(parts.map(get));
  var b64=xs.join("").trim();
  var bin=Uint8Array.from(atob(b64),function(c){return c.charCodeAt(0);});
  var stream=new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}
async function run(){
  var data=await gunzip(["payload/data1.txt","payload/data2.txt","payload/data3.txt"]);
  var s=document.createElement("script");
  s.textContent=data;
  document.head.appendChild(s);
  s.remove();
  await loadScript("problem-engine.js");
  await loadScript("app.js");
}
run().catch(function(err){
  console.error(err);
  var m=document.getElementById("main");
  if(m)m.innerHTML='<div class="card" style="margin:24px"><h1>読み込みエラー</h1><p>'+String(err&&err.message||err)+'</p><button class="btn" onclick="location.reload()">再読み込み</button></div>';
});
})();