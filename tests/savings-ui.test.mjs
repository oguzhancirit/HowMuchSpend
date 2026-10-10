import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import * as Model from '../public/model.js';
import * as Savings from '../public/savings-model.js';
const source=fs.readFileSync(new URL('../public/savings.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace(/^export /gm,'');
function fixture({broken=false}={}){
 const listeners={},nodes=new Map(),storage=new Map([['howmuchspend.data.v1','LEDGER'],['howmuchspend.payments.v1','CARDS'],['howmuchspend.recovery.v1','OLD_PLAN']]);let demo=false,changes=0,confirmation;const m=Model.today().slice(0,7);
 if(broken)storage.set(Savings.SAVINGS_KEY,'invalid');
 const data={...Model.blank(),entries:[{id:'income',type:'income',currency:'TRY',title:'Maaş',category:'salary',bank:'',notes:'',amountCents:1500000,startDate:m+'-01',recurrence:'monthly',count:null,endDate:null,paidDates:[],skips:[],overrides:{}}]};
 const ctx=vm.createContext({...Model,...Savings,crypto:globalThis.crypto,Intl,Date,FormData:class{constructor(form){this.values=Object.entries(form.fields)}*[Symbol.iterator](){yield* this.values}},document:{addEventListener:(n,f)=>listeners[n]=f,getElementById:id=>nodes.get(id)},window:{addEventListener(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},getData:()=>data,getCurrency:()=> 'TRY',isDemo:()=>demo,money:Model.formatAmount,esc:s=>String(s??'').replace(/[<>&"']/g,'_'),toast(){},onChange:()=>changes++,download(){},confirmBox:(...a)=>confirmation=a});
 vm.runInContext(source+'\nvar c=createSavingsController({getData,getCurrency,isDemo,money,esc,toast,onChange,download,confirmBox});',ctx);
 const page=()=>vm.runInContext('c.page()',ctx),click=(a,props={})=>listeners.click({target:{closest:()=>({dataset:{savingsAction:a,...props},disabled:false})}}),submit=(id,fields)=>{const form={id,fields};listeners.submit({target:form,preventDefault(){}});};
 const add=()=>{click('start');submit('savings-goal-form',{target:'50.000',initial:'0',reserve:'0'});};
 return {page,click,submit,add,storage,listeners,nodes,ctx,m,changes:()=>changes,setDemo:v=>demo=v,confirmation:()=>confirmation};
}
test('Goal onboarding creates a pink bank with 3.000 TL recommendation; simulation never saves fictional money',()=>{
 const f=fixture();assert.match(f.page(),/Hadi Para Biriktir/);f.add();assert.match(f.page(),/savings-pig/);assert.match(f.page(),/3\.000 TL/);assert.match(f.page(),/Gerçek birikim/);const before=f.storage.get(Savings.SAVINGS_KEY);f.click('simulate');assert.match(f.page(),/Simülasyon/);assert.equal(f.storage.get(Savings.SAVINGS_KEY),before);assert.equal(JSON.parse(before).contributions.length,0);f.click('actual');assert.match(f.page(),/>0 TL<\/strong>/);
 for(const [key,value]of [['howmuchspend.data.v1','LEDGER'],['howmuchspend.payments.v1','CARDS'],['howmuchspend.recovery.v1','OLD_PLAN']])assert.equal(f.storage.get(key),value);
});
test('Actual deposit is explicit, changes future recommendations and can be removed with confirmation',()=>{
 const f=fixture();f.add();f.click('deposit');assert.match(f.page(),/Öneri otomatik kaydedilmez/);f.submit('savings-deposit-form',{amount:'3.000',depositYear:f.m.slice(0,4),depositMonth:f.m.slice(5)});assert.match(f.page(),/>3\.000 TL<\/strong>/);assert.match(f.page(),/2\.400 TL/);const saved=JSON.parse(f.storage.get(Savings.SAVINGS_KEY));assert.equal(saved.contributions[0].amountCents,300000);f.click('remove-deposit',{id:saved.contributions[0].id});assert.equal(JSON.parse(f.storage.get(Savings.SAVINGS_KEY)).contributions.length,1);f.confirmation()[2][0].run();assert.equal(JSON.parse(f.storage.get(Savings.SAVINGS_KEY)).contributions.length,0);
});
test('Future deposit and invalid target cannot mutate savings; form drafts survive navigation',()=>{
 const f=fixture();f.add();const before=f.storage.get(Savings.SAVINGS_KEY);f.click('deposit');const future=Model.shiftMonth(f.m,1);f.submit('savings-deposit-form',{amount:'100',depositYear:future.slice(0,4),depositMonth:future.slice(5)});assert.equal(f.storage.get(Savings.SAVINGS_KEY),before);assert.match(f.page(),/bu ayı veya geçmiş/);f.click('cancel');f.click('edit');f.nodes.set('savings-goal-form',{id:'savings-goal-form',fields:{target:'75.000'}});vm.runInContext('c.captureDraft()',f.ctx);assert.match(f.page(),/75.000/);f.submit('savings-goal-form',{target:'0'});assert.equal(f.storage.get(Savings.SAVINGS_KEY),before);
});
test('Range input keeps the same DOM until selection completes, and Turkish months avoid native month overflow',()=>{
 const f=fixture();f.add();f.click('simulate');const changes=f.changes();f.listeners.input({target:{id:'savings-preview',value:'2'}});assert.equal(f.changes(),changes);f.listeners.change({target:{id:'savings-preview',value:'2'}});assert.equal(f.changes(),changes+1);f.click('edit');assert.doesNotMatch(f.page(),/type="month"|October/);assert.match(f.page(),/Ekim/);
});
test('Corrupt storage and demo never overwrite real savings',()=>{
 const f=fixture({broken:true});f.click('start');assert.equal(f.storage.get(Savings.SAVINGS_KEY),'invalid');assert.match(f.page(),/verisi okunamadı/);const d=fixture();d.setDemo(true);d.click('start');assert.equal(d.storage.has(Savings.SAVINGS_KEY),false);
});
