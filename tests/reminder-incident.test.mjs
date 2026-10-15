import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {dispatch,dueReminders,fetchHandler} from '../worker/index.js';
import {b64} from '../worker/webpush.js';
const date='2026-10-15',at=t=>Date.parse(date+'T'+t+'+03:00');
const entry={id:'synthetic',type:'expense',title:'Synthetic',amountCents:100,currency:'TRY',category:'other',bank:'',notes:'',startDate:date,recurrence:'none',count:null,endDate:null,paidDates:[],skips:[],overrides:{}};
const rules={schemaVersion:1,updatedAt:null,entries:[entry]};
async function fixture({entries=rules.entries,enabled=1}={}){
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../drizzle/0000_push.sql',import.meta.url),'utf8'));
 let afterClaim=null;
 const DB={prepare(query){let values=[];return {bind(...v){values=v;return this},async first(){return sql.prepare(query).get(...values)||null},async all(){return {results:sql.prepare(query).all(...values)}},async run(){const changes=Number(sql.prepare(query).run(...values).changes);if(query.startsWith('INSERT INTO push_deliveries')&&changes&&afterClaim){const f=afterClaim;afterClaim=null;f();}return {meta:{changes}}}}}};
 const vapid=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const receiver=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const subscription={endpoint:'https://web.push.apple.com/synthetic',keys:{p256dh:b64(await crypto.subtle.exportKey('raw',receiver.publicKey)),auth:b64(crypto.getRandomValues(new Uint8Array(16)))}};
 sql.prepare('INSERT INTO push_devices (id,subscription,rules,lead_days,details,enabled,updated_at) VALUES (?,?,?,?,?,?,?)').run('synthetic-device',JSON.stringify(subscription),JSON.stringify({...rules,entries}),0,0,enabled,at('07:00:00'));
 const env={DB,VAPID_PRIVATE_JWK:JSON.stringify(await crypto.subtle.exportKey('jwk',vapid.privateKey)),VAPID_PUBLIC_KEY:b64(await crypto.subtle.exportKey('raw',vapid.publicKey)),VAPID_SUBJECT:'https://synthetic.test',SITES_PRIVATE_SCHEDULER:'1'};
 return {env,sql,afterClaim(f){afterClaim=f},paid(){sql.prepare('UPDATE push_devices SET rules=?').run(JSON.stringify({...rules,entries:entries.map(e=>({...e,paidDates:[date]}))}))}};
}
async function provider(code,fn){const original=globalThis.fetch;let calls=0;globalThis.fetch=async(_url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response(null,{status:code})};try{return await fn(()=>calls)}finally{globalThis.fetch=original}}
const payload=(entries=rules.entries)=>({...rules,entries});
test('Exact boundaries: never early; each due window closes at 2 hours',()=>{
 for(const [time,slot] of [['08:29:59.999',null],['08:30:00','08:30'],['10:29:59.999','08:30'],['10:30:00',null],['11:59:59.999',null],['12:00:00','12:00'],['13:59:59.999','12:00'],['14:00:00',null],['16:59:59.999',null],['17:00:00','17:00'],['18:59:59.999','17:00'],['19:00:00',null]])assert.equal(dueReminders(rules,0,at(time))[0]?.slot??null,slot,time);
});
test('Reproduce 08:28:35.782: successful HTTP with zero pushes still advances heartbeat',async()=>{
 const f=await fixture(),oldNow=Date.now;Date.now=()=>at('08:28:35.782');
 try{await provider(201,async calls=>{const r=await fetchHandler(new Request('https://synthetic.test/api/push/private-dispatch',{method:'POST'}),f.env);assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,sent:0,failed:0});assert.equal(calls(),0);assert.equal(Number(f.sql.prepare("SELECT value FROM push_state WHERE key='last_dispatch'").get().value),Date.now());assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM push_deliveries').get().n,0)})}finally{Date.now=oldNow;f.sql.close()}
});
test('Early noon/evening calls also return success without scheduling a later push',async()=>{
 for(const time of ['11:58:00','16:58:00']){const f=await fixture();try{await provider(201,async calls=>{assert.deepEqual(await dispatch(f.env,at(time)),{ok:true,sent:0,failed:0});assert.equal(calls(),0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM push_deliveries').get().n,0)})}finally{f.sql.close()}}
});
test('A post-slot retry sends once; same-slot duplicate sends nothing',async()=>{
 const f=await fixture();try{await provider(201,async calls=>{assert.equal((await dispatch(f.env,at('08:28:35.782'))).sent,0);assert.equal((await dispatch(f.env,at('08:30:00'))).sent,1);assert.equal((await dispatch(f.env,at('08:31:00'))).sent,0);assert.equal(calls(),1)})}finally{f.sql.close()}
});
test('Both income and expense have three independent deliveries and no replay next day',async()=>{
 const f=await fixture({entries:[entry,{...entry,id:'synthetic-income',type:'income',category:'otherincome'}]});try{await provider(201,async calls=>{for(const time of ['08:30:00','12:00:00','17:00:00'])assert.equal((await dispatch(f.env,at(time))).sent,2);assert.equal(calls(),6);assert.equal((await dispatch(f.env,Date.parse('2026-10-16T08:30:00+03:00'))).sent,0)})}finally{f.sql.close()}
});
test('Missing noon invocation creates no noon delivery; evening never replays missed noon',async()=>{
 const f=await fixture();try{await provider(201,async calls=>{await dispatch(f.env,at('08:28:35.782'));await dispatch(f.env,at('17:00:10.679'));const rows=f.sql.prepare('SELECT occurrence_key FROM push_deliveries').all();assert.equal(rows.length,1);assert.ok(rows[0].occurrence_key.endsWith('#17:00'));assert.equal(calls(),1)})}finally{f.sql.close()}
});
test('Payment after morning cancels noon/evening and does not touch old sent delivery',async()=>{
 const f=await fixture();try{await provider(201,async calls=>{assert.equal((await dispatch(f.env,at('08:30:00'))).sent,1);f.paid();assert.equal((await dispatch(f.env,at('12:00:00'))).sent,0);assert.equal((await dispatch(f.env,at('17:00:00'))).sent,0);assert.equal(calls(),1);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM push_deliveries WHERE state='sent'").get().n,1)})}finally{f.sql.close()}
});
test('Payment between lease and actual send cancels the claimed reminder',async()=>{
 const f=await fixture();f.afterClaim(()=>f.paid());try{await provider(201,async calls=>{assert.equal((await dispatch(f.env,at('12:00:00'))).sent,0);assert.equal(calls(),0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM push_deliveries').get().n,0)})}finally{f.sql.close()}
});
test('Concurrent checks share one atomic lease, preventing duplicate delivery',async()=>{
 const f=await fixture();try{await provider(201,async calls=>{const results=await Promise.all([dispatch(f.env,at('12:00:00')),dispatch(f.env,at('12:00:00'))]);assert.equal(results.reduce((n,x)=>n+x.sent,0),1);assert.equal(calls(),1)})}finally{f.sql.close()}
});
test('Disabled subscriptions and skipped records never reach the provider',async()=>{
 for(const opts of [{enabled:0},{entries:[{...entry,skips:[date]}]},{entries:[{...entry,paidDates:[date]}]}]){const f=await fixture(opts);try{await provider(201,async calls=>{assert.equal((await dispatch(f.env,at('12:00:00'))).sent,0);assert.equal(calls(),0)})}finally{f.sql.close()}}
});
test('Apple rejection is a real failure, not success; a later successful retry deduplicates',async()=>{
 const f=await fixture();try{await provider(503,async()=>assert.deepEqual(await dispatch(f.env,at('12:00:00')),{ok:false,sent:0,failed:1}));await provider(201,async calls=>{assert.equal((await dispatch(f.env,at('12:01:00'))).sent,0);assert.equal((await dispatch(f.env,at('12:06:00'))).sent,1);assert.equal((await dispatch(f.env,at('12:07:00'))).sent,0);assert.equal(calls(),1)})}finally{f.sql.close()}
});
test('Expired Apple subscription is disabled and never retried in later slots',async()=>{
 const f=await fixture();try{await provider(410,async calls=>{assert.equal((await dispatch(f.env,at('12:00:00'))).failed,1);assert.equal((await dispatch(f.env,at('17:00:00'))).sent,0);assert.equal(calls(),1);assert.equal(f.sql.prepare('SELECT enabled FROM push_devices').get().enabled,0)})}finally{f.sql.close()}
});
test('Single healthy heartbeat falsely reports scheduler ready despite missing noon dispatch',async()=>{
 const f=await fixture(),oldNow=Date.now;Date.now=()=>at('12:05:00');try{f.sql.prepare("INSERT INTO push_state VALUES ('last_dispatch',?)").run(String(at('08:28:35.782')));const r=await fetchHandler(new Request('https://synthetic.test/api/push/config'),f.env);assert.equal((await r.json()).schedulerReady,true);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM push_deliveries').get().n,0)}finally{Date.now=oldNow;f.sql.close()}
});
