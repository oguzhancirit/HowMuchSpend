import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import * as Model from '../public/model.js';
import * as Recovery from '../public/recovery-model.js';
const source=fs.readFileSync(new URL('../public/recovery.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace(/^export /gm,'');
function fixture(){
 const listeners={},storage=new Map([['howmuchspend.data.v1','DO_NOT_TOUCH']]),nodes=new Map();let renders=0;
 const entry=(id,type,amount,category)=>({id,type,amountCents:amount,currency:'TRY',category,title:id,bank:category==='card'?'akbank':'',notes:'',startDate:'2026-10-01',recurrence:'monthly',count:null,endDate:null,paidDates:[],skips:[],overrides:{}});
 const data={entries:[entry('salary','income',8000000,'salary'),entry('card-entry','expense',2300000,'card'),entry('rent','expense',4800000,'home')]};
 const ctx=vm.createContext({...Model,...Recovery,crypto:globalThis.crypto,Intl,Date,Number,JSON,confirm:()=>true,FormData:class{constructor(form){this.entries=Object.entries(form.fields)}*[Symbol.iterator](){yield* this.entries}},document:{addEventListener:(n,f)=>listeners[n]=f,getElementById:id=>nodes.get(id)},window:{addEventListener(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},getData:()=>data,money:Model.formatAmount,esc:s=>String(s??'').replaceAll('<','&lt;'),bankImage:b=>`<img alt="${b}">`,toast:()=>{},onChange:()=>renders++,download(){}});
 vm.runInContext(source+'\nvar controller=createRecoveryController({getData,isDemo:()=>false,money,esc,bankImage,toast,onChange,download});',ctx);
 const page=()=>vm.runInContext('controller.page()',ctx);
 const click=(action,props={})=>listeners.click({target:{closest:()=>({dataset:{recoveryAction:action,...props},disabled:false})}});
 const submit=(id,fields)=>{const form={id,fields};nodes.set(id,form);listeners.submit({target:form,preventDefault(){}})};
 return {page,click,submit,storage,nodes,ctx};
}
test('Wizard classifies minimum separately, saves cost history, builds budget and plan without modifying existing ledger',()=>{
 const f=fixture();assert.match(f.page(),/İlk kartını ekle/);f.click('add');assert.match(f.page(),/Borcu netleştirelim/);
 f.submit('recovery-card-form',{bank:'akbank',name:'Akbank',linkedId:'card-entry',snapshotMonth:'2026-10',kind:'minimum',statement:'15.200',balance:'76.000'});assert.match(f.page(),/Bu ayın faiz maliyeti/);
 f.submit('recovery-card-form',{cost:'3.420',costIncluded:'yes',rateMode:'manual',rate:'4,5'});assert.match(f.page(),/Ödeme ve yeni harcamalar/);
 f.submit('recovery-card-form',{minimumRate:'20',currentPayment:'23.000',newSpend:'0',installment:'0',installmentMonths:'0'});assert.match(f.page(),/Kartlara ne kadar ayırabilirsin/);
 f.submit('recovery-budget-form',{month:'2026-10',income:'80.000',expense:'48.000',buffer:'5.000'});
 const html=f.page();assert.match(html,/27\.000 TL/);assert.match(html,/yaklaşık 3 ayda/);assert.match(html,/Aylık kapanış planı/);assert.doesNotMatch(html,/donut|Gelir − gider|Gider dağılımı/);
 const saved=JSON.parse(f.storage.get('howmuchspend.recovery.v1'));assert.equal(saved.cards[0].statementCents,1520000);assert.equal(saved.cards[0].balanceCents,7600000);assert.equal(saved.cards[0].history[0].costCents,342000);assert.equal(f.storage.get('howmuchspend.data.v1'),'DO_NOT_TOUCH');
 f.nodes.set('recovery-target',{value:'28.000'});f.click('target');assert.equal(JSON.parse(f.storage.get('howmuchspend.recovery.v1')).targetCents,null);
});
test('Minimum amount alone cannot create a payoff claim, and blank cost/rate cannot advance',()=>{
 const f=fixture();f.click('add');f.submit('recovery-card-form',{name:'Akbank',snapshotMonth:'2026-10',kind:'minimum',statement:'23.000',balance:''});assert.match(f.page(),/geçerli bir TL tutarı/);assert.equal(f.storage.has('howmuchspend.recovery.v1'),false);
 f.submit('recovery-card-form',{name:'Akbank',snapshotMonth:'2026-10',kind:'minimum',statement:'23.000',balance:'76.000'});f.submit('recovery-card-form',{cost:'',rate:''});assert.match(f.page(),/Bu ayın faiz maliyeti/);assert.equal(f.storage.has('howmuchspend.recovery.v1'),false);
});
test('Fictional worked example is labeled and never saved as actual debt',()=>{
 const f=fixture();f.click('example');assert.match(f.page(),/Kurgusal örnek/);assert.match(f.page(),/yaklaşık 3 ayda/);assert.equal(f.storage.has('howmuchspend.recovery.v1'),false);f.click('example-close');assert.match(f.page(),/İlk kartını ekle/);
});
