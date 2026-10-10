export const SCHEMA = 1;
export const CURRENCIES = { TRY: 'TL', EUR: 'EUR', USD: 'USD' };
export const formatAmount = (cents,currency='TRY') => new Intl.NumberFormat('tr-TR',{minimumFractionDigits:cents%100?2:0,maximumFractionDigits:cents%100?2:0}).format(cents/100)+' '+CURRENCIES[currency];
export const inCurrency = (items,currency='TRY') => items.filter(e=>(e.currency||'TRY')===currency);
export const BANKS = {
  ziraat: { name: 'Ziraat', emoji: '🌾', short: 'Z', color: '#ee655b' },
  yapikredi: { name: 'Yapı Kredi', emoji: '🔵', short: 'Y', color: '#568eff' },
  akbank: { name: 'Akbank', emoji: '🔴', short: 'A', color: '#ff576f' },
};
export const CATEGORIES = {
  card: { name: 'Kredi kartı', emoji: '💳', color: '#a29afe', type: 'expense' },
  home: { name: 'Ev & kira', emoji: '🏠', color: '#efb878', type: 'expense' },
  bill: { name: 'Faturalar', emoji: '💡', color: '#f0d46d', type: 'expense' },
  food: { name: 'Yeme & içme', emoji: '☕', color: '#e49aaf', type: 'expense' },
  shopping: { name: 'Alışveriş', emoji: '🛍️', color: '#88b3f9', type: 'expense' },
  transport: { name: 'Ulaşım', emoji: '🚗', color: '#7dcecf', type: 'expense' },
  subscription: { name: 'Abonelik', emoji: '↻', color: '#b1a0e0', type: 'expense' },
  loan: { name: 'Kredi', emoji: '🏦', color: '#a9b6d8', type: 'expense' },
  health: { name: 'Sağlık', emoji: '🌿', color: '#9ad8a1', type: 'expense' },
  other: { name: 'Diğer gider', emoji: '•••', color: '#98a4b8', type: 'expense' },
  salary: { name: 'Maaş', emoji: '💼', color: '#81d9ba', type: 'income' },
  rent: { name: 'Kira geliri', emoji: '🏡', color: '#78caca', type: 'income' },
  freelance: { name: 'Ek gelir', emoji: '✨', color: '#a4d59b', type: 'income' },
  otherincome: { name: 'Diğer gelir', emoji: '↙', color: '#a8cebb', type: 'income' },
};
export const REPEAT = { none: 'Tek sefer', monthly: 'Her ay', weekly: 'Her hafta', yearly: 'Her yıl' };
export const blank = () => ({ schemaVersion: SCHEMA, entries: [], updatedAt: null });
export const id = () => crypto.randomUUID();
export const iso = (y, m, d) => `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
export const today = () => { const d = new Date(); return iso(d.getFullYear(),d.getMonth()+1,d.getDate()); };
export const daysInMonth = (y,m) => new Date(Date.UTC(y,m,0)).getUTCDate();
export const validDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && (()=>{ const [y,m,d]=v.split('-').map(Number); return y>=1900 && y<=2199 && m>=1 && m<=12 && d>=1 && d<=daysInMonth(y,m); })();
export const addDays = (s,n) => { const [y,m,d]=s.split('-').map(Number); const t = new Date(Date.UTC(y,m-1,d+n)); return iso(t.getUTCFullYear(),t.getUTCMonth()+1,t.getUTCDate()); };
export const monthRange = m => [m+'-01', m+'-'+daysInMonth(+m.slice(0,4),+m.slice(5,7))];
export const shiftMonth = (m,n) => { const t=new Date(Date.UTC(+m.slice(0,4),+m.slice(5,7)-1+n,1)); return iso(t.getUTCFullYear(),t.getUTCMonth()+1,1).slice(0,7); };
export function parseAmount(value) {
  let s=String(value).trim().replace(/\s|₺|TL/gi,'');
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s=s.replace(/\./g,'').replace(',','.');
  else if (/^\d+(,\d{1,2})?$/.test(s)) s=s.replace(',','.');
  else if (!/^\d+\.\d{1,2}$/.test(s)) return null;
  const cents=Math.round(Number(s)*100);
  return Number.isSafeInteger(cents) && cents>0 && cents<=1e12 ? cents : null;
}
export function occurrenceDate(e,n) {
  const [y,m,startDay]=e.startDate.split('-').map(Number);
  const d=e.anchorDay||startDay;
  if(e.recurrence==='none') return n===0 ? e.startDate : null;
  if(e.recurrence==='weekly') return addDays(e.startDate,n*7);
  const t=new Date(Date.UTC(y+(e.recurrence==='yearly'?n:0),m-1+(e.recurrence==='monthly'?n:0),1));
  const yy=t.getUTCFullYear(), mm=t.getUTCMonth()+1;
  return iso(yy,mm,Math.min(d,daysInMonth(yy,mm)));
}
export function occurrences(data,from,to) {
  const result=[];
  for(const e of data.entries) {
    if(e.startDate>to || (e.endDate && e.endDate<from)) continue;
    const [sy,sm]=e.startDate.split('-').map(Number), [fy,fm]=from.split('-').map(Number);
    let n=0;
    if(e.recurrence==='monthly') n=Math.max(0,(fy-sy)*12+fm-sm-1);
    if(e.recurrence==='yearly') n=Math.max(0,fy-sy-1);
    if(e.recurrence==='weekly') n=Math.max(0,Math.floor((Date.parse(from+'T00:00:00Z')-Date.parse(e.startDate+'T00:00:00Z'))/604800000)-1);
    for(;n<(e.count||Infinity);n++) {
      const date=occurrenceDate(e,n);
      if(!date || date>to || (e.endDate && date>e.endDate)) break;
      if(date<from || e.skips.includes(date)) continue;
      const o=e.overrides[date]||{};
      result.push({...e,...o,date,seriesId:e.id,key:e.id+'@'+date,index:n,paid:e.paidDates.includes(date)});
    }
  }
  return result.sort((a,b)=>a.date.localeCompare(b.date)||a.type.localeCompare(b.type)||a.title.localeCompare(b.title,'tr'));
}
export function totals(list,currency='TRY') {
  list=inCurrency(list,currency);
  const t={income:0,expense:0,received:0,paid:0,pendingIncome:0,pendingExpense:0,net:0,actualNet:0};
  for(const o of list) { t[o.type]+=o.amountCents; if(o.paid) t[o.type==='income'?'received':'paid']+=o.amountCents; }
  t.pendingIncome=t.income-t.received; t.pendingExpense=t.expense-t.paid; t.net=t.income-t.expense; t.actualNet=t.received-t.paid;
  return t;
}
export function setPaid(data,occ,paid) {
  const copy=structuredClone(data), e=copy.entries.find(e=>e.id===occ.seriesId);
  e.paidDates=e.paidDates.filter(d=>d!==occ.date);
  if(paid)e.paidDates.push(occ.date);
  return copy;
}
export function editOccurrence(data,occ,changes,scope) {
  const copy=structuredClone(data), e=copy.entries.find(e=>e.id===occ.seriesId);
  const {paid,...fields}=changes;
  if(e.recurrence==='none') {
    Object.assign(e,fields); e.paidDates=paid?[e.startDate]:[];
    e.overrides={};e.skips=[];return copy;
  }
  if(scope==='one') {
    e.overrides[occ.date]={title:fields.title,amountCents:fields.amountCents,currency:fields.currency||occ.currency||'TRY',category:fields.category,bank:fields.bank,notes:fields.notes};
    e.paidDates=e.paidDates.filter(d=>d!==occ.date); if(paid)e.paidDates.push(occ.date);
    return copy;
  }
  // Split a series: past amounts and payment status stay exactly as recorded.
  const sameSchedule=fields.startDate===occ.date&&fields.recurrence===e.recurrence;
  const replacement={...e,...fields,id:id(),overrides:{},skips:sameSchedule?e.skips.filter(d=>d>=occ.date):[],paidDates:sameSchedule?e.paidDates.filter(d=>d>occ.date):[]};
  if(paid)replacement.paidDates.push(fields.startDate);
  if(['monthly','yearly'].includes(fields.recurrence)) replacement.anchorDay=sameSchedule?(e.anchorDay||+e.startDate.slice(-2)):+fields.startDate.slice(-2);
  else delete replacement.anchorDay;
  e.endDate=addDays(occ.date,-1);
  if(occ.index===0) copy.entries=copy.entries.filter(x=>x.id!==e.id);
  copy.entries.push(replacement);return copy;
}
export function removeOccurrence(data,occ,scope) {
  const copy=structuredClone(data), e=copy.entries.find(e=>e.id===occ.seriesId);
  if(e.recurrence==='none' || scope==='all')copy.entries=copy.entries.filter(x=>x.id!==e.id);
  else if(scope==='future')e.endDate=addDays(occ.date,-1);
  else if(!e.skips.includes(occ.date)) e.skips.push(occ.date);
  return copy;
}
const object=x=>x && typeof x==='object' && !Array.isArray(x);
const assert=(condition,msg)=>{if(!condition)throw new Error(msg)};
function textField(v,max,required=false) {assert(typeof v==='string' && v.length<=max && (!required||v.trim().length>0),'Metin alanı geçersiz.');return v;}
function validateFields(e,type,fallbackCurrency='TRY') {
  const currency=e.currency===undefined?fallbackCurrency:e.currency;
  assert(Object.hasOwn(CURRENCIES,currency),'Para birimi geçersiz.');
  assert(Number.isSafeInteger(e.amountCents)&&e.amountCents>0&&e.amountCents<=1e12,'Tutar geçersiz.');
  assert(Object.hasOwn(CATEGORIES,e.category)&&CATEGORIES[e.category].type===type,'Kategori geçersiz.');
  assert(e.bank===''||Object.hasOwn(BANKS,e.bank),'Banka geçersiz.');
  return {title:textField(e.title,100,true),amountCents:e.amountCents,currency,category:e.category,bank:e.bank,notes:textField(e.notes,1000)};
}
export function validateData(raw) {
  assert(object(raw)&&raw.schemaVersion===SCHEMA&&Array.isArray(raw.entries)&&raw.entries.length<=10000,'Geçerli bir HowMuchSpend yedeği seç.');
  const ids=new Set();
  const entries=raw.entries.map(e=>{
    assert(object(e)&&typeof e.id==='string'&&/^[\w-]{1,80}$/.test(e.id)&&!ids.has(e.id),'Kayıt kimliği geçersiz veya tekrarlı.');ids.add(e.id);
    assert(['expense','income'].includes(e.type),'Kayıt türü geçersiz.');
    assert(validDate(e.startDate)&&(!e.endDate||validDate(e.endDate)),'Tarih geçersiz.');
    assert(Object.hasOwn(REPEAT,e.recurrence),'Tekrar kuralı geçersiz.');
    assert(e.count===null||(Number.isInteger(e.count)&&e.count>=1&&e.count<=10000),'Tekrar sayısı geçersiz.');
    assert(e.anchorDay===undefined||(Number.isInteger(e.anchorDay)&&e.anchorDay>=1&&e.anchorDay<=31),'Tekrar günü geçersiz.');
    for(const key of ['skips','paidDates'])assert(Array.isArray(e[key])&&e[key].length<=20000&&e[key].every(validDate),'Ödeme tarihleri geçersiz.');
    assert(object(e.overrides)&&Object.keys(e.overrides).length<=20000,'Özel kayıtlar geçersiz.');
    const overrides={};for(const [date,o]of Object.entries(e.overrides)){assert(validDate(date)&&object(o),'Özel tarih geçersiz.');overrides[date]=validateFields(o,e.type,e.currency||'TRY');}
    return {id:e.id,type:e.type,...validateFields(e,e.type),startDate:e.startDate,endDate:e.endDate||null,recurrence:e.recurrence,count:e.count,...(e.anchorDay!==undefined?{anchorDay:e.anchorDay}:{}),skips:[...new Set(e.skips)],paidDates:[...new Set(e.paidDates)],overrides};
  });
  return {schemaVersion:SCHEMA,entries,updatedAt:typeof raw.updatedAt==='string'?raw.updatedAt:null};
}
export function demoData(month) {
  const d=blank(), add=(title,amount,day,type,category,bank='',paid=false,repeat='monthly')=>d.entries.push({id:id(),title,amountCents:amount*100,currency:'TRY',type,category,bank,notes:'Örnek kayıt',startDate:month+'-'+String(day).padStart(2,'0'),recurrence:repeat,endDate:null,count:null,paidDates:paid?[month+'-'+String(day).padStart(2,'0')]:[],overrides:{},skips:[]});
  add('Maaş',48000,1,'income','salary','',true);
  add('Akbank kart ödemesi',6400,5,'expense','card','akbank',true);
  add('Kahve molası',180,8,'expense','food','',true,'none');
  add('Ziraat kart ödemesi',3250,12,'expense','card','ziraat');
  add('Kira geliri',12000,15,'income','rent');
  add('Yapı Kredi kart ödemesi',4800,19,'expense','card','yapikredi');
  add('İnternet',590,22,'expense','bill');
  add('Ev kirası',16000,25,'expense','home');
  add('Müzik aboneliği',100,27,'expense','subscription');
  return d;
}

export const englishMonth=m=>new Intl.DateTimeFormat('en-US',{month:'long'}).format(new Date(m+'-01T12:00:00'));
