import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchHandler} from '../worker/index.js';
import worker from '../worker/index.js';

const env={DB:{prepare:()=>({first:async()=>null,bind(){return this}})},VAPID_PRIVATE_JWK:'{}',VAPID_PUBLIC_KEY:'k',VAPID_SUBJECT:'https://example.test'};
const url='https://push.example.workers.dev/api/push/device';
const PAGES='https://oguzhancirit.github.io';

test('Preflight is answered only for the allowed GitHub Pages origin',async()=>{
  const ok=await fetchHandler(new Request(url,{method:'OPTIONS',headers:{Origin:PAGES,'Access-Control-Request-Method':'PUT'}}),env);
  assert.equal(ok.status,204);assert.equal(ok.headers.get('Access-Control-Allow-Origin'),PAGES);assert.match(ok.headers.get('Access-Control-Allow-Headers'),/Authorization/);
  const bad=await fetchHandler(new Request(url,{method:'OPTIONS',headers:{Origin:'https://evil.test'}}),env);
  assert.equal(bad.status,403);assert.equal(bad.headers.get('Access-Control-Allow-Origin'),null);
});
test('Writes from the Pages origin reach authentication; other origins are rejected',async()=>{
  const allowed=await fetchHandler(new Request(url,{method:'PUT',headers:{Origin:PAGES,'Content-Type':'application/json'},body:'{}'}),env);
  assert.equal(allowed.status,401);assert.equal(allowed.headers.get('Access-Control-Allow-Origin'),PAGES);
  const evil=await fetchHandler(new Request(url,{method:'PUT',headers:{Origin:'https://evil.test','Content-Type':'application/json'},body:'{}'}),env);
  assert.equal(evil.status,403);assert.equal(evil.headers.get('Access-Control-Allow-Origin'),null);
  const none=await fetchHandler(new Request(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:'{}'}),env);
  assert.equal(none.status,403);
});
test('Allowed origins can be configured and replace the default',async()=>{
  const custom={...env,ALLOWED_ORIGINS:'https://example.github.io'};
  assert.equal((await fetchHandler(new Request(url,{method:'OPTIONS',headers:{Origin:'https://example.github.io'}}),custom)).status,204);
  assert.equal((await fetchHandler(new Request(url,{method:'OPTIONS',headers:{Origin:PAGES}}),custom)).status,403);
});
test('Config is readable cross-origin and the Worker exposes a cron handler',async()=>{
  const res=await fetchHandler(new Request('https://push.example.workers.dev/api/push/config',{headers:{Origin:PAGES}}),env);
  assert.equal(res.status,200);assert.equal(res.headers.get('Access-Control-Allow-Origin'),PAGES);
  assert.equal(typeof worker.scheduled,'function');
});

test('config lists missing settings by name and does not require VAPID_SUBJECT',async()=>{
  const mod=await import('../worker/index.js');
  const res=await mod.fetchHandler(new Request('https://x.workers.dev/api/push/config'),{DB:{prepare:()=>({first:async()=>null})},VAPID_PUBLIC_KEY:'pub'});
  const body=await res.json();
  assert.equal(body.ready,false);
  assert.deepEqual(body.missing,['VAPID_PRIVATE_JWK']);
  const ok=await mod.fetchHandler(new Request('https://x.workers.dev/api/push/config'),{DB:{prepare:()=>({first:async()=>null})},VAPID_PUBLIC_KEY:'pub',VAPID_PRIVATE_JWK:'{}'});
  assert.equal((await ok.json()).ready,true);
});

test('device registration is capped so unauthenticated clients cannot fill the database',async()=>{
  const {MAX_DEVICES}=await import('../worker/index.js');
  assert.ok(MAX_DEVICES>0&&MAX_DEVICES<=100);
});
test('index.html ships a strict CSP that only allows the push server for connections',async()=>{
  const {readFile}=await import('node:fs/promises');
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  const csp=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1]||'';
  assert.match(csp,/script-src 'self'(;|$)/);assert.doesNotMatch(csp,/unsafe-eval|script-src[^;]*unsafe-inline/);
  assert.match(csp,/connect-src 'self' https:\/\/howmuchspend\.[a-z0-9-]+\.workers\.dev/);assert.match(csp,/object-src 'none'/);
});
