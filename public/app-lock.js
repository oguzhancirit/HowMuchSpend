// Passkey app lock; never reads or uploads the financial ledger.
const KEY='howmuchspend.appLock.v1';
const faceIcon='<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M16 5H9a4 4 0 0 0-4 4v7m27-11h7a4 4 0 0 1 4 4v7M5 32v7a4 4 0 0 0 4 4h7m16 0h7a4 4 0 0 0 4-4v-7M16 18v5m16-5v5m-9-5v11h3m-11 4c5 4 13 4 18 0"/></svg>';
const randomHex=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),x=>x.toString(16).padStart(2,'0')).join('');
const unb64=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),x=>x.charCodeAt(0));
const b64=buffer=>btoa(String.fromCharCode(...new Uint8Array(buffer))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export function needsReauth(hiddenAt,now){return now-hiddenAt>=60000;}
export function credentialJSON(c){
  const r=c.response,response={clientDataJSON:b64(r.clientDataJSON)};
  for(const field of ['attestationObject','authenticatorData','signature','userHandle'])if(r[field])response[field]=b64(r[field]);
  if(r.getTransports)response.transports=r.getTransports();
  return {id:c.id,rawId:b64(c.rawId),type:c.type,response,clientExtensionResults:c.getClientExtensionResults(),authenticatorAttachment:c.authenticatorAttachment};
}
export function publicKeyOptions(options,register){
  const value={...options,challenge:unb64(options.challenge)};
  if(register){value.user={...options.user,id:unb64(options.user.id)};if(options.excludeCredentials)value.excludeCredentials=options.excludeCredentials.map(c=>({...c,id:unb64(c.id)}));}
  else if(options.allowCredentials)value.allowCredentials=options.allowCredentials.map(c=>({...c,id:unb64(c.id)}));
  return value;
}
export function createAppLock({startApp}){
  const root=document.documentElement,screen=document.getElementById('app-lock-screen'),dialog=document.getElementById('app-lock-setup');
  let saved={enabled:false,token:''},storageFailed=false,busy=false,started=false,locked=false,hiddenAt=null,timer=null,pendingCode='',setupActive=false,automaticAttempted=false,unusedChallenge=null;
  try{const raw=localStorage.getItem(KEY);if(raw){saved=JSON.parse(raw);if(typeof saved.enabled!=='boolean'||!/^[a-f0-9]{64}$/.test(saved.token))throw Error();}}catch{storageFailed=true;locked=true;}
  const supported=()=>!!window.PublicKeyCredential&&!!navigator.credentials&&isSecureContext;
  const notify=()=>window.dispatchEvent(new CustomEvent('app-lock-change'));
  const persist=()=>localStorage.setItem(KEY,JSON.stringify(saved));
  async function reconcile(){if(!saved.pending)return;const status=await api('status',{});if(!status.enrolled&&saved.pending!=='register'&&!status.cleared)throw Error('Kilit kaydı doğrulanamadı. Sayfayı yeniden aç; tarayıcı verilerini silme.');saved.enabled=status.enrolled;saved.pending=null;persist();}
  function mask(state){root.dataset.appLock=state;document.getElementById('app-lock-caption').textContent='Uygulama kilitli';for(const node of document.querySelectorAll('.app-shell,.bottom-nav,dialog:not(#app-lock-setup),#toast,#update-banner'))node.inert=state!=='open';screen.hidden=state==='open';}
  function message(text){document.getElementById('app-lock-error').textContent=text;}
  function controls(){root.dataset.lockAuthenticating=String(busy);document.getElementById('app-lock-unlock').disabled=busy;document.getElementById('app-lock-recover').disabled=busy;document.getElementById('app-lock-caption').textContent=busy?'Kimliğin doğrulanıyor…':'Uygulama kilitli';}
  async function api(route,input){
    if(!/^[a-f0-9]{64}$/.test(saved.token))throw Error('Bu cihazın kilit anahtarı okunamadı. Tarayıcı verilerini silme.');
    let response;try{response=await fetch('./api/app-lock/'+route,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+saved.token},body:JSON.stringify(input),credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw Error('Doğrulama için internet bağlantısı gerekli. Tekrar dene.');}
    if(response.status===401){let body;try{body=await response.json();}catch{}throw Error(body?.error||'Oturumunu yenilemek için sayfayı yeniden aç.');}
    const body=await response.json().catch(()=>null);if(!response.ok||!body)throw Error(body?.error||'Kilit sunucusuna ulaşılamadı. Tekrar dene.');return body;
  }
  async function authenticate(purpose){
    if(!supported())throw Error('Bu cihaz geçiş anahtarı doğrulamasını desteklemiyor. Kurtarma kodunu kullan.');
    // An unused challenge survives a cancelled prompt for a short manual retry.
    // Never reuse one after an assertion is sent to the server.
    let options;
    if(unusedChallenge?.purpose===purpose&&Date.now()-unusedChallenge.at<105000)options=unusedChallenge.options;
    else {({options}=await api('options',{purpose}));unusedChallenge={purpose,options,at:Date.now()};}
    const credential=await navigator.credentials.get({publicKey:publicKeyOptions(options,false),mediation:'required'});
    if(!credential)throw Error('Doğrulama tamamlanmadı.');
    unusedChallenge=null;
    if(purpose==='disable'){saved.pending='disable';persist();}
    await api('verify',{purpose,response:credentialJSON(credential)});
    saved.pending=null;persist();
  }
  function errorText(error){return error.name==='NotAllowedError'?'Doğrulama iptal edildi veya süresi doldu. Tekrar deneyebilirsin.':error.name==='InvalidStateError'?'Geçiş anahtarı zaten mevcut. Yeniden dene veya kurtarma kodunu kullan.':error.message||'Doğrulama tamamlanmadı.';}
  async function reveal(){
    if(document.visibilityState==='hidden'){locked=true;mask('locked');return;}
    if(!started){await startApp();started=true;}
    locked=false;hiddenAt=null;clearTimeout(timer);mask('open');message('');notify();
  }
  function automaticUnlock(){
    if(automaticAttempted||busy||setupActive||storageFailed||saved.pending||!saved.enabled||document.visibilityState==='hidden')return Promise.resolve();
    automaticAttempted=true;
    return unlock();
  }
  function lock(automatically=false){if(!saved.enabled)return;locked=true;mask('locked');for(const d of document.querySelectorAll('dialog[open]'))d.close();notify();if(automatically)return automaticUnlock();document.getElementById('app-lock-unlock').focus();}
  async function unlock(){if(busy)return;busy=true;controls();message('');try{await authenticate('unlock');await reveal();}catch(error){message(errorText(error));}finally{busy=false;controls();}}
  async function recover(){if(busy)return;busy=true;controls();message('');try{saved.pending='recover';persist();await api('recover',{recoveryCode:document.getElementById('app-lock-recovery-code').value});saved.enabled=false;saved.pending=null;persist();document.getElementById('app-lock-recovery-code').value='';await reveal();}catch(error){if(saved.pending){try{await reconcile();if(!saved.enabled){await reveal();return;}}catch{}}message(errorText(error));}finally{busy=false;controls();}}
  function setup(){
    if(busy||saved.enabled)return;
    if(!supported()){window.alert('Bu cihaz geçiş anahtarını desteklemiyor. iPhone’da ana ekrandaki DebTracker’ı kullan.');return;}
    try{if(!saved.token)saved.token=randomHex(32);persist();}catch{window.alert('Kilit tercihi kaydedilemiyor. Tarayıcı depolamasını kontrol et.');return;}
    pendingCode=randomHex(16);setupActive=true;
    document.getElementById('app-lock-setup-code').textContent=pendingCode.match(/.{4}/g).join('-');
    document.getElementById('app-lock-code-saved').checked=false;document.getElementById('app-lock-enable').disabled=true;document.getElementById('app-lock-setup-error').textContent='';dialog.showModal();
  }
  async function enable(){
    if(busy||!pendingCode||!document.getElementById('app-lock-code-saved').checked)return;
    busy=true;document.getElementById('app-lock-enable').disabled=true;document.getElementById('app-lock-setup-error').textContent='';
    try{
      if(!await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())throw Error('Bu cihazda Face ID, Touch ID veya cihaz parolası doğrulaması kullanılamıyor.');
      const {options}=await api('options',{purpose:'register'});
      const credential=await navigator.credentials.create({publicKey:publicKeyOptions(options,true)});
      if(!credential)throw Error('Geçiş anahtarı oluşturulmadı.');
      // Persist a conservative state before the server write. An interrupted
      // request is reconciled with the authenticated server on the next boot.
      saved.enabled=true;saved.pending='register';persist();
      await api('register',{response:credentialJSON(credential),recoveryCode:pendingCode});
      saved.pending=null;persist();dialog.close();pendingCode='';setupActive=false;notify();
    }catch(error){
      if(saved.pending){try{await reconcile();if(saved.enabled){dialog.close();notify();return;}}catch{dialog.close();lock();}}
      document.getElementById('app-lock-setup-error').textContent=errorText(error);
    }finally{busy=false;document.getElementById('app-lock-enable').disabled=!document.getElementById('app-lock-code-saved').checked;}
  }
  async function disable(){if(busy)return;busy=true;try{await authenticate('disable');saved.enabled=false;persist();await reveal();}catch(error){if(saved.pending){try{await reconcile();if(!saved.enabled){await reveal();return;}}catch{lock();}}window.alert(errorText(error));}finally{busy=false;}}
  function panel(){return `<section class="panel settings-panel"><div class="section-head"><h2>Uygulama kilidi</h2><span class="notification-status ${saved.enabled?'enabled':''}">${saved.enabled?'Açık':'Kapalı'}</span></div><div class="settings-item"><span class="lock-settings-icon">${faceIcon}</span><div><strong>Face ID / geçiş anahtarı</strong><small>${saved.enabled?'Açılışta ve 1 dakika sonra doğrular':'Tutarları görmeden önce kimliğini doğrula'}</small></div><button class="secondary" data-lock-action="${saved.enabled?'disable':'setup'}" ${!supported()?'disabled':''}>${saved.enabled?'Kapat':'Etkinleştir'}</button></div>${saved.enabled?'<button class="secondary full" data-lock-action="lock">Şimdi kilitle</button>':''}<small class="backup-note">${!supported()?'Bu tarayıcı geçiş anahtarını desteklemiyor. ':''}iOS, Face ID veya cihaz parolasını kullanabilir. Kilit için internet gerekir. Bu özellik cihazdaki kayıtları şifrelemez. Bildirimler devam eder.</small></section>`;}
  document.getElementById('app-lock-unlock').addEventListener('click',unlock);
  document.getElementById('app-lock-recover').addEventListener('click',recover);
  document.getElementById('app-lock-refresh').addEventListener('click',()=>location.reload());
  document.getElementById('app-lock-code-saved').addEventListener('change',e=>{document.getElementById('app-lock-enable').disabled=busy||!e.target.checked;});
  document.getElementById('app-lock-enable').addEventListener('click',enable);
  document.getElementById('app-lock-save-code').addEventListener('click',()=>{
    const url=URL.createObjectURL(new Blob(['DebTracker kurtarma kodu\n'+pendingCode.match(/.{4}/g).join('-')+'\nBu kodu güvenli sakla. Kilidi kaldırır; kayıtlarını silmez.'],{type:'text/plain'}));
    const a=document.createElement('a');a.href=url;a.download='DebTracker-kurtarma-kodu.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  document.getElementById('app-lock-setup-cancel').addEventListener('click',()=>{if(!busy)dialog.close();});
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  dialog.addEventListener('close',()=>{pendingCode='';setupActive=false;document.getElementById('app-lock-setup-code').textContent='';});
  document.addEventListener('click',e=>{const button=e.target.closest('[data-lock-action]');if(button){e.preventDefault();({setup,disable,lock})[button.dataset.lockAction]?.();}});
  document.addEventListener('visibilitychange',()=>{
    if(!saved.enabled||setupActive)return;
    if(document.visibilityState==='hidden'){if(!busy)automaticAttempted=false;hiddenAt=Date.now();mask('suspended');clearTimeout(timer);timer=setTimeout(()=>{locked=true;},60000);}
    else {clearTimeout(timer);if(locked||hiddenAt!==null&&needsReauth(hiddenAt,Date.now()))return lock(true);else {mask('open');hiddenAt=null;}}
  });
  window.addEventListener('pagehide',()=>{if(saved.enabled){if(!busy)automaticAttempted=false;mask('suspended');}});
  window.addEventListener('pageshow',e=>{if(e.persisted&&saved.enabled)return lock(true);});
  return {panel,isLocked:()=>locked||root.dataset.appLock!=='open',async boot(){if(storageFailed){mask('locked');message('Kilit ayarı okunamadı. Tarayıcı verilerini silme; sayfayı yeniden aç.');return;}if(saved.pending){try{await reconcile();}catch(error){locked=true;mask('locked');message(errorText(error));return;}}if(saved.enabled){locked=true;mask('locked');await automaticUnlock();}else {try{await reveal();}catch{mask('locked');message('Uygulama yüklenemedi. Sayfayı yeniden aç.');}}}};
}
