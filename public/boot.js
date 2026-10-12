import {createAppLock} from './app-lock.js?v=30';
let prepared=false,stylesReady=null;
const prepareApp=()=>{
  if(prepared)return stylesReady;prepared=true;
  const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href='./style.css?v=30';
  stylesReady=new Promise((resolve,reject)=>{stylesheet.addEventListener('load',resolve,{once:true});stylesheet.addEventListener('error',()=>reject(new Error('Uygulama görünümü yüklenemedi. İnternet bağlantınla tekrar dene.')),{once:true});});
  stylesReady.catch(()=>{});document.head.append(stylesheet);
  for(const file of ['app.js','model.js','payments.js','payments-model.js','savings.js','savings-model.js','motion.js','notifications.js','calendar-status.js']){
    const link=document.createElement('link');link.rel='modulepreload';link.href='./'+file+'?v=30';document.head.append(link);
  }
  return stylesReady;
};
window.DebTrackerLock=createAppLock({prepareApp,startApp:()=>Promise.all([prepareApp(),import('./app.js?v=30')])});
await window.DebTrackerLock.boot();
