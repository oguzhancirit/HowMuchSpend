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
