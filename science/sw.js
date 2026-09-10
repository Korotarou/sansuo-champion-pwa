const CACHE = 'hayabusa-science-v7';
const ASSETS = [
  './','./index.html','./manifest.webmanifest','./assets/icon.svg',
  './styles-base.css','./styles-quiz.css','./styles-record.css',
  './questions-1.js','./questions-2.js','./questions-3.js','./questions-4.js','./questions-5.js','./questions-6.js','./questions-7.js','./questions-8.js','./sapix-import.js',
  './app-core.js','./app-quiz.js','./app-results.js','./app-boot.js'
];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
    const copy = resp.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return resp;
  }).catch(() => caches.match('./index.html'))));
});
