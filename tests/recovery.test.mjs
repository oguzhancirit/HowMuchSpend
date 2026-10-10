import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarBudget,validateRecovery,validateCard,emptyRecovery,simulate,paymentForTarget} from '../public/recovery-model.js';
const card=(over={})=>({id:'akbank',name:'Akbank',bank:'akbank',linkedId:'card-entry',snapshotMonth:'2026-10',kind:'statement',statementCents:7600000,balanceCents:7600000,minimumCents:1520000,currentPaymentCents:2300000,costCents:342000,costIncluded:true,monthlyRate:4.5,minimumRate:20,newSpendCents:0,installmentCents:0,installmentMonths:0,history:[{month:'2026-10',costCents:342000}],...over});
test('23k vs 27k produces calculated 4 vs 3 cycles; current costs are not charged twice',()=>{
  const before=JSON.stringify(card()),old=simulate([card()],2300000),p=simulate([card()],2700000);
  assert.equal(old.months,4);assert.equal(p.months,3);assert.equal(p.rows[0].costCents,0);assert.equal(p.rows[0].balanceCents,4900000);
  assert.equal(p.rows[1].costCents,220500);assert.equal(p.rows[1].balanceCents,2420500);
  assert.equal(p.rows[2].costCents,108923);assert.equal(p.rows[2].paymentCents,2529423);assert.equal(p.totalCostCents,329423);
  assert.ok(p.totalCostCents<old.totalCostCents);assert.equal(JSON.stringify(card()),before);
});
test('Never recommends paying below any card minimum; all minimums are funded before priority extras',()=>{
  const low=card({id:'low',minimumCents:100000,monthlyRate:1}),high=card({id:'high',minimumCents:200000,monthlyRate:5});
  const deficit=simulate([low,high],299999);assert.equal(deficit.status,'shortfall');assert.equal(deficit.shortfallCents,1);assert.equal(deficit.rows.length,0);
  const p=simulate([low,high],500000);const a=p.rows[0].allocation;
  assert.equal(a.find(x=>x.id==='low').paymentCents,100000);assert.equal(a.find(x=>x.id==='high').paymentCents,400000);
});
test('Snowball prioritizes the smaller balance, with the other minimum preserved and closed card funds reused',()=>{
  const small=card({id:'small',balanceCents:100000,statementCents:100000,minimumCents:20000,costCents:0,monthlyRate:1}),big=card({id:'big',balanceCents:500000,statementCents:500000,minimumCents:100000,costCents:0,monthlyRate:5});
  const p=simulate([big,small],300000,{strategy:'snowball'});assert.equal(p.rows[0].allocation.find(c=>c.id==='small').paymentCents,100000);assert.equal(p.rows[0].allocation.find(c=>c.id==='big').paymentCents,200000);assert.equal(p.rows[1].allocation.find(c=>c.id==='small').paymentCents,0);
});
test('Future installment principal enters only on maturity; target cannot claim closure before final installment',()=>{
  const c=card({balanceCents:100000,statementCents:100000,minimumCents:20000,costCents:0,monthlyRate:0,installmentCents:50000,installmentMonths:3});
  const p=simulate([c],200000);assert.equal(p.months,4);assert.deepEqual(p.rows.map(r=>r.chargesCents),[0,50000,50000,50000]);assert.equal(paymentForTarget([c],3),null);
});
test('New spending can prevent sustainable closure even after initial balance is paid; no invented payoff date',()=>{
  const c=card({balanceCents:100000,statementCents:100000,minimumCents:20000,costCents:0,monthlyRate:0,newSpendCents:200000});
  const p=simulate([c],100000);assert.notEqual(p.status,'closed');assert.equal(p.months,undefined);
});
test('Carried fees are never used as an interest base',()=>{
  const c=card({balanceCents:100000,statementCents:100000,minimumCents:1000,costCents:80000,costIncluded:true,monthlyRate:10,minimumRate:1});
  const p=simulate([c],1100,{maxMonths:2});assert.equal(p.rows[1].costCents,2000);
});
test('Three-month target is the minimum integer-cent feasible payment and respects modeled minimums',()=>{
  const n=paymentForTarget([card()],3);assert.ok(n>2300000&&n<=2700000);
  const p=simulate([card()],n);assert.equal(p.status,'closed');assert.ok(p.months<=3);const lower=simulate([card()],n-1);assert.ok(lower.status!=='closed'||lower.months>3);
});
test('Calendar budget excludes only linked TRY card payments, includes unmatched cards and excludes FX without converting',()=>{
  const entry=(id,type,amount,category='card',currency='TRY')=>({id,type,amountCents:amount,currency,category,title:id,bank:'',notes:'',startDate:'2026-10-01',recurrence:'monthly',count:null,endDate:null,paidDates:[],skips:[],overrides:{}});
  const data={entries:[entry('salary','income',8000000,'salary'),entry('card-entry','expense',2300000),entry('other-card','expense',500000),entry('rent','expense',4300000,'home'),entry('euro','income',100000,'salary','EUR')]};
  const raw=JSON.stringify(data),b=calendarBudget(data,[card()],'2026-10');assert.equal(b.incomeCents,8000000);assert.equal(b.expenseCents,4800000);assert.equal(b.excludedCents,2300000);assert.equal(b.foreign,1);assert.equal(JSON.stringify(data),raw);
  data.entries.find(e=>e.id==='card-entry').paidDates=['2026-10-01'];const afterPayment=calendarBudget(data,[card()],'2026-10');assert.equal(afterPayment.expenseCents,7100000);assert.equal(afterPayment.excludedCents,0);
});
test('Recovery validation prevents corrupt records and duplicate links; round trip keeps costs and leaves unknown data out',()=>{
  const good={...emptyRecovery(),cards:[card()]};assert.deepEqual(validateRecovery(JSON.parse(JSON.stringify(good))),good);
  for(const mutation of [{balanceCents:-1},{minimumCents:8000000},{monthlyRate:NaN},{installmentMonths:-1},{kind:'minimum',statementCents:100000},{costCents:8000000}])assert.throws(()=>validateCard(card(mutation)));
  assert.throws(()=>validateRecovery({...good,cards:[card(),card({id:'second'})]}));
});
