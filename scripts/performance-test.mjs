// Controlled local comparison; no network, user records, or real push deliveries.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
const baseline=path.resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('Pass an untouched baseline directory');
const candidate=process.cwd();
const modules=await Promise.all([baseline,candidate].map(async root=>({worker:(await import(pathToFileURL(path.join(root,'worker/index.js')))).default,model:await import(pathToFileURL(path.join(root,'public/model.js')))})));
async function fixture(root){let source=await fs.readFile(path.join(root,'tests/app-ui.test.mjs'),'utf8');source=source.slice(0,source.indexOf("test('"));source=source.replace(/from '(\.\.[^']+)'/g,(_,relative)=>'from '+JSON.stringify(pathToFileURL(path.resolve(root,'tests',relative)).href));source=source.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(path.join(root,'tests/perf-fixture.mjs')).href));return (await import('data:text/javascript;base64,'+Buffer.from(source+'\nexport {fixture};').toString('base64'))).fixture}
const fixtures=await Promise.all([baseline,candidate].map(fixture));
const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
const subscription={endpoint:'https://web.push.apple.com/synthetic-test',keys:{p256dh:Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('base64url'),auth:Buffer.alloc(16,1).toString('base64url')}};
const env={VAPID_PRIVATE_JWK:'{}',VAPID_PUBLIC_KEY:'synthetic',VAPID_SUBJECT:'https://test.local',DB:{prepare(){return {bind(){return this},async run(){return {meta:{changes:1}}},async first(){return {enabled:1,updated_at:1,value:String(Date.now())}}}}}};
const body=JSON.stringify({subscription,rules:{schemaVersion:1,entries:[],updatedAt:null},leadDays:0,details:false});
const heads={Origin:'https://test.local',Authorization:'Bearer '+'a'.repeat(64),'Content-Type':'application/json'};
const rules=modules[0].model.demoData('2026-10');const e=rules.entries[0];rules.entries=Array.from({length:1000},(_,i)=>({...e,id:'synthetic-'+i}));
const jobs=[
 {name:'API config',count:1000,run:async i=>{const r=await modules[i].worker.fetch(new Request('https://test.local/api/push/config'),{});await r.text()}},
 {name:'Reminder sync PUT',count:250,run:async i=>{const r=await modules[i].worker.fetch(new Request('https://test.local/api/push/device',{method:'PUT',headers:heads,body}),env);if(r.status!==200)throw Error('Sync failed');await r.text()}},
 {name:'1000 recurring calendar entries',count:250,run:i=>modules[i].model.occurrences(rules,'2026-10-01','2026-10-31')},
 {name:'App opening with mocked DOM',count:50,run:i=>fixtures[i]()}
];
const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
const results=[];
for(const job of jobs){for(let i=0;i<2;i++)for(let n=0;n<30;n++)await job.run(i);const samples=[[],[]];for(let round=0;round<9;round++)for(const i of round%2?[1,0]:[0,1]){const start=performance.now();for(let n=0;n<job.count;n++)await job.run(i);samples[i].push((performance.now()-start)/job.count)}const old=median(samples[0]),next=median(samples[1]),delta=next-old;const allowed=Math.max(.2,old*.15);results.push({name:job.name,iterationsPerBatch:job.count,batches:9,baselineMedianMs:+old.toFixed(4),candidateMedianMs:+next.toFixed(4),deltaMs:+delta.toFixed(4),deltaPercent:+(delta/old*100).toFixed(2),guardrailMs:+allowed.toFixed(4),passed:delta<=allowed});}
console.log(JSON.stringify({environment:'Node local, synthetic data, no network; not iPhone end-to-end timing',method:'30 warmups; 9 alternating batches; median batch mean',results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
