/* Independent of app rendering, so a failed app module cannot block updates. */
(() => {
  const BUILD=31, VERSION='1.9.3';
  let checking=null,registration=null,newBuild=false,reloading=false,lastCheck=0,started=false;
  const editing=()=>!!document.querySelector('dialog[open], [data-editing-savings], html[data-editing-savings-draft="true"], [data-editing-payments], html[data-editing-payments-draft="true"]');
  const status=text=>{const node=document.getElementById('update-status');if(node)node.textContent=text;};
  function showUpdate(){
    let banner=document.getElementById('update-banner');
    if(!banner){banner=document.createElement('div');banner.id='update-banner';banner.className='update-banner';banner.setAttribute('role','status');banner.innerHTML='<span>Yeni sürüm hazır.</span><button type="button" data-check-update>Güncelle</button>';document.body.append(banner);}
    banner.querySelector('span').textContent=editing()?'Yeni sürüm hazır. Önce açık işlemini tamamla.':'Yeni sürüm hazır.';
  }
  function reload(){if(reloading)return;if(editing()){showUpdate();return;}reloading=true;window.location.reload();}
  async function run(manual){
    lastCheck=Date.now();status('Güncelleme kontrol ediliyor…');
    try {
      const response=await fetch('./release.json?check='+Date.now(),{cache:'no-store'});
      if(!response.ok)throw new Error('Release unavailable');
      const release=await response.json();
      if(!Number.isInteger(release.build)||typeof release.version!=='string')throw new Error('Invalid release');
      if(registration)await registration.update().catch(()=>{});
      // Cache-first navigation must wait for the new shell before reloading.
      const installing=registration?.installing||registration?.waiting;
      if(release.build>BUILD&&installing&&installing.state!=='activated'){
        await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Update still installing')),20000);const changed=()=>{if(installing.state==='activated'){clearTimeout(timer);installing.removeEventListener('statechange',changed);resolve();}else if(installing.state==='redundant'){clearTimeout(timer);installing.removeEventListener('statechange',changed);reject(new Error('Update failed'));}};installing.addEventListener('statechange',changed);changed();});
      }
      newBuild=release.build>BUILD;
      if(newBuild){status('Yeni sürüm hazır.');reload();}
      else status('Güncel · v'+VERSION);
    } catch {status('Kontrol edilemedi. İnternet bağlantınla tekrar dene.');if(manual){const toast=document.getElementById('toast');if(toast){toast.textContent='Güncelleme kontrol edilemedi. Kayıtların korunuyor.';toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),4500);}}}
  }
  function check(manual=false){
    if(!started){if(!manual)return Promise.resolve();start();}
    if(newBuild){reload();return Promise.resolve();}
    if(checking)return checking;
    if(!manual&&Date.now()-lastCheck<15000)return Promise.resolve();
    checking=run(manual).finally(()=>{checking=null;});return checking;
  }
  document.addEventListener('click',e=>{if(e.target.closest('[data-check-update]'))check(true);});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){start();check();}});
  window.addEventListener('pageshow',()=>{start();check();});
  window.addEventListener('online',()=>{start();check(true);});
  function start(){
    if(started)return;started=true;
    if('serviceWorker' in navigator){
      navigator.serviceWorker.addEventListener('controllerchange',()=>{if(newBuild)reload();});
      navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>{registration=r;return check();}).catch(()=>check());
    }else check();
  }
  start();
})();
