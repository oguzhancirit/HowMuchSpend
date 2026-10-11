import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import * as Model from '../public/model.js';
import * as Payments from '../public/payments-model.js';
const source=fs.readFileSync(new URL('../public/payments.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace(/^export /gm,'');
function fixture({hidden=false,broken=false}={}){
  const listeners={},storage=new Map([['howmuchspend.data.v1','LEDGER_UNCHANGED'],['howmuchspend.recovery.v1','PLAN_UNCHANGED']]),nodes=new Map();let month='2026-10',currency='TRY',demo=false,confirmation,downloaded;
  if(broken)storage.set(Payments.PAYMENT_KEY,'broken-json');
  const data={...Model.blank(),entries:[{id:'pay',type:'expense',category:'card',bank:'akbank',currency:'TRY',title:'Akbank kart',amountCents:2300000,startDate:'2026-10-05',recurrence:'monthly',count:null,endDate:null,paidDates:['2026-10-05'],skips:[],overrides:{},notes:''}]};
  const ctx=vm.createContext({...Model,...Payments,crypto:globalThis.crypto,Intl,Date,structuredClone,Number,JSON,FormData:class{constructor(form){this.entries=Object.entries(form.fields).flatMap(([k,v])=>Array.isArray(v)?v.map(x=>[k,x]):[[k,v]])}*[Symbol.iterator](){yield* this.entries}getAll(k){return this.entries.filter(([key])=>key===k).map(([,v])=>v)}get(k){return this.getAll(k)[0]??null}},document:{addEventListener:(n,f)=>listeners[n]=f,getElementById:id=>nodes.get(id)},window:{addEventListener(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},getData:()=>data,getMonth:()=>month,setMonth:m=>month=m,getCurrency:()=>currency,setCurrency:c=>currency=c,isDemo:()=>demo,money:(n,c)=>hidden?'••••':Model.formatAmount(n,c),esc:s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])),bankImage:b=>`<img alt="${b}">`,toast(){},onChange(){},download:(...args)=>downloaded=args,confirmBox:(...args)=>confirmation=args});
  vm.runInContext(source+'\nvar controller=createPaymentsController({getData,getMonth,setMonth,getCurrency,setCurrency,isDemo,money,esc,bankImage,toast,onChange,download,confirmBox});',ctx);
  const page=()=>vm.runInContext('controller.page()',ctx);
  const click=(action,props={})=>listeners.click({target:{closest:()=>({dataset:{paymentAction:action,...props},disabled:false})}});
  const submit=(id,fields)=>{const form={id,fields};nodes.set(id,form);listeners.submit({target:form,preventDefault(){}});nodes.delete(id);};
  const add=()=>{click('add');submit('payment-card-form',{name:'Akbank',currency:'TRY',paymentSource:'bank'});};
  return {page,click,submit,add,storage,nodes,ctx,listeners,data,setMonth:m=>month=m,setCurrency:c=>currency=c,setDemo:v=>demo=v,downloaded:()=>downloaded,confirmation:()=>confirmation};
}

test('Card onboarding asks the bank, saves a separate tracker and shows actual payment without inventing total debt',()=>{
  const f=fixture();assert.match(f.page(),/Takvimdeki kartlar/);assert.equal(f.storage.has(Payments.PAYMENT_KEY),false);f.click('add');assert.match(f.page(),/Hangi kartı takip edelim/);assert.match(f.page(),/Ziraat|Yapı Kredi|Akbank/);
  f.submit('payment-card-form',{name:'Akbank',currency:'TRY',paymentSource:'bank'});assert.match(f.page(),/23\.000 TL/);assert.match(f.page(),/Borcu gir/);assert.match(f.page(),/Borç bilgisi eksik/);
  assert.equal(f.storage.get('howmuchspend.data.v1'),'LEDGER_UNCHANGED');assert.equal(f.storage.get('howmuchspend.recovery.v1'),'PLAN_UNCHANGED');
});
test('Monthly form creates a proportional flow, category distribution and history; next month uses remaining carry',()=>{
  const f=fixture();f.add();f.click('statement');
  f.submit('payment-month-form',{openingMode:'manual',opening:'50.000',spend:'10.000',cost:'1.000',paidMode:'calendar',category_food:'6.000'});
  let html=f.page();assert.match(html,/38\.000 TL/);assert.match(html,/Borç azalıyor/);assert.match(html,/tracking-flow/);assert.match(html,/Yeni harcama dağılımı/);assert.match(html,/Ay ay takip/);assert.match(html,/4\.000 TL/);
  f.setMonth('2026-11');f.click('statement');assert.match(f.page(),/Önceki ayın kalanından otomatik/);assert.match(f.page(),/38\.000 TL/);
  f.submit('payment-month-form',{openingMode:'previous',spend:'5.000',cost:'0',paidMode:'manual',paid:'10.000'});html=f.page();assert.match(html,/33\.000 TL/);assert.match(html,/Ödenen tutar elle girildi/);
  const stored=JSON.parse(f.storage.get(Payments.PAYMENT_KEY));assert.equal(stored.cards[0].months.length,2);assert.equal(stored.cards[0].months[1].paidCents,1000000);assert.equal(f.storage.get('howmuchspend.data.v1'),'LEDGER_UNCHANGED');
});
test('Invalid category allocation cannot overwrite a saved month; future calendar completion recomputes carry',()=>{
  const f=fixture();f.add();f.click('statement');f.submit('payment-month-form',{openingMode:'manual',opening:'50.000',spend:'10.000',cost:'1.000',paidMode:'calendar'});const before=f.storage.get(Payments.PAYMENT_KEY);
  f.click('statement');f.submit('payment-month-form',{category_food:'20.000'});assert.match(f.page(),/Kategori toplamı/);assert.equal(f.storage.get(Payments.PAYMENT_KEY),before);f.click('cancel');
  f.data.entries[0].paidDates=[];assert.match(f.page(),/61\.000 TL/);assert.equal(f.storage.get(Payments.PAYMENT_KEY),before);
});
test('Hidden totals redact flow labels, history and accessible chart labels; demo cannot write real cards',()=>{
  const f=fixture({hidden:true});f.add();f.click('statement');f.submit('payment-month-form',{openingMode:'manual',opening:'50.000',spend:'10.000',cost:'1.000',paidMode:'calendar'});assert.doesNotMatch(f.page(),/38\.000|61\.000|23\.000|50\.000/);assert.match(f.page(),/••••/);
  const before=f.storage.get(Payments.PAYMENT_KEY);f.setDemo(true);f.click('add');assert.match(f.page(),/Kendi takvimine geç/);assert.equal(f.storage.get(Payments.PAYMENT_KEY),before);
});
test('Navigation preserves month draft; currency changes never relabel a recorded history',()=>{
  const f=fixture();f.add();f.click('statement');f.nodes.set('payment-month-form',{id:'payment-month-form',fields:{opening:'64.500',spend:'100',cost:'0',paidMode:'manual',paid:'500'}});
  vm.runInContext('controller.captureDraft()',f.ctx);assert.match(f.page(),/64.500/);assert.equal(JSON.parse(f.storage.get(Payments.PAYMENT_KEY)).cards[0].months.length,0);
  f.submit('payment-month-form',{});const c=JSON.parse(f.storage.get(Payments.PAYMENT_KEY)).cards[0];f.click('edit',{id:c.id});f.submit('payment-card-form',{currency:'EUR'});assert.match(f.page(),/para birimi değiştirilemez/);assert.equal(JSON.parse(f.storage.get(Payments.PAYMENT_KEY)).cards[0].currency,'TRY');
});
test('Corrupt storage is retained for backup and cannot be overwritten by adding a card',()=>{
  const f=fixture({broken:true});assert.match(f.page(),/verisi okunamadı/);f.click('add');assert.equal(f.storage.get(Payments.PAYMENT_KEY),'broken-json');f.click('backup');assert.equal(f.downloaded()[1],'broken-json');assert.equal(f.storage.get('howmuchspend.data.v1'),'LEDGER_UNCHANGED');
});

test('Turkish month selector replaces locale-dependent date input, navigates without writes and protects open debt drafts',()=>{
  const f=fixture(),before=JSON.stringify([...f.storage]);
  assert.match(f.page(),/tracking-month-label/);assert.match(f.page(),/>Ekim<\/span>/);assert.doesNotMatch(f.page(),/type="month"/);
  f.click('pick-month');assert.match(f.page(),/id="payment-month-picker"/);assert.match(f.page(),/Aralık/);
  f.submit('payment-month-picker',{pickerYear:'2027',pickerMonth:'12'});assert.match(f.page(),/>Aralık<\/span>/);assert.match(f.page(),/2027<\/span>/);assert.doesNotMatch(f.page(),/id="payment-month-picker"/);
  f.submit('payment-month-picker',{pickerYear:'2200',pickerMonth:'01'});assert.match(f.page(),/2027<\/span>/);assert.equal(JSON.stringify([...f.storage]),before);
  f.setMonth('2026-10');f.add();f.click('statement');f.click('month',{value:'1'});assert.match(f.page(),/Ekim \(October\) 2026 borç kaydı/);assert.match(f.page(),/aria-controls="payment-month-picker" disabled/);
});

test('Saved card debt shows a collapsed, source-labelled explanation with only completed linked payments',()=>{
  const f=fixture();f.data.entries.push({...f.data.entries[0],id:'unpaid',title:'Bekleyen gizli kayıt',paidDates:[],amountCents:400000});
  f.add();f.click('statement');f.submit('payment-month-form',{openingMode:'manual',opening:'50.000',spend:'10.000',cost:'1.000',paidMode:'calendar'});
  const before=f.storage.get(Payments.PAYMENT_KEY),html=f.page();assert.match(html,/<details class="tracking-explanation" id="[^"]+">/);assert.match(html,/Borç neden azaldı/);assert.match(html,/−12\.000 TL/);assert.match(html,/Takvim · 1 kayıt/);assert.match(html,/Ödenen takvim kayıtları/);assert.doesNotMatch(html,/Bekleyen gizli kayıt/);
  assert.match(html,/50\.000 TL \+ 10\.000 TL \+ 1\.000 TL − 23\.000 TL = 38\.000 TL/);assert.equal(f.storage.get(Payments.PAYMENT_KEY),before);
  f.data.entries[0].paidDates=[];assert.match(f.page(),/Borç neden arttı/);assert.doesNotMatch(f.page(),/Ödenen takvim kayıtları/);assert.equal(f.storage.get(Payments.PAYMENT_KEY),before);
});
test('Live formula updates without saving or re-rendering, and hides missing debt instead of assuming zero',()=>{
  const f=fixture();f.add();f.click('statement');const before=f.storage.get(Payments.PAYMENT_KEY),form={id:'payment-month-form'},output={textContent:''},caption={textContent:''};
  f.nodes.set('payment-preview',output);f.nodes.set('payment-equation-caption',caption);
  const input=(name,value)=>f.listeners.input({target:{name,value,closest:()=>form}});
  input('opening','50.000');input('spend','10.000');input('cost','1.000');assert.match(output.textContent,/50\.000 TL \+ 10\.000 TL \+ 1\.000 TL − 23\.000 TL = 38\.000 TL/);assert.equal(f.storage.get(Payments.PAYMENT_KEY),before);
  input('opening','');assert.doesNotMatch(output.textContent,/= 0 TL/);assert.match(output.textContent,/geçerli bir tutar/);
  const empty=fixture();empty.add();assert.doesNotMatch(empty.page(),/tracking-explanation/);
});
test('Manual payment replaces calendar source, while credit and input injection remain accurate and safe',()=>{
  const f=fixture();f.data.entries[0].title='<img src=x onerror=alert(1)>';f.add();f.click('statement');f.submit('payment-month-form',{openingMode:'manual',opening:'1.000',spend:'0',cost:'0',paidMode:'calendar'});
  let html=f.page();assert.doesNotMatch(html,/<img src=x/);assert.match(html,/&lt;img/);assert.match(html,/Borca işlenen ödeme/);assert.match(html,/Kart alacağı: 22\.000 TL/);
  f.click('statement');f.submit('payment-month-form',{paidMode:'manual',paid:'500'});html=f.page();assert.match(html,/Ödenen tutar elle girildi/);assert.doesNotMatch(html,/Ödenen takvim kayıtları/);assert.match(html,/1\.000 TL \+ 0 TL \+ 0 TL − 500 TL = 500 TL/);
});
