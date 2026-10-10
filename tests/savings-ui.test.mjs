import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import * as Model from '../public/model.js';
import * as Savings from '../public/savings-model.js';
const source=fs.readFileSync(new URL('../public/savings.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace(/^export /gm,'');
function fixture({broken=false,hidden=false}={}){
 const listeners={},nodes=new Map(),storage=new Map([['howmuchspend.data.v1','LEDGER'],['howmuchspend.payments.v1','CARDS'],['howmuchspend.recovery.v1','OLD_PLAN']]);let demo=false,changes=0,celebrations=0,confirmation,date='2026-10-11';
 if(broken)storage.set(Savings.SAVINGS_KEY,'invalid');
 const data={...Model.blank(),entries:[{id:'income',type:'income',currency:'TRY',title:'Maaş',category:'salary',bank:'',notes:'',amountCents:1500000,startDate:'2026-10-01',recurrence:'monthly',count:null,endDate:null,paidDates:[],skips:[],overrides:{}}]};
 const ctx=vm.createContext({...Model,...Savings,savingsToday:()=>date,crypto:globalThis.crypto,Intl,Date,FormData:class{constructor(form){this.values=Object.entries(form.fields)}*[Symbol.iterator](){yield* this.values}},document:{addEventListener:(n,f)=>listeners[n]=f,getElementById:id=>nodes.get(id),documentElement:{dataset:{}}},window:{addEventListener:(n,f)=>listeners[n]=f},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},getData:()=>data,getCurrency:()=> 'TRY',isDemo:()=>demo,money:(n,c)=>hidden?'••••':Model.formatAmount(n,c),esc:s=>String(s??'').replace(/[<>&"']/g,'_'),toast(){},onChange:()=>changes++,celebrate:()=>celebrations++,download(){},confirmBox:(...a)=>confirmation=a});
 vm.runInContext(source+'\nvar c=createSavingsController({getData,getCurrency,isDemo,money,esc,toast,onChange,download,confirmBox,celebrate});',ctx);
 const page=()=>vm.runInContext('c.page()',ctx),click=(a,props={})=>listeners.click({target:{closest:()=>({dataset:{savingsAction:a,...props},disabled:false})}}),submit=(id,fields)=>listeners.submit({target:{id,fields},preventDefault(){}});
 const add=()=>{click('start');submit('savings-goal-form',{target:'50.000',initial:'0',reserve:'0'});};
 const paymentFields=amount=>{const html=page();return {amount,token:html.match(/name="token" value="([^"]+)"/)[1],month:html.match(/name="month" value="([^"]+)"/)[1]};};
 const pay=amount=>submit('savings-deposit-form',paymentFields(amount));
 return {page,click,submit,add,pay,paymentFields,storage,listeners,nodes,ctx,data,changes:()=>changes,celebrations:()=>celebrations,setDemo:v=>demo=v,setDate:v=>date=v,confirmation:()=>confirmation,records:m=>vm.runInContext(`c.occurrences('${m}')`,ctx)};
}
test('Monthly deposit replaces simulation: 3.400 TL becomes one paid expense and triggers one celebration',()=>{
 const f=fixture();assert.match(f.page(),/Hadi Para Biriktir/);f.add();assert.match(f.page(),/3\.000 TL/);assert.doesNotMatch(f.page(),/Simülasyon|savings-preview|Ay ay birikim/);f.pay('3.400');assert.match(f.page(),/3\.400 TL kumbaraya aktarıldı/);assert.match(f.page(),/11\.600 TL/);assert.doesNotMatch(f.page(),/id="savings-deposit-form"/);assert.equal(f.celebrations(),1);assert.equal(f.records('2026-10')[0].paid,true);assert.equal(f.records('2026-10')[0].amountCents,340000);assert.equal(f.records('2026-10')[0].date,'2026-10-11');
 for(const [key,value]of [['howmuchspend.data.v1','LEDGER'],['howmuchspend.payments.v1','CARDS'],['howmuchspend.recovery.v1','OLD_PLAN']])assert.equal(f.storage.get(key),value);
});
test('Double-tap submits one transfer; explicit extra payment creates a distinct contribution',()=>{
 const f=fixture();f.add();const fields=f.paymentFields('3.400');f.submit('savings-deposit-form',fields);f.submit('savings-deposit-form',fields);assert.equal(JSON.parse(f.storage.get(Savings.SAVINGS_KEY)).contributions.length,1);assert.equal(f.celebrations(),1);f.click('extra');f.pay('600');assert.match(f.page(),/4\.000 TL kumbaraya aktarıldı/);assert.equal(f.records('2026-10').length,2);assert.equal(f.celebrations(),2);
});
test('New month renews payment form while carrying the old balance; stale previous-month form cannot pay a new month',()=>{
 const f=fixture();f.add();const stale=f.paymentFields('3.000');f.pay('3.000');f.setDate('2026-11-01');assert.match(f.page(),/Kasım 2026/);assert.match(f.page(),/Geçen aydan<\/span><strong>3\.000 TL/);assert.match(f.page(),/id="savings-deposit-form"/);const before=f.storage.get(Savings.SAVINGS_KEY);f.submit('savings-deposit-form',stale);assert.equal(f.storage.get(Savings.SAVINGS_KEY),before);f.pay('2.000');assert.match(f.page(),/>5\.000 TL<\/strong>/);assert.equal(f.records('2026-10')[0].amountCents,300000);assert.equal(f.records('2026-11')[0].amountCents,200000);
});
test('Reset requires confirmation, empties only the bank, keeps past expenses and allows fresh saving',()=>{
 const f=fixture();f.add();f.pay('3.400');f.click('reset');assert.match(f.confirmation()[1],/Geçmiş aylardaki gider kayıtları/);assert.equal(JSON.parse(f.storage.get(Savings.SAVINGS_KEY)).resets.length,0);f.confirmation()[2][0].run();assert.match(f.page(),/>0 TL<\/strong>/);assert.equal(f.records('2026-10')[0].amountCents,340000);f.click('extra');f.pay('1.000');assert.match(f.page(),/>1\.000 TL<\/strong>/);assert.match(f.page(),/4\.400 TL kumbaraya aktarıldı/);f.setDate('2026-11-01');assert.match(f.page(),/Geçen aydan<\/span><strong>1\.000 TL/);
});
test('Invalid amounts, storage failures and demo do not create transfers or confetti',()=>{
 const f=fixture();f.add();const before=f.storage.get(Savings.SAVINGS_KEY);for(const amount of ['0','-100','NaN'])f.pay(amount);assert.equal(f.storage.get(Savings.SAVINGS_KEY),before);assert.equal(f.celebrations(),0);const b=fixture({broken:true});b.click('start');assert.equal(b.storage.get(Savings.SAVINGS_KEY),'invalid');assert.match(b.page(),/verisi okunamadı/);const stale=f.paymentFields('1.000');f.setDemo(true);f.submit('savings-deposit-form',stale);assert.equal(f.storage.get(Savings.SAVINGS_KEY),before);assert.equal(f.celebrations(),0);
});
test('Wrong-record removal reverses the expense, and Turkish goal form keeps a draft without simulation settings',()=>{
 const f=fixture();f.add();f.pay('3.400');const id=JSON.parse(f.storage.get(Savings.SAVINGS_KEY)).contributions[0].id;f.click('remove-deposit',{id});f.confirmation()[2][0].run();assert.equal(f.records('2026-10').length,0);f.click('edit');f.nodes.set('savings-goal-form',{id:'savings-goal-form',fields:{target:'75.000'}});vm.runInContext('c.captureDraft()',f.ctx);assert.match(f.page(),/75.000/);assert.doesNotMatch(f.page(),/type="month"|Simülasyon|name="horizon"/);
});
