import {createAppLock} from './app-lock.js?v=28';
window.DebTrackerLock=createAppLock({startApp:()=>import('./app.js?v=28')});
await window.DebTrackerLock.boot();
