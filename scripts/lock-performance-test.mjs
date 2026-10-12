// Synthetic D1 transport latency and packaged-Worker benchmark. No live user data.
import fs from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {performance} from 'node:perf_hooks';
import {gzipSync} from 'node:zlib';
const roots=[path.resolve(process.argv[2]||''),process.cwd()];
if(!process.argv[2])throw Error('Provide the untouched baseline checkout, with dist built');
const bundles=await Promise.all(roots.map(root=>fs.readFile(path.join(root,'dist/server/index.js'),'utf8')));
const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('a'.repeat(64)))).toString('hex');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function sample(i,n){
 const startImport=performance.now();const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(bundles[i]+'\n// isolated lock sample '+n).toString('base64'));
 const importMs=performance.now()-startImport,sql=new DatabaseSync(':memory:');
 sql.exec(await fs.readFile(path.join(roots[i],'drizzle/0001_app_lock.sql'),'utf8'));
 sql.prepare('INSERT INTO app_lock_devices (id,user_id,credential,recovery_hash,origin,updated_at) VALUES (?,?,?,?,?,?)').run(hash,'synthetic',JSON.stringify({id:'AQ',publicKey:'AQ',counter:0,transports:['internal']}),'synthetic','https://perf.test',0);
 let rpc=0;
 const DB={prepare(query){let args=[];return {bind(...a){args=a;return this},async first(){rpc++;await delay(25);return sql.prepare(query).get(...args)||null},runSync(){return {meta:{changes:sql.prepare(query).run(...args).changes}}},async run(){rpc++;await delay(25);return this.runSync()}}},async batch(statements){rpc++;await delay(25);return statements.map(s=>s.runSync())}};
 const start=performance.now();const r=await worker.fetch(new Request('https://perf.test/api/app-lock/options',{method:'POST',headers:{Origin:'https://perf.test','Content-Type':'application/json',Authorization:'Bearer '+'a'.repeat(64),'oai-authenticated-user-id':'synthetic'},body:JSON.stringify({purpose:'unlock'})}),{DB});
 const data=await r.json();if(r.status!==200||data.options.userVerification!=='required'||Buffer.from(data.options.challenge,'base64url').length!==32)throw Error('Invalid secure options');
 const result={requestMs:performance.now()-start,importMs,rpc};sql.close();return result;
}
const samples=[[],[]];for(let n=0;n<9;n++)for(const i of n%2?[1,0]:[0,1])samples[i].push(await sample(i,n));
const median=arr=>[...arr].sort((a,b)=>a-b)[4];
async function prefix(root){const html=await fs.readFile(path.join(root,'public/index.html'),'utf8');const urls=[...html.matchAll(/<link[^>]+(?:modulepreload|stylesheet)[^>]+href="\.\/([^"?]+)[^"]*"/g)].map(m=>m[1]);urls.push('boot.js','app-lock.js','update.js');const files=[...new Set(urls)],contents=await Promise.all(files.map(f=>fs.readFile(path.join(root,'public',f))));return {files:files.length,rawBytes:contents.reduce((n,b)=>n+b.length,0),gzipBytes:contents.reduce((n,b)=>n+gzipSync(b).length,0)}}
const result={scope:'Synthetic packaged-Worker first /options request, nine alternating fresh modules, fixed 25 ms per D1 RPC; excludes network, Sites auth, iPhone and Apple sheet',baseline:{requestMedianMs:median(samples[0].map(s=>s.requestMs)),moduleImportMedianMs:median(samples[0].map(s=>s.importMs)),d1RpcCount:samples[0][0].rpc,promptPrefix:await prefix(roots[0])},candidate:{requestMedianMs:median(samples[1].map(s=>s.requestMs)),moduleImportMedianMs:median(samples[1].map(s=>s.importMs)),d1RpcCount:samples[1][0].rpc,promptPrefix:await prefix(roots[1])}};
console.log(JSON.stringify(result,null,2));if(result.candidate.d1RpcCount!==2||result.candidate.requestMedianMs>=result.baseline.requestMedianMs)process.exitCode=1;
