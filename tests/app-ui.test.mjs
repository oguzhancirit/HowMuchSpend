import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as Model from '../public/model.js';
import * as Recovery from '../public/recovery-model.js';
import {dayStatus} from '../public/calendar-status.js';
import {createMotionController} from '../public/motion.js';

const read=name=>fs.readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const source=read('notifications.js').replace(/^export /gm,'')+'\nconst createRecoveryController=(()=>{'+read('recovery.js').replace(/^import .*\n/gm,'').replace(/^export /gm,'')+';return createRecoveryController;})();\n'+read('app.js').replace(/^import .*\n/gm,'');
function fixture(){
  const nodes=new Map(),listeners={};
  const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:'',innerHTML:'',textContent:'',hidden:false,checked:false,open:false,dataset:{},content:'',classList:{add(){},remove(){},toggle(){}},setAttribute(){},addEventListener(){},reset(){},showModal(){this.open=true;},close(){this.open=false;},focus(){},querySelectorAll:()=>[]});return nodes.get(selector);};
  const entry=(id,type,currency,amount,title,category)=>({id,type,currency,amountCents:amount,title,category,bank:category==='card'?'akbank':'',notes:'',startDate:'2026-01-31',recurrence:'monthly',count:null,endDate:null,paidDates:id==='card'?['2026-01-31']:[],skips:[],overrides:{}});
  const ledger={schemaVersion:1,updatedAt:null,entries:[entry('card','expense','TRY',45900000,'Akbank eski kayıt','card'),entry('salary','income','TRY',10000000,'Maaş','salary'),entry('euro','income','EUR',100000,'Euro gelir','salary')]};
  const storage=new Map([['howmuchspend.data.v1',JSON.stringify(ledger)]]),original=storage.get('howmuchspend.data.v1');
  const context=vm.createContext({...Model,...Recovery,dayStatus,createMotionController,URL,location:{hostname:'howmuchspend.ozicirit9.chatgpt.site',href:'https://howmuchspend.ozicirit9.chatgpt.site'},document:{querySelector:node,querySelectorAll:()=>[],getElementById:id=>nodes.get('#'+id),documentElement:{dataset:{}},addEventListener:(event,fn)=>(listeners[event]??=[]).push(fn)},window:{innerWidth:428,addEventListener(){},scrollTo(){}},navigator:{},Intl,Date,console,crypto:globalThis.crypto,structuredClone,setTimeout:()=>1,clearTimeout(){},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}});
  vm.runInContext(source,context);
  const run=code=>vm.runInContext(code,context);
  const click=dataset=>{const button={dataset,hasAttribute:()=>false};for(const fn of listeners.click||[])fn({target:{closest:selector=>selector==='button,a'?button:null}});};
  return {node,storage,original,run,click,listeners};
}
test('Calendar retains both daily amounts, bank art, summaries, paid history and central + across currencies',()=>{
  const f=fixture();f.run("month='2026-10';selected='2026-10-31';render()");const html=f.node('#main').innerHTML;
  assert.match(html,/459\.000/);assert.match(html,/mini-bank/);assert.match(html,/summary-grid/);assert.match(html,/day-jump/);assert.match(html,/Beklenen gelir/);assert.match(html,/Bekleyen ödeme/);assert.match(f.node('.bottom-nav').innerHTML,/nav-add/);
  f.run("prefs.currency='EUR';render()");assert.match(f.node('#main').innerHTML,/1\.000/);assert.doesNotMatch(f.node('#main').innerHTML,/459\.000/);assert.equal(f.storage.get('howmuchspend.data.v1'),f.original);
});
test('Record search and status filters compose, refresh without losing search input, and report an accurate count',()=>{
  const f=fixture();f.run("month='2026-01';view='records';search='Akbank';statusFilter='pending';render();refreshRecords()");
  assert.match(f.node('#record-results').innerHTML,/Eşleşen kayıt yok/);assert.equal(f.node('#record-count').textContent,'0 kayıt');
  f.run("statusFilter='paid';refreshRecords()");assert.match(f.node('#record-results').innerHTML,/Akbank eski kayıt/);assert.match(f.node('#record-results').innerHTML,/record-date/);assert.equal(f.node('#record-count').textContent,'1 kayıt');
  f.click({action:'clear-search'});assert.equal(f.node('#search').value,'');assert.equal(f.node('.search-clear').hidden,true);
  assert.equal(f.storage.get('howmuchspend.data.v1'),f.original);
});
test('Pending queue opens the correct month and currency; repeated occurrence date shortcuts cannot change an anchored date',()=>{
  const f=fixture();f.run("month='2026-10';view='calendar';render()");f.click({action:'pending'});
  assert.equal(f.run('view'),'records');assert.equal(f.run('statusFilter'),'pending');assert.equal(f.run('month'),'2026-10');assert.equal(f.run('prefs.currency'),'TRY');
  f.run("openEntry(findOcc('card@2026-10-31'))");assert.equal(f.node('#entry-date').disabled,true);const original=f.node('#entry-date').value;f.click({quickDate:'1'});assert.equal(f.node('#entry-date').value,original);
});
test('Compact entry form saves exact EUR cents and displays a preview while keeping existing paid states',()=>{
  const f=fixture();f.run("selected='2026-10-10';prefs.currency='EUR';openEntry()");
  for(const [key,value] of Object.entries({amount:'1.250,50','entry-name':'Yeni euro ödeme','entry-date':'2026-10-10',category:'card',repeat:'none',notes:''}))f.node('#'+key).value=value;
  f.node('#paid').checked=false;f.run('syncEntryPreview()');assert.match(f.node('#entry-preview').textContent,/1\.250,50 EUR/);f.run('saveForm({preventDefault(){}})');
  const saved=JSON.parse(f.storage.get('howmuchspend.data.v1'));assert.equal(saved.entries.length,4);assert.equal(saved.entries.at(-1).amountCents,125050);assert.equal(saved.entries.at(-1).currency,'EUR');assert.deepEqual(saved.entries[0].paidDates,['2026-01-31']);assert.equal(f.node('#entry-dialog').open,false);
});
test('Settings keep reminders visible and motion preference writes no ledger or push data',()=>{
  const f=fixture();f.run("view='settings';render()");assert.match(f.node('#main').innerHTML,/notification-panel/);assert.match(f.node('#main').innerHTML,/08:30 · 12:00 · 17:00/);assert.match(f.node('#main').innerHTML,/motion-mode/);
  for(const fn of f.listeners.change)fn({target:{id:'motion-mode',value:'reduced',closest:()=>null}});
  assert.equal(JSON.parse(f.storage.get('howmuchspend.preferences.v1')).motion,'reduced');assert.equal(f.storage.get('howmuchspend.data.v1'),f.original);assert.equal(f.storage.has('howmuchspend.push.v1'),false);
});
