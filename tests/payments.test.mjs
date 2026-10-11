import test from 'node:test';
import assert from 'node:assert/strict';
import {blank,setPaid,occurrences} from '../public/model.js';
import {validatePayments,cardMonth,cardPayments,spendingBreakdown,monthlyHistory,calendarCardSuggestions,debtChangeBreakdown} from '../public/payments-model.js';

const row=(month,fields={})=>({month,openingMode:'manual',openingCents:5000000,spendCents:1000000,costCents:100000,paidMode:'calendar',paidCents:0,breakdown:{food:600000},...fields});
const card=(fields={})=>({id:'akbank',name:'Akbank',bank:'akbank',currency:'TRY',paymentSource:'bank',linkedIds:[],months:[row('2026-10')],...fields});
const entry=(id,fields={})=>({id,type:'expense',category:'card',bank:'akbank',currency:'TRY',title:id,amountCents:2300000,startDate:'2026-10-05',recurrence:'monthly',count:null,endDate:null,paidDates:['2026-10-05'],skips:[],overrides:{},notes:'',...fields});
const ledger=(entries=[entry('payment')])=>({...blank(),entries});
const validate=cards=>validatePayments({schemaVersion:1,cards,updatedAt:null});

test('Monthly accounting balances carry + actual new spend + actual costs against payment and remaining debt',()=>{
  const r=cardMonth(card(),ledger(),'2026-10');assert.equal(r.totalCents,6100000);assert.equal(r.paidCents,2300000);assert.equal(r.closingCents,3800000);assert.equal(r.deltaCents,-1200000);assert.equal(r.grossCents,r.appliedPaidCents+r.closingCents+r.creditAppliedCents);
  assert.deepEqual(spendingBreakdown(r),[['food',600000],['other',400000]]);
});
test('A paid calendar entry alone does not establish a card debt or manufacture a trend',()=>{
  const r=cardMonth(card({months:[]}),ledger(),'2026-10');assert.equal(r.known,false);assert.equal(r.paidCents,2300000);assert.equal(r.closingCents,undefined);assert.equal(r.deltaCents,undefined);
});
test('Paid-state changes propagate to subsequent automatic carry without rewriting historical inputs',()=>{
  const c=card({months:[row('2026-10'),row('2026-11',{openingMode:'previous',openingCents:0,spendCents:0,costCents:0})]}),data=ledger(),original=JSON.stringify(c);
  assert.equal(cardMonth(c,data,'2026-11').openingCents,3800000);
  const unpaid=setPaid(data,occurrences(data,'2026-10-05','2026-10-05')[0],false);
  assert.equal(cardMonth(c,unpaid,'2026-11').openingCents,6100000);assert.equal(JSON.stringify(c),original);assert.deepEqual(data.entries[0].paidDates,['2026-10-05']);
});
test('Missing months interrupt carry and remain unknown until the user enters an actual opening amount',()=>{
  const c=card({months:[row('2026-10'),row('2026-12',{openingMode:'previous'})]});assert.equal(cardMonth(c,ledger(),'2026-12').known,false);
  c.months[1].openingMode='manual';assert.equal(cardMonth(c,ledger(),'2026-12').known,true);
  const history=monthlyHistory(c,ledger(),'2026-12');assert.equal(history.find(r=>r.month==='2026-11').hasRecord,false);assert.equal(history.find(r=>r.month==='2026-11').known,false);
});
test('Manual monthly payment replaces calendar totals, while undone calendar payments remain pending',()=>{
  const c=card({months:[row('2026-10',{paidMode:'manual',paidCents:1000000})]}),data=ledger([entry('payment'),entry('pending',{paidDates:[],amountCents:400000})]);
  assert.equal(cardMonth(c,data,'2026-10').paidCents,1000000);assert.equal(cardMonth(c,data,'2026-10').pendingCents,400000);assert.equal(cardPayments(c,data,'2026-10').paidCents,2300000);
});
test('Excess payment is kept as a card credit and applied exactly once in the next recorded month',()=>{
  const c=card({paymentSource:'none',months:[row('2026-10',{openingCents:100000,spendCents:0,costCents:0,paidMode:'manual',paidCents:150000}),row('2026-11',{openingMode:'previous',spendCents:30000,costCents:0,paidMode:'manual',paidCents:0}),row('2026-12',{openingMode:'previous',spendCents:40000,costCents:0,paidMode:'manual',paidCents:0})]});
  assert.equal(cardMonth(c,blank(),'2026-10').creditCents,50000);assert.equal(cardMonth(c,blank(),'2026-11').closingCents,0);assert.equal(cardMonth(c,blank(),'2026-11').creditCents,20000);
  const r=cardMonth(c,blank(),'2026-12');assert.equal(r.closingCents,20000);assert.equal(r.creditCents,0);assert.equal(r.grossCents,r.appliedPaidCents+r.closingCents+r.creditAppliedCents);
});
test('Cards, currencies, loans, unbanked purchases and skipped repeats are kept separate',()=>{
  const data=ledger([entry('payment'),entry('eur',{currency:'EUR'}),entry('other-bank',{bank:'ziraat'}),entry('loan',{category:'loan'}),entry('food',{category:'food'}),entry('skip',{skips:['2026-10-05']})]);
  assert.equal(cardPayments(card(),data,'2026-10').paidCents,2300000);
  const explicit=card({paymentSource:'links',linkedIds:['eur'],currency:'EUR'});assert.equal(cardPayments(explicit,data,'2026-10').paidCents,2300000);
});
test('Two cards at one bank require explicit unique bindings and cannot count one payment twice',()=>{
  assert.throws(()=>validate([card(),card({id:'second'})]),/birden fazla kart/);
  assert.throws(()=>validate([card({paymentSource:'links',linkedIds:['one']}),card({id:'second',paymentSource:'links',linkedIds:['one']})]),/iki karta/);
  const cards=validate([card({paymentSource:'links',linkedIds:['one']}),card({id:'second',paymentSource:'links',linkedIds:['two']})]).cards;
  const data=ledger([entry('one'),entry('two',{amountCents:1000000})]);assert.equal(cardPayments(cards[0],data,'2026-10').paidCents,2300000);assert.equal(cardPayments(cards[1],data,'2026-10').paidCents,1000000);
});
test('Backup validation rejects duplicate months, invalid amounts, category over-allocation and fabricated currencies',()=>{
  for(const c of [card({months:[row('2026-10'),row('2026-10')]}),card({months:[row('2026-10',{openingCents:-1})]}),card({months:[row('2026-10',{breakdown:{food:1000001}})]}),card({currency:'BTC'}),card({months:[row('2026-10',{breakdown:{card:1}})]})])assert.throws(()=>validate([c]));
  assert.deepEqual(validate([card()]).cards[0].months[0],row('2026-10'));
});
test('Calendar card suggestions never write financial data and group only known bank/currency pairs',()=>{
  const data=ledger([entry('one'),entry('two'),entry('eur',{currency:'EUR'}),entry('loan',{category:'loan',bank:'ziraat'}),entry('unknown',{bank:''})]),before=JSON.stringify(data);
  assert.equal(calendarCardSuggestions(data,[]).length,2);assert.equal(calendarCardSuggestions(data,[card()]).length,1);assert.equal(JSON.stringify(data),before);
});

test('Debt explanation reconciles to previous closing including a manual opening correction without changing inputs',()=>{
  const c=card({months:[row('2026-10'),row('2026-11',{openingCents:4000000,spendCents:500000,costCents:100000,paidMode:'manual',paidCents:1000000,breakdown:{}})]});
  const before=JSON.stringify(c),r=cardMonth(c,ledger(),'2026-11'),explanation=debtChangeBreakdown(r);
  assert.equal(explanation.baseline,'previous');assert.equal(explanation.baselineCents,3800000);
  assert.deepEqual(explanation.terms,[{kind:'opening-adjustment',amountCents:200000},{kind:'spend',amountCents:500000},{kind:'cost',amountCents:100000},{kind:'payment',amountCents:-1000000}]);
  assert.equal(explanation.deltaCents,-200000);assert.equal(explanation.baselineCents+explanation.deltaCents,3600000);assert.equal(JSON.stringify(c),before);
});
test('Explanation caps payment at actual debt and applies previous credit once, including zero gross debt',()=>{
  const c=card({paymentSource:'none',months:[row('2026-10',{openingCents:100000,spendCents:0,costCents:0,paidMode:'manual',paidCents:150000,breakdown:{}}),row('2026-11',{openingMode:'previous',spendCents:30000,costCents:0,paidMode:'manual',paidCents:0,breakdown:{}}),row('2026-12',{openingMode:'previous',spendCents:0,costCents:0,paidMode:'manual',paidCents:10000,breakdown:{}})]});
  const first=cardMonth(c,blank(),'2026-10');assert.equal(first.creditCents,50000);assert.equal(debtChangeBreakdown(first).deltaCents,-100000);
  const next=cardMonth(c,blank(),'2026-11');assert.equal(next.creditCents,20000);assert.equal(debtChangeBreakdown(next).deltaCents,0);assert.deepEqual(debtChangeBreakdown(next).terms,[{kind:'spend',amountCents:30000},{kind:'credit',amountCents:-30000}]);
  const last=cardMonth(c,blank(),'2026-12');assert.equal(last.creditCents,30000);assert.equal(debtChangeBreakdown(last).deltaCents,0);
});
test('Missing statement, gap in carry or missing payment source never produces a fabricated debt explanation',()=>{
  assert.equal(debtChangeBreakdown(cardMonth(card({months:[]}),ledger(),'2026-10')),null);
  assert.equal(debtChangeBreakdown(cardMonth(card({months:[row('2026-10'),row('2026-12',{openingMode:'previous'})]}),ledger(),'2026-12')),null);
  assert.equal(debtChangeBreakdown(cardMonth(card({paymentSource:'none'}),ledger(),'2026-10')),null);
});
test('Explanation remains balanced across rising/falling debt, carry, corrections and excess payments',()=>{
  for(let i=0;i<120;i++){
    const c=card({currency:i%2?'EUR':'TRY',paymentSource:'none',months:[row('2026-10',{openingCents:i*12345,spendCents:i*333,costCents:i*77,paidMode:'manual',paidCents:i*9876,breakdown:{}}),row('2026-11',{openingMode:i%3?'previous':'manual',openingCents:i*555,spendCents:i*3456,costCents:i*111,paidMode:'manual',paidCents:i*9876,breakdown:{}})]});
    const r=cardMonth(c,blank(),'2026-11'),b=debtChangeBreakdown(r);
    assert.equal(b.terms.reduce((n,t)=>n+t.amountCents,0),r.deltaCents);assert.equal(b.baselineCents+b.deltaCents,r.closingCents);assert.ok(r.closingCents>=0&&r.creditCents>=0);
  }
});
