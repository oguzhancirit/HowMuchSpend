import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {validateSubscription} from '../worker/webpush.js';
const env={DB:{prepare(){throw Error('Unexpected database access')}},VAPID_PRIVATE_JWK:'{}',VAPID_PUBLIC_KEY:'test',VAPID_SUBJECT:'https://test.local'};
const headers={Origin:'https://test.local',Authorization:'Bearer '+'a'.repeat(64),'Content-Type':'application/json'};
const url='https://test.local/api/push/device';
test('SEC-01: oversized stream is rejected before fully consuming the body',async()=>{
 let reads=0,cancelled=false;
 const stream=new ReadableStream({pull(c){reads++;if(reads<=40)c.enqueue(new Uint8Array(128*1024).fill(32));else c.close()},cancel(){cancelled=true}});
 const r=await worker.fetch(new Request(url,{method:'PUT',headers,body:stream,duplex:'half'}),env);
 assert.equal(r.status,413);assert.ok(reads<40);assert.equal(cancelled,true);
});
test('SEC-01: actual UTF-8 bytes and JSON content type are checked',async()=>{
 const r=await worker.fetch(new Request(url,{method:'PUT',headers,body:'"'+'€'.repeat(800000)+'"'}),env);assert.equal(r.status,413);
 const wrong=await worker.fetch(new Request(url,{method:'PUT',headers:{...headers,'Content-Type':'text/plain'},body:'{}'}),env);assert.equal(wrong.status,415);
});
test('SEC-02: huge crypto key is rejected before Base64 decoding',async()=>{
 const original=globalThis.atob;let calls=0;globalThis.atob=(value)=>{calls++;return original(value)};
 try{await assert.rejects(validateSubscription({endpoint:'https://web.push.apple.com/test',keys:{p256dh:'A'.repeat(1024*1024),auth:'AA'}}),/anahtar/);assert.equal(calls,0)}finally{globalThis.atob=original}
});
test('SEC-03: app shell, errors and API responses carry browser security headers',async()=>{
 globalThis.__HMS_ASSETS={'/index.html':{type:'text/html',body:Buffer.from('<h1>Fixture</h1>').toString('base64url')}};
 try{for(const path of ['/','/missing','/api/push/device']){const r=await worker.fetch(new Request('https://test.local'+path),env);assert.equal(r.headers.get('X-Frame-Options'),'DENY');assert.match(r.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);assert.equal(r.headers.get('Referrer-Policy'),'no-referrer');assert.match(r.headers.get('Strict-Transport-Security'),/max-age=/)}}finally{delete globalThis.__HMS_ASSETS}
});
test('Cross-origin writes, forged capabilities, SQL-looking tokens and unsupported push hosts fail closed',async()=>{
 for(const token of ['',"' OR 1=1 --",'a'.repeat(63)]){const r=await worker.fetch(new Request(url,{headers:{Authorization:'Bearer '+token}}),env);assert.equal(r.status,401)}
 const cross=await worker.fetch(new Request(url,{method:'DELETE',headers:{...headers,Origin:'https://evil.test'}}),env);assert.equal(cross.status,403);
 for(const endpoint of ['https://127.0.0.1/','https://169.254.169.254/','https://web.push.apple.com.evil.test/','https://web.push.apple.com@evil.test/','http://web.push.apple.com/'])await assert.rejects(validateSubscription({endpoint,keys:{p256dh:'AA',auth:'AA'}}));
});
test('Declared oversized bodies and malformed JSON are safely rejected without database writes',async()=>{
 const large=await worker.fetch(new Request(url,{method:'PUT',headers:{...headers,'Content-Length':String(3*1024*1024)},body:'{}'}),env);assert.equal(large.status,413);
 for(const body of ['{broken','null','[]','"string"']){const r=await worker.fetch(new Request(url,{method:'PUT',headers,body}),env);assert.equal(r.status,400);assert.deepEqual(await r.json(),{error:'Geçersiz JSON.'})}
});
