import {CURRENCIES,occurrences,monthRange,shiftMonth,today} from './model.js?v=18';

export const SAVINGS_KEY='howmuchspend.savings.v1';
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const amount=(v,label)=>{assert(Number.isSafeInteger(v)&&v>=0&&v<=1e12,label+' geçersiz.');return v;};
export const savingMonth=v=>typeof v==='string'&&/^(19\d{2}|20\d{2}|21\d{2})-(0[1-9]|1[0-2])$/.test(v);
const distance=(a,b)=>(Number(b.slice(0,4))-Number(a.slice(0,4)))*12+Number(b.slice(5))-Number(a.slice(5));
export const emptySavings=()=>({schemaVersion:1,goal:null,contributions:[],updatedAt:null});
export function validateSavings(raw){
  assert(raw&&raw.schemaVersion===1&&Array.isArray(raw.contributions)&&raw.contributions.length<=3000,'Geçerli bir kumbara yedeği seç.');
  const next=emptySavings();
  if(raw.goal){const g=raw.goal;assert(typeof g.name==='string'&&g.name.trim().length>0&&g.name.length<=60,'Hedef adı gerekli.');assert(Object.hasOwn(CURRENCIES,g.currency),'Para birimi geçersiz.');assert(savingMonth(g.startMonth)&&(!g.endMonth||savingMonth(g.endMonth)&&g.endMonth>=g.startMonth),'Hedef ayını kontrol et.');assert(!g.endMonth||distance(g.startMonth,g.endMonth)<120,'En fazla 120 aylık simülasyon oluşturabilirsin.');assert(Number.isInteger(g.sharePercent)&&g.sharePercent>=1&&g.sharePercent<=100,'Birikim payı %1–100 arasında olmalı.');assert(Number.isInteger(g.horizonMonths)&&g.horizonMonths>=1&&g.horizonMonths<=120,'Simülasyon süresi 1–120 ay olmalı.');next.goal={name:g.name.trim(),currency:g.currency,targetCents:amount(g.targetCents,'Hedef'),initialCents:amount(g.initialCents,'Başlangıç birikimi'),reserveCents:amount(g.reserveCents,'Aylık güvenlik payı'),sharePercent:g.sharePercent,startMonth:g.startMonth,endMonth:g.endMonth||null,horizonMonths:g.horizonMonths};assert(next.goal.targetCents>0,'Hedef tutarı sıfırdan büyük olmalı.');}
  assert(next.goal||!raw.contributions.length,'Birikim kaydı için hedef gerekli.');
  const ids=new Set();next.contributions=raw.contributions.map(c=>{assert(c&&typeof c.id==='string'&&/^[\w-]{1,100}$/.test(c.id)&&!ids.has(c.id)&&savingMonth(c.month),'Birikim kaydı geçersiz veya tekrarlı.');ids.add(c.id);const n=amount(c.amountCents,'Birikim');assert(n>0,'Birikim tutarı sıfırdan büyük olmalı.');return {id:c.id,month:c.month,amountCents:n};});
  next.updatedAt=typeof raw.updatedAt==='string'?raw.updatedAt:null;return next;
}
export function savedBalance(state,through=today().slice(0,7)){return (state.goal?.initialCents||0)+state.contributions.filter(c=>c.month<=through).reduce((s,c)=>s+c.amountCents,0);}
export function savingsBudget(data,month,currency,reserveCents=0,alreadySavedCents=0){
  let incomeCents=0,expenseCents=0,foreign=0;
  for(const e of occurrences(data,...monthRange(month))){if((e.currency||'TRY')!==currency){foreign++;continue;}if(e.type==='income')incomeCents+=e.amountCents;else expenseCents+=e.amountCents;}
  assert(Number.isSafeInteger(incomeCents)&&Number.isSafeInteger(expenseCents),'Bütçe hesaplama sınırını aşıyor.');
  const netCents=incomeCents-expenseCents,capacityCents=Math.max(0,netCents-reserveCents-alreadySavedCents);
  return {month,incomeCents,expenseCents,netCents,reserveCents,alreadySavedCents,capacityCents,foreign};
}
export function simulateSavings(data,raw,{asOfMonth=today().slice(0,7)}={}){
  const state=validateSavings(raw),g=state.goal;assert(savingMonth(asOfMonth),'Simülasyon ayı geçersiz.');if(!g)return {status:'empty',rows:[]};assert(!state.contributions.some(c=>c.month>asOfMonth),'Gelecek aya gerçek birikim kaydı eklenemez.');
  const actualCents=savedBalance(state,asOfMonth),remainingCents=Math.max(0,g.targetCents-actualCents),startMonth=[g.startMonth,asOfMonth].sort().at(-1);
  if(!remainingCents)return {status:'complete',rows:[],actualCents,remainingCents,closingMonth:null,projectedCents:actualCents,shortfallCents:0};
  if(g.endMonth&&g.endMonth<startMonth)return {status:'past-deadline',rows:[],actualCents,remainingCents,closingMonth:null,projectedCents:actualCents,shortfallCents:remainingCents};
  const count=g.endMonth?distance(startMonth,g.endMonth)+1:g.horizonMonths,budgets=[];
  for(let i=0;i<count;i++){const month=shiftMonth(startMonth,i);if(!savingMonth(month))break;const deposits=state.contributions.filter(c=>c.month===month).reduce((s,c)=>s+c.amountCents,0);budgets.push(savingsBudget(data,month,g.currency,g.reserveCents,deposits));}
  let balance=actualCents,futureCapacity=budgets.reduce((s,b)=>s+b.capacityCents,0),closingMonth=null;assert(Number.isSafeInteger(futureCapacity),'Simülasyon hesaplama sınırını aşıyor.');
  const rows=budgets.map(b=>{
    const left=Math.max(0,g.targetCents-balance),base=Math.floor(b.capacityCents*g.sharePercent/100);
    // A date target adapts to different monthly capacities, never exceeding the available amount.
    const needed=g.endMonth&&futureCapacity?Math.ceil(left*(b.capacityCents/futureCapacity)):0;
    const recommendedCents=Math.min(left,b.capacityCents,Math.max(base,needed));futureCapacity-=b.capacityCents;
    const openingCents=balance;balance+=recommendedCents;if(balance>=g.targetCents&&!closingMonth)closingMonth=b.month;
    return {...b,openingCents,recommendedCents,balanceCents:balance,targetAdjustment:needed>base};
  });
  return {status:closingMonth?'projected-complete':g.endMonth?'shortfall':'horizon',rows,actualCents,remainingCents,closingMonth,projectedCents:balance,shortfallCents:Math.max(0,g.targetCents-balance)};
}
