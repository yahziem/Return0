/* No cacheamos datos ni el SDK Firebase en el service worker. Las copias de trabajo
   pendientes se guardan explícitamente en el navegador con usuario y revisión. */
const CACHE='slm-ui-firebase-v3';
const ASSETS=['./','./index.html','./styles.css','./dark.css','./app.js','./firebase-cloud.js','./firebase-config.js','./icon.svg','./icon-192.png','./icon-512.png','./manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).catch(()=>{}));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
  if(req.mode==='navigate'){event.respondWith(fetch(req).catch(()=>caches.match('./index.html')));return}
  event.respondWith(fetch(req).catch(()=>caches.match(req)));
});
