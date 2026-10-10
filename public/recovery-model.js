import {occurrences,monthRange,shiftMonth} from './model.js?v=20';
export const RECOVERY_SCHEMA=1;
const MAX=1e12;
export function cents(value,label='Tutar'){if(!Number.isSafeInteger(value)||value<0||value>MAX)throw Error(label+' geçersiz.');return value;}
const percent=(n,label)=>{if(!Number.isFinite(n)||n<0||n>100)throw Error(label+' 0–100 arasında olmalı.');return n;};
export const emptyRecovery=()=>({schemaVersion:1,cards:[],budget:null,strategy:'avalanche',targetCents:null});
export function validateCard(v){
  if(!v||typeof v.id!=='string'||!v.id||v.id.length>100)throw Error('Kart kimliği eksik.');
  const out={id:v.id,name:String(v.name||'').trim().slice(0,60),bank:['akbank','ziraat','yapikredi',''].includes(v.bank)?v.bank:'',linkedId:typeof v.linkedId==='string'?v.linkedId.slice(0,100):'',snapshotMonth:v.snapshotMonth,kind:v.kind,statementCents:cents(v.statementCents,'Ekstre'),balanceCents:cents(v.balanceCents,'Güncel borç'),minimumCents:cents(v.minimumCents,'Asgari'),currentPaymentCents:cents(v.currentPaymentCents,'Mevcut ödeme'),costCents:cents(v.costCents,'Faiz ve vergi'),costIncluded:!!v.costIncluded,monthlyRate:percent(v.monthlyRate,'Maliyet oranı'),minimumRate:percent(v.minimumRate,'Asgari oranı'),newSpendCents:cents(v.newSpendCents||0),installmentCents:cents(v.installmentCents||0),installmentMonths:v.installmentMonths||0,history:[]};
  if(!out.name||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(out.snapshotMonth)||!['minimum','statement'].includes(out.kind))throw Error('Kart adı, ayı veya ekstre türü eksik.');
  if(out.minimumRate<=0||!Number.isInteger(out.installmentMonths)||out.installmentMonths<0||out.installmentMonths>120)throw Error('Asgari oranını ve taksit süresini kontrol et.');
  if(out.minimumCents>out.balanceCents||out.costIncluded&&out.costCents>out.balanceCents)throw Error('Asgari/faiz, güncel borçtan büyük olamaz.');
  if(out.kind==='minimum'&&out.statementCents!==out.minimumCents)throw Error('Asgari olarak girilen tutar, asgari ödeme ile aynı olmalı.');
  if(out.kind==='statement'&&out.statementCents>out.balanceCents)throw Error('Dönem borcu, kalan güncel borçtan büyük. Ödeme yaptıysan kalan ekstre tutarını gir.');
  if(out.installmentCents>0&&out.installmentMonths===0)throw Error('Gelecek taksitlerin kaç ay süreceğini gir.');
  for(const h of v.history||[]){if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(h.month))throw Error('Geçmiş ay geçersiz.');out.history.push({month:h.month,costCents:cents(h.costCents)});}
  if(out.history.length>120||new Set(out.history.map(h=>h.month)).size!==out.history.length)throw Error('Faiz geçmişi geçersiz.');
  return out;
}
export function validateRecovery(v){
  if(!v||v.schemaVersion!==1||!Array.isArray(v.cards)||v.cards.length>20)throw Error('Kurtuluş yedeği geçersiz.');
  const out=emptyRecovery();out.cards=v.cards.map(validateCard);if(new Set(out.cards.map(c=>c.id)).size!==out.cards.length)throw Error('Tekrarlı kart kimliği.');
  const links=out.cards.map(c=>c.linkedId).filter(Boolean);if(new Set(links).size!==links.length)throw Error('Bir takvim kaydı iki karta bağlanamaz.');
  out.strategy=v.strategy==='snowball'?'snowball':'avalanche';out.targetCents=v.targetCents==null?null:cents(v.targetCents);
  if(v.budget){if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(v.budget.month))throw Error('Bütçe ayı geçersiz.');out.budget={month:v.budget.month,incomeCents:cents(v.budget.incomeCents),expenseCents:cents(v.budget.expenseCents),bufferCents:cents(v.budget.bufferCents),source:v.budget.source==='calendar'?'calendar':'manual'};}
  return out;
}
export function calendarBudget(data,cards,month){
  const linked=new Set(cards.map(c=>c.linkedId).filter(Boolean));
  const entries=occurrences(data,...monthRange(month));let incomeCents=0,expenseCents=0,excludedCents=0,foreign=0;
  for(const e of entries){if((e.currency||'TRY')!=='TRY'){foreign++;continue;}if(e.type==='income')incomeCents+=e.amountCents;else if(e.category==='card'&&linked.has(e.seriesId)&&!e.paid)excludedCents+=e.amountCents;else expenseCents+=e.amountCents;}
  return {month,incomeCents,expenseCents,excludedCents,foreign};
}
export const availableBudget=b=>b?Math.max(0,b.incomeCents-b.expenseCents-b.bufferCents):0;
export function simulate(cards,budgetCents,{strategy='avalanche',mode='fixed',maxMonths=120,startMonth='2026-01'}={}){
  cents(budgetCents,'Aylık bütçe');
  const states=cards.map(validateCard).map(c=>({...c,principal:c.balanceCents-(c.costIncluded?c.costCents:0),cost:c.costIncluded?c.costCents:0,closedMonth:null}));
  const rows=[];let totalCostCents=0,totalPaidCents=0;
  if(!states.length)return {status:'empty',months:0,rows,totalCostCents,totalPaidCents};
  for(let m=0;m<maxMonths;m++){
    let charges=0,costAdded=0;const openingCents=states.reduce((s,c)=>s+c.principal+c.cost,0);
    for(const c of states){
      // This statement's costs are already included. Future costs apply only to carried principal.
      // Never charge interest on unpaid interest/tax balances.
      if(m>0){const added=Math.round(c.principal*c.monthlyRate/100);c.cost+=added;costAdded+=added;
        const purchases=c.newSpendCents+(m<=c.installmentMonths?c.installmentCents:0);c.principal+=purchases;charges+=purchases;}
      c.before=c.principal+c.cost;c.min=m===0?Math.min(c.before,c.minimumCents):Math.min(c.before,Math.ceil(c.before*c.minimumRate/100));c.payment=0;
    }
    const requiredCents=states.reduce((s,c)=>s+c.min,0),capacity=mode==='minimum'?requiredCents:budgetCents;
    if(capacity<requiredCents)return {status:'shortfall',month:m+1,shortfallCents:requiredCents-capacity,requiredCents,budgetCents:capacity,rows,totalCostCents,totalPaidCents};
    let left=capacity;
    for(const c of states){c.payment=c.min;left-=c.min;}
    const order=[...states].sort((a,b)=>strategy==='snowball'?(a.before-b.before||b.monthlyRate-a.monthlyRate):(b.monthlyRate-a.monthlyRate||a.before-b.before));
    for(const c of order){const extra=Math.min(left,c.before-c.payment);c.payment+=extra;left-=extra;}
    const allocation=states.map(c=>{const feePaid=Math.min(c.cost,c.payment);c.cost-=feePaid;c.principal-=c.payment-feePaid;return {id:c.id,paymentCents:c.payment,minimumCents:c.min,balanceCents:c.principal+c.cost,costPaidCents:feePaid};});
    const balanceCents=allocation.reduce((s,c)=>s+c.balanceCents,0),paymentCents=allocation.reduce((s,c)=>s+c.paymentCents,0);
    totalCostCents+=costAdded;totalPaidCents+=paymentCents;
    rows.push({month:shiftMonth(startMonth,m),openingCents,chargesCents:charges,costCents:costAdded,paymentCents,balanceCents,unusedCents:left,allocation});
    for(const c of states){if(c.principal+c.cost>0)c.closedMonth=null;else if(m>=c.installmentMonths&&c.closedMonth===null)c.closedMonth=m+1;}
    if(balanceCents===0&&states.every(c=>m>=c.installmentMonths)&&(mode==='minimum'?states.every(c=>c.newSpendCents===0):capacity>=states.reduce((s,c)=>s+c.newSpendCents,0)))return {status:'closed',months:m+1,rows,totalCostCents,totalPaidCents,cards:states.map(c=>({id:c.id,closedMonth:c.closedMonth}))};
    if(balanceCents>MAX)break;
  }
  return {status:'horizon',months:null,rows,totalCostCents,totalPaidCents};
}
export function paymentForTarget(cards,months,options={}){
  if(!cards.length||cards.some(c=>c.installmentMonths>=months))return null;
  let low=0,high=cards.reduce((s,c)=>s+c.balanceCents+c.newSpendCents*months+c.installmentCents*c.installmentMonths,0);
  if(high>MAX)return null;
  const feasible=n=>{const p=simulate(cards,n,{...options,maxMonths:months});return p.status==='closed'&&p.months<=months;};
  if(!feasible(high))return null;
  while(low<high){const mid=Math.floor((low+high)/2);if(feasible(mid))high=mid;else low=mid+1;}
  return low;
}
