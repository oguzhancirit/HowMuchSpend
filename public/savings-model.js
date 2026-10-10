import {CURRENCIES,occurrences,monthRange,shiftMonth,today,validDate} from './model.js?v=19';

export const SAVINGS_KEY='howmuchspend.savings.v1';
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const amount=(v,label)=>{assert(Number.isSafeInteger(v)&&v>=0&&v<=1e12,label+' geçersiz.');return v;};
export const savingMonth=v=>typeof v==='string'&&/^(19\d{2}|20\d{2}|21\d{2})-(0[1-9]|1[0-2])$/.test(v);
const distance=(a,b)=>(Number(b.slice(0,4))-Number(a.slice(0,4)))*12+Number(b.slice(5))-Number(a.slice(5));
export const emptySavings=()=>({schemaVersion:1,goal:null,contributions:[],updatedAt:null,resets:[]});
export function validateSavings(raw){
  assert(raw&&raw.schemaVersion===1&&Array.isArray(raw.contributions)&&raw.contributions.length<=3000,'Geçerli bir kumbara yedeği seç.');
  const next=emptySavings();
  if(raw.goal){const g=raw.goal;assert(typeof g.name==='string'&&g.name.trim().length>0&&g.name.length<=60,'Hedef adı gerekli.');assert(Object.hasOwn(CURRENCIES,g.currency),'Para birimi geçersiz.');assert(savingMonth(g.startMonth)&&(!g.endMonth||savingMonth(g.endMonth)&&g.endMonth>=g.startMonth),'Hedef ayını kontrol et.');assert(!g.endMonth||distance(g.startMonth,g.endMonth)<120,'Hedef ayı en fazla 10 yıl ileride olabilir.');assert(Number.isInteger(g.sharePercent)&&g.sharePercent>=1&&g.sharePercent<=100,'Birikim payı %1–100 arasında olmalı.');assert(Number.isInteger(g.horizonMonths)&&g.horizonMonths>=1&&g.horizonMonths<=120,'Simülasyon süresi 1–120 ay olmalı.');next.goal={name:g.name.trim(),currency:g.currency,targetCents:amount(g.targetCents,'Hedef'),initialCents:amount(g.initialCents,'Başlangıç birikimi'),reserveCents:amount(g.reserveCents,'Aylık güvenlik payı'),sharePercent:g.sharePercent,startMonth:g.startMonth,endMonth:g.endMonth||null,horizonMonths:g.horizonMonths};assert(next.goal.targetCents>0,'Hedef tutarı sıfırdan büyük olmalı.');}
  assert(next.goal||!raw.contributions.length,'Birikim kaydı için hedef gerekli.');
  const ids=new Set();next.contributions=raw.contributions.map(c=>{assert(c&&typeof c.id==='string'&&/^[\w-]{1,100}$/.test(c.id)&&!ids.has(c.id)&&savingMonth(c.month),'Birikim kaydı geçersiz veya tekrarlı.');ids.add(c.id);const n=amount(c.amountCents,'Birikim');assert(n>0,'Birikim tutarı sıfırdan büyük olmalı.');assert(!c.date||validDate(c.date)&&c.date.slice(0,7)===c.month,'Birikim tarihi geçersiz.');const currency=c.currency||next.goal.currency;assert(Object.hasOwn(CURRENCIES,currency)&&currency===next.goal.currency,'Birikim para birimi hedefle aynı olmalı.');return {id:c.id,month:c.month,amountCents:n,...(c.date?{date:c.date}:{}),currency};});
  assert(raw.resets===undefined||Array.isArray(raw.resets)&&raw.resets.length<=3000,'Sıfırlama kayıtları geçersiz.');next.resets=(raw.resets||[]).map(r=>{assert(r&&typeof r.id==='string'&&/^[\w-]{1,100}$/.test(r.id)&&!ids.has(r.id)&&validDate(r.date),'Sıfırlama kaydı geçersiz.');ids.add(r.id);const amountCents=amount(r.amountCents,'Sıfırlanan birikim');assert(amountCents>0,'Sıfırlama tutarı sıfırdan büyük olmalı.');return {id:r.id,date:r.date,amountCents};});assert(next.goal||!next.resets.length,'Sıfırlama için hedef gerekli.');for(const month of [...new Set(next.resets.map(r=>r.date.slice(0,7)))])assert(savedBalance(next,month)>=0,'Sıfırlama tutarı birikimi aşamaz.');
  next.updatedAt=typeof raw.updatedAt==='string'?raw.updatedAt:null;return next;
}
export function savedBalance(state,through=today().slice(0,7)){return (state.goal?.initialCents||0)+state.contributions.filter(c=>c.month<=through).reduce((s,c)=>s+c.amountCents,0)-(state.resets||[]).filter(r=>r.date.slice(0,7)<=through).reduce((s,r)=>s+r.amountCents,0);}
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


export const savingsToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function contributionOccurrences(state,month){
  if(!state.goal)return [];
  return state.contributions.filter(c=>c.month===month).map(c=>({key:'savings-'+c.id+'@'+(c.date||c.month+'-01'),seriesId:'savings-'+c.id,date:c.date||c.month+'-01',title:'Kumbaraya aktarıldı',amountCents:c.amountCents,currency:c.currency||state.goal.currency,type:'expense',category:'other',bank:'',notes:state.goal.name,recurrence:'none',paid:true,savings:true}));
}
export function monthlySavings(data,raw,month=savingsToday().slice(0,7)){
  const state=validateSavings(raw),g=state.goal;assert(savingMonth(month),'Ay geçersiz.');if(!g)return null;
  const actualCents=savedBalance(state,month),carriedCents=savedBalance(state,shiftMonth(month,-1));
  const depositedCents=state.contributions.filter(c=>c.month===month).reduce((s,c)=>s+c.amountCents,0),resetCents=state.resets.filter(r=>r.date.slice(0,7)===month).reduce((s,r)=>s+r.amountCents,0);
  const remainingCents=Math.max(0,g.targetCents-actualCents),budget=savingsBudget(data,month,g.currency,g.reserveCents,depositedCents),beforeDepositCapacity=Math.max(0,budget.netCents-g.reserveCents);
  const normal=Math.floor(beforeDepositCapacity/100)*g.sharePercent+Math.floor((beforeDepositCapacity%100)*g.sharePercent/100);
  const months=g.endMonth&&g.endMonth>=month?distance(month,g.endMonth)+1:0;
  const needed=months?Math.ceil((remainingCents+depositedCents)/months):0;
  const monthlyTargetCents=Math.min(beforeDepositCapacity,Math.max(normal,needed)),recommendedCents=month<g.startMonth?0:Math.min(remainingCents,budget.capacityCents,Math.max(0,monthlyTargetCents-depositedCents));
  return {...budget,actualCents,carriedCents,depositedCents,resetCents,remainingCents,monthlyTargetCents,recommendedCents,complete:remainingCents===0};
}
