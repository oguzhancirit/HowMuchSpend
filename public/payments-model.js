import {BANKS,CURRENCIES,CATEGORIES,occurrences,monthRange,shiftMonth} from './model.js?v=18';

export const PAYMENT_KEY='howmuchspend.payments.v1';
const MAX=1e12;
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const assert=(ok,message)=>{if(!ok)throw Error(message);};
export const validMonth=v=>typeof v==='string'&&/^(19\d{2}|20\d{2}|21\d{2})-(0[1-9]|1[0-2])$/.test(v);
export const emptyPayments=()=>({schemaVersion:1,cards:[],updatedAt:null});
const amount=(v,label)=>{assert(Number.isSafeInteger(v)&&v>=0&&v<=MAX,label+' geçersiz.');return v;};
const add=values=>{const n=values.reduce((s,v)=>s+v,0);assert(Number.isSafeInteger(n),'Tutarlar hesaplama sınırını aşıyor.');return n;};

export function validatePayments(raw){
  assert(object(raw)&&raw.schemaVersion===1&&Array.isArray(raw.cards)&&raw.cards.length<=20,'Geçerli bir Ödeme Takibi yedeği seç.');
  const ids=new Set(),links=new Set(),groups=new Map();
  const cards=raw.cards.map(c=>{
    assert(object(c)&&typeof c.id==='string'&&/^[\w-]{1,100}$/.test(c.id)&&!ids.has(c.id),'Kart kimliği geçersiz veya tekrarlı.');ids.add(c.id);
    assert(typeof c.name==='string'&&c.name.trim().length>0&&c.name.length<=60,'Kart adı gerekli (en fazla 60 karakter).');
    assert(c.bank===''||Object.hasOwn(BANKS,c.bank),'Banka geçersiz.');
    assert(Object.hasOwn(CURRENCIES,c.currency),'Para birimi geçersiz.');
    assert(['bank','links','none'].includes(c.paymentSource),'Ödeme bağlantısı geçersiz.');
    assert(c.paymentSource!=='bank'||c.bank,'Otomatik banka bağlantısı için banka seç.');
    assert(Array.isArray(c.linkedIds)&&c.linkedIds.length<=10000&&c.linkedIds.every(x=>typeof x==='string'&&/^[\w-]{1,80}$/.test(x)),'Takvim bağlantıları geçersiz.');
    const linkedIds=[...new Set(c.linkedIds)];
    if(c.paymentSource==='links')for(const id of linkedIds){assert(!links.has(id),'Bir takvim kaydı iki karta bağlanamaz.');links.add(id);}
    const group=c.bank+':'+c.currency,prev=groups.get(group);
    assert(!c.bank||!prev||prev!=='bank'&&c.paymentSource!=='bank','Aynı bankada birden fazla kart için “Seçtiğim takvim kayıtları” bağlantısını kullan.');
    if(c.bank)groups.set(group,c.paymentSource==='bank'?'bank':prev||'other');
    assert(Array.isArray(c.months)&&c.months.length<=600,'En fazla 600 aylık kayıt saklanabilir.');
    const monthIds=new Set();
    const months=c.months.map(m=>{
      assert(object(m)&&validMonth(m.month)&&!monthIds.has(m.month),'Ay geçersiz veya tekrarlı.');monthIds.add(m.month);
      assert(['manual','previous'].includes(m.openingMode)&&['calendar','manual'].includes(m.paidMode),'Aylık tutar kaynağı geçersiz.');
      const out={month:m.month,openingMode:m.openingMode,openingCents:amount(m.openingCents,'Devreden borç'),spendCents:amount(m.spendCents,'Yeni harcama'),costCents:amount(m.costCents,'Faiz ve vergi'),paidMode:m.paidMode,paidCents:amount(m.paidCents,'Ödenen tutar'),breakdown:{}};
      assert(object(m.breakdown),'Harcama dağılımı geçersiz.');
      for(const [category,n] of Object.entries(m.breakdown)){assert(Object.hasOwn(CATEGORIES,category)&&CATEGORIES[category].type==='expense'&&!['card','loan'].includes(category),'Harcama kategorisi geçersiz.');out.breakdown[category]=amount(n,'Kategori tutarı');}
      assert(add(Object.values(out.breakdown))<=out.spendCents,'Kategori toplamı yeni harcama tutarını aşamaz.');
      return out;
    }).sort((a,b)=>a.month.localeCompare(b.month));
    return {id:c.id,name:c.name.trim(),bank:c.bank,currency:c.currency,paymentSource:c.paymentSource,linkedIds,months};
  });
  return {schemaVersion:1,cards,updatedAt:typeof raw.updatedAt==='string'?raw.updatedAt:null};
}

export function cardPayments(card,data,month){
  const entries=occurrences(data,...monthRange(month)).filter(e=>e.type==='expense'&&e.category==='card'&&(e.currency||'TRY')===card.currency&&(card.paymentSource==='bank'?e.bank===card.bank:card.paymentSource==='links'&&card.linkedIds.includes(e.seriesId)));
  return {entries,paidCents:add(entries.filter(e=>e.paid).map(e=>e.amountCents)),pendingCents:add(entries.filter(e=>!e.paid).map(e=>e.amountCents))};
}

// A payment entry is never treated as the card's total debt. Only explicit monthly statements establish debt.
function calculateMonths(card,data,month){
  const results=new Map();
  for(const record of card.months.filter(m=>m.month<=month).sort((a,b)=>a.month.localeCompare(b.month))){
    const payment=cardPayments(card,data,record.month),previous=results.get(shiftMonth(record.month,-1));
    const openingKnown=record.openingMode==='manual'||!!previous?.known;
    const paidKnown=record.paidMode==='manual'||card.paymentSource!=='none';
    const paidCents=record.paidMode==='manual'?record.paidCents:payment.paidCents;
    const openingCents=record.openingMode==='manual'?record.openingCents:previous?.closingCents??null;
    const openingCreditCents=record.openingMode==='previous'?previous?.creditCents||0:0;
    const known=openingKnown&&paidKnown;
    const grossCents=known?add([openingCents,record.spendCents,record.costCents]):null;
    const creditAppliedCents=known?Math.min(openingCreditCents,grossCents):null;
    const totalCents=known?grossCents-creditAppliedCents:null;
    const closingCents=known?Math.max(0,totalCents-paidCents):null;
    const creditCents=known?Math.max(0,openingCreditCents-grossCents)+Math.max(0,paidCents-totalCents):null;
    const baseline=previous?.known?previous.closingCents:openingCents;
    results.set(record.month,{...record,known,openingKnown,paidKnown,openingCents,openingCreditCents,grossCents,creditAppliedCents,totalCents,paidCents,appliedPaidCents:known?Math.min(paidCents,totalCents):null,closingCents,creditCents,pendingCents:payment.pendingCents,deltaCents:known?closingCents-baseline:null,baseline:previous?.known?'previous':'opening',hasRecord:true});
  }
  return results;
}
export function cardMonth(card,data,month){
  const results=calculateMonths(card,data,month);
  if(results.has(month))return results.get(month);
  const payment=cardPayments(card,data,month);
  return {month,known:false,hasRecord:false,paidCents:payment.paidCents,pendingCents:payment.pendingCents};
}

export function spendingBreakdown(result){
  if(!result.hasRecord)return [];
  const map={...result.breakdown},unallocated=result.spendCents-add(Object.values(map));
  if(unallocated)map.other=(map.other||0)+unallocated;
  return Object.entries(map).filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]);
}

export function calendarCardSuggestions(data,cards){
  const groups=new Map();
  for(const e of data.entries){
    if(e.type!=='expense'||e.category!=='card'||!e.bank)continue;
    const currency=e.currency||'TRY',key=e.bank+':'+currency;
    if(!cards.some(c=>c.bank===e.bank&&c.currency===currency))groups.set(key,{bank:e.bank,currency,name:BANKS[e.bank].name});
  }
  return [...groups.values()];
}

export function monthlyHistory(card,data,through,{all=false}={}){
  const dates=[...card.months.map(m=>m.month),...data.entries.filter(e=>e.type==='expense'&&e.category==='card'&&(e.currency||'TRY')===card.currency&&(card.paymentSource==='bank'?e.bank===card.bank:card.paymentSource==='links'&&card.linkedIds.includes(e.id))).map(e=>e.startDate.slice(0,7))].filter(m=>m<=through);
  if(!dates.length)return [];
  const first=dates.sort()[0],rows=[];
  let start=all?first:[first,shiftMonth(through,-11)].sort().at(-1);
  // Bounded even for a malformed or unusually old ledger; no fabricated records for missing months.
  if(shiftMonth(through,-599)>start)start=shiftMonth(through,-599);
  const calculated=calculateMonths(card,data,through);
  for(let month=start;month<=through;month=shiftMonth(month,1)){
    const payment=calculated.has(month)?null:cardPayments(card,data,month);
    rows.push(calculated.get(month)||{month,known:false,hasRecord:false,paidCents:payment.paidCents,pendingCents:payment.pendingCents});
  }
  return rows;
}
