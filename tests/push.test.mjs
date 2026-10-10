import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {encryptPayload,b64,unb64,vapidAuthorization,validateSubscription,verifySchedulerJWT,hash} from '../worker/webpush.js';
import {fetchHandler,dueReminders,dispatch} from '../worker/index.js';
import {reminderRules} from '../public/notifications.js';
import {dayStatus} from '../public/calendar-status.js';
const entry={id:'card',type:'expense',title:'Akbank',amountCents:45900000,currency:'TRY',category:'card',bank:'akbank',notes:'SECRET NOTE',startDate:'2026-01-31',recurrence:'monthly',count:null,endDate:null,paidDates:['2026-01-31'],skips:[],overrides:{}};
const rules={schemaVersion:1,entries:[entry],updatedAt:null};
function db(){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../drizzle/0000_push.sql',import.meta.url),'utf8'));return {sql,prepare(query){let params=[];return {bind(...p){params=p;return this},async first(){return sql.prepare(query).get(...params)||null},async all(){return {results:sql.prepare(query).all(...params)}},async run(){return {meta:{changes:Number(sql.prepare(query).run(...params).changes)}}}}},async batch(statements){sql.exec('BEGIN');try{const r=[];for(const statement of statements)r.push(await statement.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};}
async function fixture(){const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const recipient=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);return {env:{DB:db(),VAPID_PRIVATE_JWK:JSON.stringify(await crypto.subtle.exportKey('jwk',pair.privateKey)),VAPID_PUBLIC_KEY:b64(await crypto.subtle.exportKey('raw',pair.publicKey)),VAPID_SUBJECT:'https://test.local'},pair,subscription:{endpoint:'https://web.push.apple.com/test',keys:{p256dh:b64(await crypto.subtle.exportKey('raw',recipient.publicKey)),auth:b64(crypto.getRandomValues(new Uint8Array(16)))}}};}
test('Calendar differentiates empty, paid, pending and mixed days',()=>{assert.equal(dayStatus([]).className,'');assert.equal(dayStatus([{paid:true}]).className,'status-paid');assert.equal(dayStatus([{paid:false}]).className,'status-pending');assert.match(dayStatus([{paid:true},{paid:false}]).className,/status-mixed/);});
test('Reminder projection never uploads notes and hides amounts/title by default without mutating ledger',()=>{const before=JSON.stringify(rules),minimal=reminderRules(rules),details=reminderRules(rules,true);assert.equal(minimal.entries[0].title,'Ödeme');assert.equal(minimal.entries[0].amountCents,1);assert.equal(minimal.entries[0].notes,'');assert.equal(details.entries[0].amountCents,45900000);assert.equal(details.entries[0].notes,'');assert.equal(JSON.stringify(rules),before);});
test('Payment-day slots use Istanbul time, ignore legacy lead days, and skip paid/skipped dates',()=>{
  const at=Date.parse('2026-02-28T08:30:00+03:00');
  assert.equal(dueReminders(rules,1,at-1).length,0);
  const morning=dueReminders(rules,7,at)[0];assert.equal(morning.date,'2026-02-28');assert.equal(morning.slot,'08:30');
  const noon=dueReminders(rules,0,Date.parse('2026-02-28T12:00:00+03:00'))[0];assert.equal(noon.slot,'12:00');assert.notEqual(noon.deliveryKey,morning.deliveryKey);
  assert.equal(dueReminders(rules,0,Date.parse('2026-02-28T17:00:00+03:00'))[0].slot,'17:00');
  assert.equal(dueReminders(rules,0,Date.parse('2026-02-28T23:00:00+03:00')).length,0);
  assert.equal(dueReminders(rules,0,Date.parse('2026-03-01T08:30:00+03:00')).length,0);
  assert.equal(dueReminders({...rules,entries:[{...entry,paidDates:['2026-02-28']}]},0,at).length,0);
  assert.equal(dueReminders({...rules,entries:[{...entry,skips:['2026-02-28']}]},0,at).length,0);
  assert.equal(dueReminders({...rules,entries:[{...entry,endDate:'2026-01-31'}]},0,at).length,0);
  assert.equal(dueReminders(rules,0,Date.parse('2030-03-31T08:30:00+03:00'))[0].date,'2030-03-31');
});
test('Encryption exactly matches RFC 8291 section 5 test vector',async()=>{
  const receiver='BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
  const sender='BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
  const raw=unb64(sender),privateKey=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:b64(raw.slice(1,33)),y:b64(raw.slice(33)),d:'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'},{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
  const publicKey=await crypto.subtle.importKey('raw',raw,{name:'ECDH',namedCurve:'P-256'},true,[]);
  const expected='DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN';
  const actual=await encryptPayload('When I grow up, I want to be a watermelon',{p256dh:receiver,auth:'BTBZMqHH6r4Tts7J_aSIgg'},{salt:unb64(expected).slice(0,16),keyPair:{privateKey,publicKey}});assert.equal(b64(actual),expected);
});
test('VAPID JWT is signed, audience-bound and has required public key',async()=>{const {env,pair}=await fixture();const auth=await vapidAuthorization('https://web.push.apple.com/test',env),token=auth.match(/t=([^,]+)/)[1],parts=token.split('.');assert.equal(JSON.parse(Buffer.from(parts[1],'base64url')).aud,'https://web.push.apple.com');assert.ok(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pair.publicKey,unb64(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])));assert.match(auth,/, k=/);});
test('Subscription validation blocks SSRF and malformed curve points',async()=>{const {subscription}=await fixture();assert.deepEqual(await validateSubscription(subscription),subscription);for(const endpoint of ['http://web.push.apple.com/a','https://localhost/a','https://web.push.apple.com.evil.test/a','https://web.push.apple.com:444/a','https://u:p@web.push.apple.com/a'])await assert.rejects(validateSubscription({...subscription,endpoint}));await assert.rejects(validateSubscription({...subscription,keys:{...subscription.keys,p256dh:'AA'}}));});
test('Device APIs require capability and same-origin writes, preserve isolation, and remove queued data on disable',async()=>{
  const {env,subscription}=await fixture(),token='a'.repeat(64),other='b'.repeat(64),url='https://test.local/api/push/device';
  const req=(method,body,capability=token,origin='https://test.local')=>new Request(url,{method,headers:{Authorization:'Bearer '+capability,Origin:origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await fetchHandler(req('PUT',{subscription,rules,leadDays:1,details:false},token,'https://evil.test'),env)).status,403);
  assert.equal((await fetchHandler(new Request(url),env)).status,401);
  assert.equal((await fetchHandler(req('PUT',{subscription,rules,leadDays:1,details:false}),env)).status,200);
  assert.equal((await(await fetchHandler(req('GET',null,other),env)).json()).exists,false);
  const stored=env.DB.sql.prepare('SELECT rules FROM push_devices').get();assert.doesNotMatch(stored.rules,/SECRET NOTE|45900000|Akbank/);
  assert.equal((await fetchHandler(new Request('https://test.local/api/push/dispatch',{method:'POST'}),env)).status,401);
  assert.equal((await fetchHandler(req('DELETE'),env)).status,200);assert.equal(env.DB.sql.prepare('SELECT COUNT(*) n FROM push_devices').get().n,0);
});
test('Dispatcher deduplicates, retries transient failure and retires expired subscriptions',async()=>{
  const {env,subscription}=await fixture(),token='c'.repeat(64),id=await hash(token),now=Date.parse('2026-02-28T08:30:00+03:00');
  const add=()=>env.DB.prepare('INSERT INTO push_devices (id,subscription,rules,lead_days,details,enabled,updated_at) VALUES (?,?,?,?,?,1,?)').bind(id,JSON.stringify(subscription),JSON.stringify(rules),1,0,now).run();await add();
  const original=globalThis.fetch;let calls=0,code=503;globalThis.fetch=async()=>{calls++;return new Response('',{status:code});};
  try{assert.equal((await dispatch(env,now)).failed,1);assert.equal((await dispatch(env,now+60000)).sent,0);code=201;assert.equal((await dispatch(env,now+360000)).sent,1);assert.equal((await dispatch(env,now+720000)).sent,0);assert.equal(calls,2);
    env.DB.sql.exec('DELETE FROM push_deliveries');code=410;assert.equal((await dispatch(env,now+1080000)).failed,1);assert.equal(env.DB.sql.prepare('SELECT enabled FROM push_devices').get().enabled,0);
  }finally{globalThis.fetch=original;}
});
test('Scheduler OIDC requires signed token from exact repository, workflow, main branch and audience',async()=>{
  const rsa=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk={...await crypto.subtle.exportKey('jwk',rsa.publicKey),kid:'test-key',use:'sig'},now=Date.now(),s=Math.floor(now/1000),env={SCHEDULER_REPOSITORY:'oguzhancirit/HowMuchSpend',SCHEDULER_REPOSITORY_ID:'1413038488'};
  const claims={iss:'https://token.actions.githubusercontent.com',aud:'https://test.local',exp:s+300,nbf:s-1,iat:s,repository:env.SCHEDULER_REPOSITORY,repository_id:env.SCHEDULER_REPOSITORY_ID,ref:'refs/heads/main',workflow_ref:env.SCHEDULER_REPOSITORY+'/.github/workflows/payment-reminders.yml@refs/heads/main',event_name:'schedule'};
  async function jwt(changes={}){const input=b64(new TextEncoder().encode(JSON.stringify({alg:'RS256',kid:'test-key'})))+'.'+b64(new TextEncoder().encode(JSON.stringify({...claims,...changes})));return input+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',rsa.privateKey,new TextEncoder().encode(input)));}
  const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({keys:[jwk]});try{assert.equal(await verifySchedulerJWT(await jwt(),'https://test.local',env,now),true);for(const change of [{aud:'https://evil.test'},{repository:'attacker/HowMuchSpend'},{repository_id:'111'},{ref:'refs/pull/1/merge'},{workflow_ref:'wrong'},{exp:s-1},{event_name:'pull_request'}])assert.equal(await verifySchedulerJWT(await jwt(change),'https://test.local',env,now),false);assert.equal(await verifySchedulerJWT((await jwt()).slice(0,-10)+'abcdefghij','https://test.local',env,now),false);}finally{globalThis.fetch=original;}
});
test('Private updater is off by default, rejects cross-origin, and records sanitized provider failure',async()=>{
  const {env,subscription}=await fixture(),id=await hash('d'.repeat(64));
  await env.DB.prepare('INSERT INTO push_devices (id,subscription,rules,lead_days,details,enabled,updated_at) VALUES (?,?,?,?,?,1,?)').bind(id,JSON.stringify(subscription),JSON.stringify(rules),1,0,Date.now()).run();
  const request=(path,origin)=>new Request('https://test.local/api/push/'+path,{method:'POST',headers:origin?{Origin:origin}:{}});
  assert.equal((await fetchHandler(request('private-dispatch'),env)).status,403);
  env.SITES_PRIVATE_SCHEDULER='1';assert.equal((await fetchHandler(request('private-dispatch','https://evil.test'),env)).status,403);
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async(url,options)=>{assert.equal(options.redirect,'manual');calls++;return Response.json({reason:'BadJwtToken',secret:'DO_NOT_STORE'},{status:403})};
  try{
    assert.equal((await fetchHandler(request('private-test'),env)).status,502);
    const stored=env.DB.sql.prepare("SELECT value FROM push_state WHERE key='last_test_result'").get().value;
    assert.equal(JSON.parse(stored).reason,'BadJwtToken');assert.doesNotMatch(stored,/DO_NOT_STORE|web.push.apple.com|p256dh/);
    assert.equal((await fetchHandler(request('private-test'),env)).status,502);assert.equal(calls,1);
    env.DB.sql.exec('UPDATE push_devices SET last_test_at=0');globalThis.fetch=async()=>new Response(null,{status:201});
    assert.equal((await fetchHandler(request('private-test'),env)).status,200);
    assert.equal(JSON.parse(env.DB.sql.prepare("SELECT value FROM push_state WHERE key='last_test_result'").get().value).ok,true);
  }finally{globalThis.fetch=original;}
});

test('Each payment has three independent slots; synced completion cancels later slots and legacy clients use payment day',async()=>{
  const {env,subscription}=await fixture(),id=await hash('e'.repeat(64));
  const register=async(currentRules)=>fetchHandler(new Request('https://test.local/api/push/device',{method:'PUT',headers:{Authorization:'Bearer '+'e'.repeat(64),Origin:'https://test.local','Content-Type':'application/json'},body:JSON.stringify({subscription,rules:currentRules,leadDays:7,details:false})}),env);
  await register(rules);assert.equal(env.DB.sql.prepare('SELECT lead_days FROM push_devices').get().lead_days,0);
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response(null,{status:201})};
  const morning=Date.parse('2026-02-28T08:30:00+03:00'),noon=Date.parse('2026-02-28T12:00:00+03:00'),evening=Date.parse('2026-02-28T17:00:00+03:00');
  try{
    assert.equal((await dispatch(env,morning)).sent,1);assert.equal((await dispatch(env,morning+60000)).sent,0);
    assert.equal((await dispatch(env,noon)).sent,1);assert.equal((await dispatch(env,evening)).sent,1);assert.equal(calls,3);
    env.DB.sql.exec('DELETE FROM push_deliveries');calls=0;
    assert.equal((await dispatch(env,morning)).sent,1);
    await register({...rules,entries:[{...entry,paidDates:['2026-02-28']}]});
    assert.equal((await dispatch(env,noon)).sent,0);assert.equal((await dispatch(env,evening)).sent,0);assert.equal(calls,1);
  }finally{globalThis.fetch=original;}
});
