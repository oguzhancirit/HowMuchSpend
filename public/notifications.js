const KEY='howmuchspend.push.v1';
export function reminderRules(data,details=false) {
  // Only the reminder projection leaves the phone. Notes are never uploaded.
  return {schemaVersion:1,updatedAt:data.updatedAt,entries:data.entries.map(e=>({
    id:e.id,type:e.type,title:details?e.title:(e.type==='income'?'Beklenen gelir':'Ödeme'),
    amountCents:details?e.amountCents:1,currency:e.currency||'TRY',category:e.type==='income'?'otherincome':'other',
    bank:details?e.bank:'',notes:'',startDate:e.startDate,recurrence:e.recurrence,count:e.count,endDate:e.endDate,
    ...(e.anchorDay?{anchorDay:e.anchorDay}:{}),paidDates:e.paidDates,skips:e.skips,
    overrides:Object.fromEntries(Object.entries(e.overrides).map(([date,o])=>[date,{title:details?o.title:(e.type==='income'?'Beklenen gelir':'Ödeme'),amountCents:details?o.amountCents:1,currency:o.currency||e.currency||'TRY',category:e.type==='income'?'otherincome':'other',bank:details?o.bank:'',notes:''}]))
  }))};
}
export function createPushController({getData,canSync,esc,toast,onChange}) {
  let saved={active:false,token:'',leadDays:1,details:false},config=null,busy=false,error='',syncedAt=null,server=null,queue=Promise.resolve(),retryTimer;
  try{const old=JSON.parse(localStorage.getItem(KEY)||'{}');saved={...saved,...old};if(![0,1,3,7].includes(saved.leadDays))saved.leadDays=1;}catch{}
  const standalone=()=>window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone;
  const ios=()=>/iPhone|iPad|iPod/.test(navigator.userAgent)||(/Mac/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
  const supported=()=>!!window.Notification&&!!window.PushManager&&!!navigator.serviceWorker&&window.isSecureContext;
  const persist=()=>localStorage.setItem(KEY,JSON.stringify(saved));
  const change=()=>onChange();
  async function api(path,method='GET',body) {
    const response=await fetch('./api/push/'+path,{method,cache:'no-store',headers:{...(saved.token?{Authorization:'Bearer '+saved.token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
    const value=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(value.error||'Bildirim sunucusuna ulaşılamadı.');return value;
  }
  const registration=()=>navigator.serviceWorker.ready;
  const publicBytes=key=>Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(key.length/4)*4,'=')),c=>c.charCodeAt(0));
  async function loadConfig(){config=await api('config');return config;}
  function panel(){
    const installed=ios()&&!standalone(),blocked=supported()&&Notification.permission==='denied';
    const status=busy?'İşleniyor…':saved.active?(error?'Eşitleme gerekli':'Açık'):'Kapalı';
    const hint=installed?'Bildirimleri açmak için ana ekrandaki HowMuchSpend simgesinden gir.':blocked?'iPhone Ayarlar → Bildirimler → HowMuchSpend bölümünden izin ver.':!supported()?'Web Push için iOS 16.4 veya üstü ve ana ekran uygulaması gerekir.':config?.schedulerReady?'Uygulama kapalıyken de hatırlatır. Türkiye saatiyle 09:00 sonrası gönderilir.':'Bildirim izni ve test gönderimi kullanılabilir. Otomatik hatırlatma zamanlayıcısı henüz etkin değil.';
    const options=[[0,'Ödeme günü'],[1,'1 gün önce'],[3,'3 gün önce'],[7,'7 gün önce']].map(([n,label])=>`<option value="${n}" ${saved.leadDays===n?'selected':''}>${label}</option>`).join('');
    return `<section class="panel settings-panel" id="notification-panel"><div class="section-head"><h2>Bildirimler</h2><span class="notification-status ${saved.active&&!error?'enabled':''}" role="status">${status}</span></div><p>${hint}</p><div class="push-options"><label class="field">Hatırlatma<select id="push-lead" ${busy?'disabled':''}>${options}</select></label><label class="push-privacy"><input type="checkbox" id="push-details" ${saved.details?'checked':''} ${busy?'disabled':''}> Bildirimde kayıt adını ve tutarı göster</label></div><small class="push-note">Hatırlatma tarihleri sunucuda saklanır. Notların ve asıl kayıtların bu cihazda kalır.</small>${error?`<p class="push-error" role="alert">${esc(error)}</p>`:''}${error&&!saved.active?'<button class="secondary" data-action="push-retry">Tekrar kontrol et</button>':''}${saved.active?`<div class="push-actions"><button class="secondary" data-action="push-test" ${busy?'disabled':''}>Test bildirimi</button><button class="secondary" data-action="push-disable" ${busy?'disabled':''}>Kapat</button>${error?'<button class="secondary" data-action="push-retry">Tekrar eşitle</button>':''}</div>`:`<button class="primary" data-action="push-enable" ${busy||installed||blocked||!supported()||!config?.ready?'disabled':''}>Bildirimleri aç</button>`}${syncedAt?`<small class="push-note">Son eşitleme: ${esc(new Date(syncedAt).toLocaleString('tr-TR'))}</small>`:''}${server?.schedulerStale&&config?.schedulerReady?'<p class="push-error">Otomatik gönderim denetimi gecikti. Test bildirimi çalışabilir; zamanlayıcı kontrol edilmeli.</p>':''}</section>`;
  }
  function sync(manual=false){
    clearTimeout(retryTimer);
    if(!saved.active||!canSync())return Promise.resolve();
    queue=queue.catch(()=>{}).then(async()=>{
      if(!saved.active||!canSync())return;
      try{const r=await registration(),subscription=await r.pushManager.getSubscription();if(!subscription)throw new Error('Bu cihazın aboneliği kapanmış. Bildirimleri kapatıp yeniden aç.');
        server=await api('device','PUT',{subscription:subscription.toJSON(),rules:reminderRules(getData(),saved.details),leadDays:saved.leadDays,details:saved.details});
        syncedAt=new Date().toISOString();error='';if(manual)toast('Hatırlatmalar güncellendi.');
      }catch(e){error='Hatırlatmalar eşitlenemedi: '+e.message;retryTimer=setTimeout(()=>sync(),60000);}change();
    });return queue;
  }
  async function enable(){
    if(busy)return;if(!canSync()){toast('Önce kendi takvimine geç veya kayıt sorununu çöz.');return;}
    // Request inside this tap, before any await, as required by iOS.
    const permission=Notification.requestPermission();busy=true;error='';change();
    let newlySubscribed=false;
    try{
      if(await permission!=='granted')throw new Error('Bildirim izni verilmedi.');
      await loadConfig();if(!config.ready)throw new Error('Bildirim sunucusu henüz hazır değil.');
      if(!saved.token){const bytes=crypto.getRandomValues(new Uint8Array(32));saved.token=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');persist();}
      // Preserve an additional snapshot before opting into server reminders.
      if(!localStorage.getItem('howmuchspend.prePushBackup.v1'))localStorage.setItem('howmuchspend.prePushBackup.v1',JSON.stringify(getData()));
      const r=await registration();let subscription=await r.pushManager.getSubscription();if(!subscription){subscription=await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicBytes(config.publicKey)});newlySubscribed=true;}
      server=await api('device','PUT',{subscription:subscription.toJSON(),rules:reminderRules(getData(),saved.details),leadDays:saved.leadDays,details:saved.details});
      saved.active=true;persist();syncedAt=new Date().toISOString();toast('Bildirimler açıldı. Test bildirimi gönderebilirsin.');
    }catch(e){error=e.message;if(newlySubscribed){try{await(await(await registration()).pushManager.getSubscription())?.unsubscribe()}catch{}}}
    finally{busy=false;change();}
  }
  async function disable(){if(busy)return;busy=true;change();await queue.catch(()=>{});try{await api('device','DELETE');saved.active=false;persist();clearTimeout(retryTimer);try{await(await(await registration()).pushManager.getSubscription())?.unsubscribe()}catch{}error='';syncedAt=null;toast('Bildirimler kapatıldı.');}catch(e){error='Kapatılamadı: '+e.message;}finally{busy=false;change();}}
  async function test(){if(busy)return;busy=true;change();try{await sync();if(error)throw new Error(error);await api('test','POST');toast('Test bildirimi gönderim servisine iletildi.');}catch(e){error=e.message;}finally{busy=false;change();}}
  async function settings(values){Object.assign(saved,values);try{persist();await sync()}catch(e){error=e.message;}change();}
  async function refresh(){if(!supported())return;try{await loadConfig();if(!config.ready)error='Bildirim sunucusu henüz hazır değil.';if(saved.active){server=await api('device');if(server.exists&&!server.enabled)throw new Error('Bildirim aboneliğin sona ermiş. Kapatıp yeniden aç.');await sync();}}catch(e){error=e.message;}change();}
  window.addEventListener('online',()=>refresh());
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()});
  const warning=()=>saved.active&&error?'<p class="push-sync-warning" role="status">Hatırlatmalar henüz eşitlenemedi. Ayarlar → Bildirimler bölümünden kontrol et.</p>':'';
  return {panel,warning,enable,disable,test,settings,sync,refresh};
}
