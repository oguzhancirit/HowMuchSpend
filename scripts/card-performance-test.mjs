import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
async function harness(root){
  let text=await fs.readFile(path.join(root,'tests/payments-ui.test.mjs'),'utf8');
  text=text.slice(0,text.indexOf("test('"));
  text=text.replace(/from '(\.\.[^']+)'/g,(_,p)=>'from '+JSON.stringify(pathToFileURL(path.resolve(root,'tests',p)).href));
  text=text.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(path.join(root,'tests/card-perf.mjs')).href));
  return (await import('data:text/javascript;base64,'+Buffer.from(text+'\nexport {fixture};').toString('base64'))).fixture;
}
const roots=process.argv.slice(2),factories=await Promise.all(roots.map(harness)),cases=[];
for(const count of [1,1000]){
  const fixtures=factories.map(factory=>{const f=factory(),seed=f.data.entries[0];f.data.entries=Array.from({length:count},(_,i)=>({...seed,id:'synthetic-'+i,title:'Sentetik kart ödemesi '+i,amountCents:2000,paidDates:i%2?[]:seed.paidDates}));f.add();f.click('statement');f.submit('payment-month-form',{openingMode:'manual',opening:'50.000',spend:'10.000',cost:'1.000',paidMode:'calendar'});return f;});
  for(const f of fixtures)for(let i=0;i<30;i++)f.page();
  const samples=[[],[]],iterations=30;
  for(let round=0;round<9;round++)for(const index of round%2?[1,0]:[0,1]){const start=performance.now();for(let i=0;i<iterations;i++)fixtures[index].page();samples[index].push((performance.now()-start)/iterations);}
  const median=x=>x.sort((a,b)=>a-b)[4],before=median(samples[0]),after=median(samples[1]),limit=Math.max(.2,before*.15);
  cases.push({name:'Card detail HTML, '+count+' synthetic series',iterationsPerBatch:iterations,batches:9,baselineMedianMs:+before.toFixed(4),candidateMedianMs:+after.toFixed(4),deltaMs:+(after-before).toFixed(4),guardrailMs:+limit.toFixed(4),passed:after-before<=limit});
}
console.log(JSON.stringify({environment:'Node, synthetic data, HTML generation only; excludes Safari DOM/layout/network',method:'30 warmups, nine alternating batches, median batch mean',results:cases},null,2));
if(cases.some(c=>!c.passed))process.exitCode=1;
