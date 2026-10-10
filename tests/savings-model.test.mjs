import test from 'node:test';
import assert from 'node:assert/strict';
import {blank,setPaid,occurrences} from '../public/model.js';
import {validateSavings,simulateSavings,savingsBudget} from '../public/savings-model.js';
const goal=(over={})=>({schemaVersion:1,goal:{name:'Kumbaram',currency:'TRY',targetCents:5000000,initialCents:0,reserveCents:0,sharePercent:20,startMonth:'2026-10',endMonth:null,horizonMonths:24,...over},contributions:[],updatedAt:null});
const entry=(id,type,amount,over={})=>({id,type,currency:'TRY',title:id,category:type==='income'?'salary':'card',bank:type==='income'?'':'akbank',notes:'',amountCents:amount,startDate:'2026-10-05',recurrence:'monthly',count:null,endDate:null,paidDates:[],skips:[],overrides:{},...over});
const data=()=>({...blank(),entries:[entry('income','income',3000000),entry('expense','expense',1500000)]});
const sim=(d,g)=>simulateSavings(d,g,{asOfMonth:'2026-10'});
test('50.000 TL target recommends 3.000 from 15.000 remainder and closes after 17 months without writes',()=>{
 const d=data(),g=goal(),before=JSON.stringify([d,g]),p=sim(d,g);assert.equal(p.rows[0].recommendedCents,300000);assert.equal(p.closingMonth,'2028-02');assert.equal(p.rows[16].recommendedCents,200000);assert.equal(p.rows[17].recommendedCents,0);assert.equal(p.actualCents,0);assert.equal(p.projectedCents,5000000);assert.equal(JSON.stringify([d,g]),before);
});
test('Monthly overrides, skips, reserves and expenses change recommendations; paid status does not double-count',()=>{
 const d=data();d.entries[0].overrides['2026-11-05']={amountCents:4000000};d.entries[1].skips=['2026-12-05'];const p=sim(d,goal({reserveCents:500000}));assert.deepEqual(p.rows.slice(0,3).map(r=>r.recommendedCents),[200000,400000,500000]);const paid=setPaid(d,occurrences(d,'2026-10-05','2026-10-05')[1],true);assert.equal(sim(paid,goal({reserveCents:500000})).rows[0].capacityCents,p.rows[0].capacityCents);
});
test('Deadline adapts to varying capacity, never recommends beyond it, and reports exact deficits',()=>{
 const d={...blank(),entries:[entry('oct','income',10000,{recurrence:'none'}),entry('nov','income',30000,{startDate:'2026-11-05',recurrence:'none'})]};const p=sim(d,goal({targetCents:30000,endMonth:'2026-11'}));assert.deepEqual(p.rows.map(r=>r.recommendedCents),[7500,22500]);assert.equal(p.closingMonth,'2026-11');assert.equal(p.rows[0].targetAdjustment,true);
 const q=sim(d,goal({targetCents:50000,endMonth:'2026-11'}));assert.equal(q.status,'shortfall');assert.equal(q.shortfallCents,10000);assert.deepEqual(q.rows.map(r=>r.recommendedCents),[10000,30000]);
});
test('Actual deposits are counted once and subtracted from that month’s extra capacity',()=>{
 const g=goal({initialCents:100000});g.contributions=[{id:'past',month:'2026-09',amountCents:200000},{id:'now',month:'2026-10',amountCents:300000}];const p=sim(data(),g);assert.equal(p.actualCents,600000);assert.equal(p.rows[0].capacityCents,1200000);assert.equal(p.rows[0].recommendedCents,240000);assert.equal(p.rows[0].balanceCents,840000);assert.equal(p.rows[1].alreadySavedCents,0);assert.equal(p.rows[1].capacityCents,1500000);
});
test('Empty and negative budgets recommend zero; currencies remain independent and no interest is invented',()=>{
 const d=data();d.entries.push(entry('eur','income',9999999,{currency:'EUR'}));assert.equal(savingsBudget(d,'2026-10','TRY').incomeCents,3000000);assert.equal(savingsBudget(d,'2026-10','TRY').foreign,1);assert.equal(sim(blank(),goal()).projectedCents,0);d.entries[1].amountCents=4000000;assert.equal(sim(d,goal()).rows[0].recommendedCents,0);assert.equal(sim(d,goal({currency:'USD'})).projectedCents,0);
});
test('Completed, past-deadline and future-start goals have correct boundaries',()=>{
 assert.equal(sim(data(),goal({initialCents:6000000})).status,'complete');assert.equal(sim(data(),goal({startMonth:'2026-01',endMonth:'2026-09'})).status,'past-deadline');assert.equal(sim(data(),goal({startMonth:'2027-01'})).rows[0].month,'2027-01');
});
test('Validation rejects malformed targets, impossible dates, repeated records and future actual deposits',()=>{
 for(const over of [{targetCents:0},{reserveCents:-1},{sharePercent:101},{endMonth:'2026-09'},{endMonth:'2036-10'},{horizonMonths:121},{currency:'GBP'}])assert.throws(()=>validateSavings(goal(over)));
 const g=goal();g.contributions=[{id:'dup',month:'2026-10',amountCents:1},{id:'dup',month:'2026-10',amountCents:2}];assert.throws(()=>validateSavings(g));g.contributions=[{id:'future',month:'2026-11',amountCents:100}];assert.throws(()=>sim(data(),g),/Gelecek/);
});
