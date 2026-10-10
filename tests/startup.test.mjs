import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
function worker(cached){
 const listeners={},calls={fetch:0,put:0};
 const shell={status:200,body:'cached shell'};
 vm.runInNewContext(source,{URL,Request,location:{origin:'https://app.test'},self:{registration:{scope:'https://app.test/'},addEventListener:(name,fn)=>listeners[name]=fn},caches:{open:async()=>({match:async()=>cached?shell:undefined,put:()=>calls.put++})},fetch:()=>{calls.fetch++;return new Promise(()=>{});}});
 const request=(path,mode='navigate')=>{let response;listeners.fetch({request:{url:'https://app.test'+path,method:'GET',mode},respondWith:r=>response=r});return response;};
 return {calls,shell,request};
}
test('Installed app shell opens without waiting for a stalled network; reminder query is retained in URL',async()=>{
 const w=worker(true);assert.equal(await w.request('/?date=2026-10-10'),w.shell);assert.equal(w.calls.fetch,0);assert.equal(w.calls.put,0);
});
test('Navigation to APIs and authentication never substitutes cached application HTML',()=>{
 const w=worker(true);for(const route of ['/api/push/device','/auth/login','/other'])assert.equal(w.request(route),undefined);assert.equal(w.calls.fetch,0);
});
