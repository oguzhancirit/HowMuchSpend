const CACHE='howmuchspend-shell-v20';
const ASSETS=['./','./index.html','./style.css?v=20','./app.js?v=20','./motion.js?v=20','./payments.js?v=20','./payments-model.js?v=20','./update.js?v=20','./savings.js?v=20','./savings-model.js?v=20','./model.js?v=20','./notifications.js?v=20','./calendar-status.js?v=20','./icon.svg?v=20','./manifest.webmanifest','./apple-touch-icon.png?v=20','./icon-192.png?v=20','./icon-512.png?v=20','./assets/ziraat.png','./assets/akbank.png','./assets/yapikredi.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(path=>new Request(path,{cache:'reload'})))));self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('howmuchspend-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==location.origin)return;if(event.request.mode==='navigate'){event.respondWith(fetch(new Request(event.request,{cache:'no-store'})).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy));}return r;}).catch(()=>caches.open(CACHE).then(cache=>cache.match('./index.html'))));return;}
// Only cache this app's own shell. Never intercept authentication or other routes.
if(!ASSETS.some(p=>new URL(p,self.registration.scope).pathname===u.pathname))return;
event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request)).then(cached=>cached||fetch(event.request)));});
self.addEventListener('push',event=>{
  let payload={};try{payload=event.data?.json()||{}}catch{}
  // Every push is user visible, including malformed or empty messages.
  event.waitUntil(self.registration.showNotification(payload.title||'HowMuchSpend',{
    body:payload.body||'Ödeme takvimini kontrol et.',icon:'./icon-192.png',badge:'./icon-192.png',
    tag:payload.tag||'howmuchspend-reminder',data:{url:payload.url||'./'}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const target=new URL(event.notification.data?.url||'./',self.registration.scope);
    if(target.origin!==new URL(self.registration.scope).origin)return;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(client=>new URL(client.url).origin===target.origin);
    if(existing){await existing.focus();existing.postMessage({type:'open-reminder',url:target.href});}
    else await self.clients.openWindow(target.href);
  })());
});
