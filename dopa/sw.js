const CACHE='four-subject-dopa-v4-companion';
const ASSETS=['./','./index.html','./styles.css','./intensity.css','./evolution.css','./app.js','./evolution.js','./companion.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('four-subject-dopa-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  if(u.origin!==self.location.origin)return;
  if(!u.pathname.includes('/dopa/'))return;
  e.respondWith(caches.open(CACHE).then(c=>c.match(e.request).then(hit=>hit||fetch(e.request).then(res=>{const copy=res.clone();c.put(e.request,copy);return res}).catch(()=>c.match('./index.html')))));
});