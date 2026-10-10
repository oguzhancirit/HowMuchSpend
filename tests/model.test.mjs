import test from 'node:test';
import assert from 'node:assert/strict';
import { blank,formatAmount,inCurrency,parseAmount,occurrences,totals,setPaid,editOccurrence,removeOccurrence,validateData,shiftMonth,validDate } from '../public/model.js';
const entry=(overrides={})=>({id:'test-entry',type:'expense',title:'Test',amountCents:10001,currency:'TRY',category:'card',bank:'akbank',notes:'',startDate:'2026-01-31',recurrence:'monthly',count:null,endDate:null,paidDates:[],skips:[],overrides:{},...overrides});
const db=(...entries)=>({...blank(),entries});
const at=(data,date)=>occurrences(data,date,date)[0];
test('Turkish amounts use integer kuruş and reject malformed inputs',()=>{
  for(const [v,result]of [['1.250,50',125050],['1250,5',125050],['1.250',125000],['12.50',1250],['0,01',1],['25 ₺',2500],['1.000.000,99',100000099]])assert.equal(parseAmount(v),result,v);
  for(const v of ['-50','0','1,000,000','12.3456','NaN','','1e3','10abc','1.23.4'])assert.equal(parseAmount(v),null,v);
});
test('31st clamps to February then returns to March 31 without date drift',()=>{
  const rows=occurrences(db(entry()),'2026-01-01','2026-04-30');assert.deepEqual(rows.map(r=>r.date),['2026-01-31','2026-02-28','2026-03-31','2026-04-30']);
});
test('Leap-year yearly recurrence stays anchored to February 29',()=>{
  const rows=occurrences(db(entry({startDate:'2024-02-29',recurrence:'yearly'})),'2024-01-01','2028-12-31');assert.deepEqual(rows.map(r=>r.date),['2024-02-29','2025-02-28','2026-02-28','2027-02-28','2028-02-29']);
});
test('Weekly recurrence crosses years, includes end day, honors count',()=>{
  const data=db(entry({startDate:'2026-12-25',recurrence:'weekly',count:4,endDate:'2027-01-08'}));assert.deepEqual(occurrences(data,'2026-12-01','2027-02-28').map(e=>e.date),['2026-12-25','2027-01-01','2027-01-08']);
});
test('Far future monthly access is deterministic without duplicating saved entries',()=>{
  const data=db(entry());assert.equal(occurrences(data,'2036-01-01','2036-01-31').length,1);assert.equal(data.entries.length,1);assert.equal(occurrences(data,'2025-12-01','2025-12-31').length,0);
});
test('Paid status is independent for every occurrence and survives export/import',()=>{
  const original=db(entry()),jan=at(original,'2026-01-31');const paid=setPaid(original,jan,true);assert.equal(at(paid,'2026-01-31').paid,true);assert.equal(at(paid,'2026-02-28').paid,false);assert.equal(at(original,'2026-01-31').paid,false);
  const restored=validateData(JSON.parse(JSON.stringify(paid)));assert.equal(at(restored,'2026-01-31').paid,true);assert.equal(at(setPaid(restored,jan,false),'2026-01-31').paid,false);
});
test('Planned and realized net totals distinguish income and expenses',()=>{
  const data=db(entry({amountCents:10000,paidDates:['2026-01-31']}),entry({id:'income',type:'income',category:'salary',amountCents:20000,paidDates:['2026-01-31']}),entry({id:'pending',amountCents:4000}));
  assert.deepEqual(totals(occurrences(data,'2026-01-01','2026-01-31')),{income:20000,expense:14000,received:20000,paid:10000,pendingIncome:0,pendingExpense:4000,net:6000,actualNet:10000});
});
test('Changing one month leaves past and future values intact',()=>{
  const data=db(entry()),feb=at(data,'2026-02-28');const changed=editOccurrence(data,feb,{...entry(),amountCents:50000,paid:true},'one');assert.equal(at(changed,'2026-01-31').amountCents,10001);assert.equal(at(changed,'2026-02-28').amountCents,50000);assert.equal(at(changed,'2026-03-31').amountCents,10001);assert.equal(at(changed,'2026-02-28').paid,true);assert.equal(validateData(changed).entries.length,1);
});
test('Editing this and future repeats preserves past paid records and bounded remaining count',()=>{
  const data=db(entry({count:4,paidDates:['2026-01-31']})),mar=at(data,'2026-03-31');const changed=editOccurrence(data,mar,{...entry(),startDate:'2026-03-31',count:2,amountCents:25000,paid:false},'future');
  assert.equal(at(changed,'2026-01-31').paid,true);assert.equal(at(changed,'2026-02-28').amountCents,10001);assert.equal(at(changed,'2026-03-31').amountCents,25000);assert.equal(at(changed,'2026-04-30').amountCents,25000);assert.equal(at(changed,'2026-05-31'),undefined);assert.equal(validateData(changed).entries.length,2);
});
test('Changing a one-time entry to a monthly series sets paid only on first date',()=>{
  const data=db(entry({recurrence:'none'})),jan=at(data,'2026-01-31');const changed=editOccurrence(data,jan,{...entry(),paid:true},'one');assert.equal(at(changed,'2026-01-31').paid,true);assert.equal(at(changed,'2026-02-28').paid,false);
});
test('Deleting one occurrence skips only that date; future delete preserves history',()=>{
  const data=db(entry()),feb=at(data,'2026-02-28');const skip=removeOccurrence(data,feb,'one');assert.equal(at(skip,'2026-02-28'),undefined);assert.ok(at(skip,'2026-03-31'));const future=removeOccurrence(data,feb,'future');assert.ok(at(future,'2026-01-31'));assert.equal(at(future,'2026-02-28'),undefined);assert.equal(at(future,'2026-03-31'),undefined);assert.equal(removeOccurrence(data,feb,'all').entries.length,0);
});
test('Imports reject negative amounts, bad dates, duplicate IDs, prototype keys and unsupported versions',()=>{
  for(const bad of [db(entry({amountCents:-100})),db(entry({startDate:'2026-02-30'})),db(entry(),entry()),db(entry({category:'__proto__'})),db(entry({bank:'__proto__'})),db(entry({count:0})),{schemaVersion:8,entries:[]}])assert.throws(()=>validateData(bad));
  const extra={...db(entry()),password:'must not persist'};assert.equal(validateData(extra).password,undefined);
});
test('Validation round trip retains overrides, skips and cents',()=>{
  const data=db(entry({overrides:{'2026-02-28':{title:'Adjusted',amountCents:32001,currency:'TRY',category:'card',bank:'ziraat',notes:'Test'}},skips:['2026-03-31']}));assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))),data);
});
test('Date boundaries and month navigation are correct',()=>{
  assert.equal(shiftMonth('2026-12',1),'2027-01');assert.equal(shiftMonth('2026-01',-1),'2025-12');assert.equal(validDate('2024-02-29'),true);assert.equal(validDate('2026-02-29'),false);assert.equal(validDate('2026-00-10'),false);
});
test('Future edit in a short month preserves original day and prepaid future statuses',()=>{
  const data=db(entry({paidDates:['2026-03-31']})),feb=at(data,'2026-02-28');const changed=editOccurrence(data,feb,{...entry(),startDate:'2026-02-28',amountCents:22000,paid:false},'future');
  assert.equal(at(changed,'2026-03-31').amountCents,22000);assert.equal(at(changed,'2026-03-31').paid,true);assert.equal(at(changed,'2026-03-28'),undefined);assert.equal(at(validateData(changed),'2026-04-30').amountCents,22000);
});

test('Whole amounts have full Turkish grouping and explicit currency',()=>{
 assert.equal(formatAmount(100000),'1.000 TL');
 assert.equal(formatAmount(45900000),'459.000 TL');
 assert.equal(formatAmount(125050,'EUR'),'1.250,50 EUR');
 assert.equal(formatAmount(100000,'USD'),'1.000 USD');
});
test('Legacy installed-app data keeps IDs, statuses, schedules and overrides',()=>{
 const legacy=entry({paidDates:['2026-01-31'],skips:['2026-03-31'],overrides:{'2026-02-28':{title:'Legacy',amountCents:25000,category:'card',bank:'akbank',notes:''}}});delete legacy.currency;
 const migrated=validateData(db(legacy));
 assert.equal(migrated.entries[0].id,legacy.id);assert.equal(migrated.entries[0].currency,'TRY');assert.equal(at(migrated,'2026-01-31').paid,true);assert.equal(at(migrated,'2026-02-28').amountCents,25000);assert.equal(at(migrated,'2026-02-28').currency,'TRY');assert.equal(at(migrated,'2026-03-31'),undefined);
});
test('Currency totals never sum unlike currencies',()=>{
 const items=occurrences(db(entry({amountCents:100000}),entry({id:'eur',currency:'EUR',amountCents:25000}),entry({id:'usd',currency:'USD',amountCents:90000})),'2026-01-01','2026-01-31');
 assert.equal(totals(items).expense,100000);assert.equal(totals(items,'EUR').expense,25000);assert.equal(totals(items,'USD').expense,90000);assert.equal(inCurrency(items,'EUR').length,1);
});
test('Currency changes apply only to selected occurrence and survive backup',()=>{
 const source=db(entry());const updated=validateData(editOccurrence(source,at(source,'2026-02-28'),{...entry(),currency:'EUR',paid:false},'one'));
 assert.equal(at(updated,'2026-01-31').currency,'TRY');assert.equal(at(updated,'2026-02-28').currency,'EUR');assert.equal(at(updated,'2026-03-31').currency,'TRY');
 assert.throws(()=>validateData(db(entry({currency:'GBP'}))));
 const euro=db(entry({currency:'EUR',overrides:{'2026-02-28':{title:'Legacy override',amountCents:30000,category:'card',bank:'akbank',notes:''}}}));assert.equal(at(validateData(euro),'2026-02-28').currency,'EUR');
});
