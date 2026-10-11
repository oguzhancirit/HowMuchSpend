import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/update.js',import.meta.url),'utf8');
function harness({release={build:27,version:'1.8.3'},open=false,offline=false}={}){
 const listeners={},nodes=new Map(),calls={reload:0,fetch:0,update:0};
 const status={textContent:''};nodes.set('update-status',status);
 const banner={classList:{add(){},remove(){}},setAttribute(){},querySelector:()=>({textContent:''})};
 const document={visibilityState:'visible',querySelector:()=>open?{}:null,getElementById:key=>nodes.get(key),createElement:()=>banner,body:{append:n=>nodes.set(n.id,n)},addEventListener:(name,fn)=>listeners[name]=fn};
 const context=vm.createContext({document,window:{location:{reload:()=>calls.reload++},addEventListener:(name,fn)=>listeners[name]=fn},navigator:{serviceWorker:{register:async(url,options)=>{calls.registration={url,options};return {update:async()=>{calls.update++}}},addEventListener:(name,fn)=>listeners[name]=fn}},fetch:async(url,options)=>{calls.fetch++;calls.request={url,options};if(offline)throw Error('offline');return {ok:true,json:async()=>release}},Date,Number,Promise,setTimeout:()=>1,localStorage:new Proxy({},{get:()=>{throw Error('Update must not access saved financial data')}})});
 vm.runInContext(source,context);
 return {calls,status,nodes,listeners,settle:()=>new Promise(resolve=>setImmediate(resolve))};
}
test('Update independently registers worker and bypasses HTTP cache',async()=>{
 const h=harness();await h.settle();assert.equal(h.calls.registration.url,'./sw.js');assert.equal(h.calls.registration.options.updateViaCache,'none');assert.equal(h.calls.request.options.cache,'no-store');assert.equal(h.calls.update,1);assert.equal(h.calls.reload,0);assert.match(h.status.textContent,/Güncel/);
});
test('New version reloads idle app, but preserves open editing dialog',async()=>{
 const idle=harness({release:{build:28,version:'1.8.4'}});await idle.settle();assert.equal(idle.calls.reload,1);
 const editing=harness({release:{build:28,version:'1.8.4'},open:true});await editing.settle();assert.equal(editing.calls.reload,0);assert.ok(editing.nodes.has('update-banner'));
});
test('Resume and online checks coalesce; manual check runs despite throttling',async()=>{
 const h=harness();await h.settle();h.listeners.pageshow();h.listeners.visibilitychange();await h.settle();assert.equal(h.calls.fetch,1);
 h.listeners.click({target:{closest:()=>({})}});h.listeners.online();await h.settle();assert.equal(h.calls.fetch,2);
});
test('Offline update leaves app usable without reload or data mutation',async()=>{
 const h=harness({offline:true});await h.settle();assert.equal(h.calls.reload,0);assert.match(h.status.textContent,/Kontrol edilemedi/);
});
test('Release, worker cache and versioned entrypoints identify same build',()=>{
 const release=JSON.parse(fs.readFileSync(new URL('../public/release.json',import.meta.url),'utf8'));
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');const worker=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
 assert.match(source,new RegExp('BUILD='+release.build));assert.ok(html.includes('update.js?v='+release.build));assert.ok(html.includes('app.js?v='+release.build));assert.ok(app.includes('model.js?v='+release.build));assert.ok(worker.includes('shell-v'+release.build));assert.match(worker,/cache:'no-store'/);assert.match(worker,/cache:'reload'/);
});
