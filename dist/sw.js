const CACHE='howmuchspend-shell-v7';
const ASSETS=['./','./index.html','./style.css?v=7','./app.js?v=7','./update.js?v=7','./model.js?v=7','./icon.svg?v=7','./manifest.webmanifest','./apple-touch-icon.png?v=7','./icon-192.png?v=7','./icon-512.png?v=7','./assets/ziraat.png','./assets/akbank.png','./assets/yapikredi.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(path=>new Request(path,{cache:'reload'})))));self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('howmuchspend-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==location.origin)return;if(event.request.mode==='navigate'){event.respondWith(fetch(new Request(event.request,{cache:'no-store'})).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy));}return r;}).catch(()=>caches.open(CACHE).then(cache=>cache.match('./index.html'))));return;}
// Only cache this app's own shell. Never intercept authentication or other routes.
if(!ASSETS.some(p=>new URL(p,self.registration.scope).pathname===u.pathname))return;
event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request)).then(cached=>cached||fetch(event.request)));});
