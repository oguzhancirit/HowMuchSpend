import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as Model from '../public/model.js';
import * as Savings from '../public/savings-model.js';
import * as Recovery from '../public/recovery-model.js';
import * as Payments from '../public/payments-model.js';
import {dayStatus} from '../public/calendar-status.js';
import {createMotionController} from '../public/motion.js';

const read=name=>fs.readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const source=read('notifications.js').replace(/^export /gm,'')+'\nconst createRecoveryController=(()=>{'+read('recovery.js').replace(/^import .*\n/gm,'').replace(/^export /gm,'')+';return createRecoveryController;})();\nconst createPaymentsController=(()=>{'+read('payments.js').replace(/^import .*\n/gm,'').replace(/^export /gm,'')+';return createPaymentsController;})();\nconst createSavingsController=(()=>{'+read('savings.js').replace(/^import .*\n/gm,'').replace(/^export /gm,'')+';return createSavingsController;})();\n'+read('app.js').replace(/^import .*\n/gm,'');
function fixture({savingsState}={}){
  const nodes=new Map(),listeners={};
  const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:'',innerHTML:'',textContent:'',hidden:false,checked:false,open:false,dataset:{},content:'',listeners:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){},addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);},reset(){},showModal(){this.open=true;},close(){this.open=false;},focus(){},querySelectorAll:()=>[]});return nodes.get(selector);};
  const entry=(id,type,currency,amount,title,category)=>({id,type,currency,amountCents:amount,title,category,bank:category==='card'?'akbank':'',notes:'',startDate:'2026-01-31',recurrence:'monthly',count:null,endDate:null,paidDates:id==='card'?['2026-01-31']:[],skips:[],overrides:{}});
  const ledger={schemaVersion:1,updatedAt:null,entries:[entry('card','expense','TRY',45900000,'Akbank eski kayıt','card'),entry('salary','income','TRY',10000000,'Maaş','salary'),entry('euro','income','EUR',100000,'Euro gelir','salary')]};
  const storage=new Map([['howmuchspend.data.v1',JSON.stringify(ledger)]]),original=storage.get('howmuchspend.data.v1');
  if(savingsState)storage.set('howmuchspend.savings.v1',JSON.stringify(savingsState));
  const context=vm.createContext({...Model,...Recovery,...Payments,...Savings,dayStatus,createMotionController,URL,location:{hostname:'howmuchspend.ozicirit9.chatgpt.site',href:'https://howmuchspend.ozicirit9.chatgpt.site'},document:{querySelector:node,querySelectorAll:()=>[],getElementById:id=>nodes.get('#'+id),documentElement:{dataset:{}},addEventListener:(event,fn)=>(listeners[event]??=[]).push(fn)},window:{innerWidth:428,addEventListener(){},scrollTo(){}},navigator:{},Intl,Date,console,crypto:globalThis.crypto,structuredClone,setTimeout:()=>1,clearTimeout(){},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}});
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
test('Payment tracking replaces records navigation without changing the calendar ledger',()=>{
  const f=fixture();f.run("month='2026-10';view='payments';render()");
  assert.match(f.node('#main').innerHTML,/Ödeme Takibi/);assert.match(f.node('#main').innerHTML,/Takvimdeki kartlar/);assert.match(f.node('.bottom-nav').innerHTML,/data-view="payments"/);assert.doesNotMatch(f.node('.bottom-nav').innerHTML,/İşlemler|data-view="records"/);
  assert.equal(f.storage.get('howmuchspend.data.v1'),f.original);assert.equal(f.storage.has('howmuchspend.payments.v1'),false);
});
test('Pending queue stays in the calendar and expands; anchored date shortcuts remain protected',()=>{
  const f=fixture();f.run("month='2026-10';view='calendar';render()");f.click({action:'pending'});
  assert.equal(f.run('view'),'calendar');assert.equal(f.run('expandedPending'),true);assert.equal(f.run('month'),'2026-10');assert.equal(f.run('prefs.currency'),'TRY');
  f.run("openEntry(findOcc('card@2026-10-31'))");assert.equal(f.node('#entry-date').disabled,true);const original=f.node('#entry-date').value;f.click({quickDate:'1'});assert.equal(f.node('#entry-date').value,original);
});
test('Compact entry form saves exact EUR cents and displays a preview while keeping existing paid states',()=>{
  const f=fixture();f.run("selected='2026-10-10';prefs.currency='EUR';openEntry()");
  for(const [key,value] of Object.entries({amount:'1.250,50','entry-name':'Yeni euro ödeme','entry-date':'2026-10-10',category:'card',repeat:'none',notes:''}))f.node('#'+key).value=value;
  f.node('#paid').checked=false;f.run('syncEntryPreview()');assert.match(f.node('#entry-preview').textContent,/1\.250,50 EUR/);f.run('saveForm({preventDefault(){}})');
  const saved=JSON.parse(f.storage.get('howmuchspend.data.v1'));assert.equal(saved.entries.length,4);assert.equal(saved.entries.at(-1).amountCents,125050);assert.equal(saved.entries.at(-1).currency,'EUR');assert.deepEqual(saved.entries[0].paidDates,['2026-01-31']);assert.equal(f.node('#entry-dialog').open,false);
});
test('New dated payments and income remain pending until explicitly completed; date shortcuts preserve the choice',()=>{
  for(const type of ['expense','income'])for(const date of [Model.addDays(Model.today(),-1),Model.today(),Model.addDays(Model.today(),1)]){
    const f=fixture();f.run(`selected=${JSON.stringify(date)};openEntry(null,${JSON.stringify(type)})`);
    assert.equal(f.node('#paid').checked,false);
    for(const [key,value]of Object.entries({amount:'1000','entry-name':'Planlı kayıt',category:type==='income'?'salary':'card',repeat:'none',notes:''}))f.node('#'+key).value=value;
    f.run('syncEntryPreview()');assert.match(f.node('#entry-preview').textContent,/Bekliyor/);
    f.run('saveForm({preventDefault(){}})');const saved=JSON.parse(f.storage.get('howmuchspend.data.v1'));
    assert.deepEqual(saved.entries.at(-1).paidDates,[]);assert.deepEqual(saved.entries[0].paidDates,['2026-01-31']);
  }
  const f=fixture();f.run('openEntry()');f.node('#paid').checked=true;f.node('#amount').value='1000';
  f.click({quickDate:'1'});assert.equal(f.node('#paid').checked,true);
  f.node('#entry-date').value=Model.addDays(Model.today(),-5);for(const fn of f.node('#entry-date').listeners.change)fn();assert.equal(f.node('#paid').checked,true);assert.match(f.node('#entry-preview').textContent,/Ödendi/);
  f.node('#paid').checked=false;f.click({quickDate:'0'});assert.equal(f.node('#paid').checked,false);assert.match(f.node('#entry-preview').textContent,/Bekliyor/);
  assert.equal(f.storage.get('howmuchspend.data.v1'),f.original);
});
test('Settings keep reminders visible and motion preference writes no ledger or push data',()=>{
  const f=fixture();f.run("view='settings';render()");assert.match(f.node('#main').innerHTML,/notification-panel/);assert.match(f.node('#main').innerHTML,/08:30 · 12:00 · 17:00/);assert.match(f.node('#main').innerHTML,/motion-mode/);
  for(const fn of f.listeners.change)fn({target:{id:'motion-mode',value:'reduced',closest:()=>null}});
  assert.equal(JSON.parse(f.storage.get('howmuchspend.preferences.v1')).motion,'reduced');assert.equal(f.storage.get('howmuchspend.data.v1'),f.original);assert.equal(f.storage.has('howmuchspend.push.v1'),false);
});

test('Para Biriktir replaces Kurtuluş with a compact single-row navigation while preserving data',()=>{
 const f=fixture();f.run("view='savings';render()");assert.match(f.node('#main').innerHTML,/Hadi Para Biriktir/);assert.match(f.node('.bottom-nav').innerHTML,/data-view="savings"/);assert.doesNotMatch(f.node('.bottom-nav').innerHTML,/Kurtuluş|data-view="recovery"/);assert.equal(f.storage.get('howmuchspend.data.v1'),f.original);assert.equal(f.storage.has('howmuchspend.savings.v1'),false);
});


test('Paid savings appear once in monthly expense/net and day summary, never in pending queue or card debt',()=>{
 const goal={name:'Tatil',currency:'TRY',targetCents:5000000,initialCents:0,reserveCents:0,sharePercent:20,startMonth:'2026-10',endMonth:null,horizonMonths:24};
 const f=fixture({savingsState:{schemaVersion:1,goal,contributions:[{id:'deposit',month:'2026-10',date:'2026-10-10',amountCents:340000}],updatedAt:null}});
 f.run("month='2026-10';selected='2026-10-10';view='calendar';render()");const t=f.run('sum(list())');assert.equal(t.expense,46240000);assert.equal(t.net,-36240000);assert.equal(t.paid,340000);assert.equal(t.pendingExpense,45900000);assert.match(f.node('#main').innerHTML,/3\.400 TL kumbaraya aktarıldı/);assert.match(f.node('#main').innerHTML,/Kumbaraya aktarıldı/);assert.doesNotMatch(f.run('upcoming()'),/Kumbaraya aktarıldı/);assert.doesNotMatch(f.run("row(list().find(e=>e.savings))"),/data-edit=|data-paid=/);assert.equal(f.storage.get('howmuchspend.data.v1'),f.original);
 f.run("prefs.currency='EUR';render()");assert.equal(f.run('sum(list()).expense'),0);assert.doesNotMatch(f.node('#main').innerHTML,/kumbaraya aktarıldı/);
});

 test('Calendar expands monthly occurrences once per render and recalculates after an edit',()=>{
 const f=fixture();f.run("month='2026-10';let expansions=0;const originalOccurrences=occurrences;occurrences=(...args)=>{expansions++;return originalOccurrences(...args)};render()");assert.equal(f.run('expansions'),1);
 f.run("data.entries[0].amountCents=100000;render()");assert.equal(f.run('expansions'),2);assert.equal(f.run('sum(list()).expense'),100000);
 });

 test('SEC-04: imported HTML in titles and notes is escaped in calendar and dialogs',()=>{
 const f=fixture();f.run(`month='2026-10';data.entries[0].title='<img src=x onerror=alert(1)>';data.entries[0].notes='<svg onload=alert(1)>';render()`);const html=f.node('#main').innerHTML;assert.doesNotMatch(html,/<img src=x|<svg onload=/);assert.match(html,/&lt;img/);f.run("openEntry(findOcc('card@2026-10-31'))");assert.equal(f.node('#entry-name').value,'<img src=x onerror=alert(1)>');
 });
