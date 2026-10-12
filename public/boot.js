import {createAppLock} from './app-lock.js?v=29';
window.DebTrackerLock=createAppLock({startApp:()=>import('./app.js?v=29')});
await window.DebTrackerLock.boot();
