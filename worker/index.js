import * as Model from '../public/model.js';
import * as Push from './webpush.js';
export const istanbulDate=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
export function dueReminders(rules,leadDays,now=Date.now()){
  const local=istanbulDate(now),from=Model.addDays(local,leadDays-2),to=Model.addDays(local,leadDays);
  return Model.occurrences(rules,from,to).filter(e=>!e.paid).map(e=>({...e,remindDate:Model.addDays(e.date,-leadDays)})).filter(e=>{
    const at=Date.parse(e.remindDate+'T09:00:00+03:00');return at<=now&&now-at<36*3600000;
  });
}
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const tokenOf=r=>r.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
const ready=env=>!!env.DB&&!!env.VAPID_PRIVATE_JWK&&!!env.VAPID_PUBLIC_KEY&&!!env.VAPID_SUBJECT;
async function status(env,id){const device=await env.DB.prepare('SELECT enabled, updated_at FROM push_devices WHERE id = ?').bind(id).first();const heartbeat=await env.DB.prepare("SELECT value FROM push_state WHERE key = 'last_dispatch'").first();return {exists:!!device,enabled:!!device?.enabled,syncedAt:device?.updated_at||null,schedulerStale:!heartbeat||Date.now()-Number(heartbeat.value)>3*3600000};}
async function bodyOf(request){const size=Number(request.headers.get('Content-Length')||0);if(size>2*1024*1024)throw new Error('Hatırlatma verisi çok büyük.');const text=await request.text();if(text.length>2*1024*1024)throw new Error('Hatırlatma verisi çok büyük.');return JSON.parse(text);}
async function recordTestResult(env,id,result){
  // Diagnostics never contain subscription URLs, cryptographic keys or financial data.
  const value={at:Date.now(),device:id.slice(0,8),...result};
  await env.DB.prepare("INSERT INTO push_state (key,value) VALUES ('last_test_result',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(value)).run();
  if(!result.ok)console.warn('push_test_failed',value);
}
async function testDevice(env,id){
  const now=Date.now();const row=await env.DB.prepare('SELECT * FROM push_devices WHERE id = ? AND enabled = 1').bind(id).first();if(!row)return json({error:'Önce bildirimleri aç.'},404);
      const claim=await env.DB.prepare('UPDATE push_devices SET last_test_at = ? WHERE id = ? AND last_test_at < ?').bind(now,id,now-60000).run();if(!claim.meta.changes)return json({error:'Test için bir dakika bekle.'},429);
      try{
        const r=await Push.sendPush(JSON.parse(row.subscription),{title:'HowMuchSpend',body:'Test bildirimi. Ödeme hatırlatmaların bu cihazda görünecek.',tag:'howmuchspend-test',url:'./'},env);
        if(!r.ok){const reason=await Push.providerReason(r);if([404,410].includes(r.status))await env.DB.prepare('UPDATE push_devices SET enabled = 0 WHERE id = ?').bind(id).run();
          await recordTestResult(env,id,{ok:false,stage:'provider',providerStatus:r.status,reason});
          await env.DB.prepare('UPDATE push_devices SET last_test_at = ? WHERE id = ?').bind(now-45000,id).run();
          return json({error:[404,410].includes(r.status)?'Abonelik sona ermiş. Bildirimleri kapatıp yeniden aç.':'Apple/bildirim servisi gönderimi reddetti: '+r.status+' · '+reason+'. Bu bir sunucu gönderim hatasıdır.'},502);
        }
        await recordTestResult(env,id,{ok:true,stage:'provider',providerStatus:r.status});return json({ok:true});
      }catch(e){const stage=e.stage||'server',causeName=/^[A-Za-z]{1,50}$/.test(e.causeName||'')?e.causeName:'Error';
        await recordTestResult(env,id,{ok:false,stage,reason:causeName,...(e.diagnostic?{diagnostic:e.diagnostic}:{})});
        await env.DB.prepare('UPDATE push_devices SET last_test_at = ? WHERE id = ?').bind(now-45000,id).run();
        return json({error:'Test gönderilemedi: '+stage+' · '+causeName+'. Telefon iznini tekrar açmana gerek yok.'},502);
      }
}
export async function dispatch(env,now=Date.now()){
  const {results}=await env.DB.prepare('SELECT * FROM push_devices WHERE enabled = 1 ORDER BY updated_at DESC LIMIT 500').all();
  let sent=0,failed=0;
  for(const device of results){
    const candidates=dueReminders(JSON.parse(device.rules),device.lead_days,now);
    let attempts=0;
    for(const e of candidates){
      if(attempts>=20)break;
      const claim=crypto.randomUUID();
      const leased=await env.DB.prepare(`INSERT INTO push_deliveries (device_id, occurrence_key, lead_days, state, claim, claim_until, attempts) VALUES (?, ?, ?, 'sending', ?, ?, 1) ON CONFLICT(device_id, occurrence_key, lead_days) DO UPDATE SET state = 'sending', claim = excluded.claim, claim_until = excluded.claim_until, attempts = push_deliveries.attempts + 1 WHERE push_deliveries.state != 'sent' AND push_deliveries.claim_until < ? AND push_deliveries.attempts < 5`).bind(device.id,e.key,device.lead_days,claim,now+120000,now).run();
      if(!leased.meta.changes)continue;attempts++;
      // Re-check current rules after the atomic claim: a payment/edit can cancel a queued reminder.
      const fresh=await env.DB.prepare('SELECT * FROM push_devices WHERE id = ? AND enabled = 1').bind(device.id).first();
      const current=fresh&&dueReminders(JSON.parse(fresh.rules),fresh.lead_days,now).find(x=>x.key===e.key);
      if(!current||fresh.lead_days!==device.lead_days){await env.DB.prepare('DELETE FROM push_deliveries WHERE device_id = ? AND occurrence_key = ? AND lead_days = ? AND claim = ?').bind(device.id,e.key,device.lead_days,claim).run();continue;}
      try{
        const label=Model.BANKS[current.bank]?.name||current.title;
        const dateLabel=current.date.split('-').reverse().join('.');
        const payload={title:current.type==='income'?'Gelir hatırlatması':'Ödeme hatırlatması',body:fresh.details?`${label} · ${Model.formatAmount(current.amountCents,current.currency)} · ${dateLabel}`:`${dateLabel} tarihli ${current.type==='income'?'beklenen gelirin':'bekleyen ödemen'} var.`,tag:await Push.hash(device.id+e.key+device.lead_days),url:'./?date='+current.date+'&entry='+encodeURIComponent(current.seriesId)};
        const response=await Push.sendPush(JSON.parse(fresh.subscription),payload,env);
        if(response.ok){await env.DB.prepare("UPDATE push_deliveries SET state = 'sent', sent_at = ?, last_error = NULL WHERE device_id = ? AND occurrence_key = ? AND lead_days = ? AND claim = ?").bind(now,device.id,e.key,device.lead_days,claim).run();sent++;}
        else {
          if([404,410].includes(response.status))await env.DB.prepare('UPDATE push_devices SET enabled = 0 WHERE id = ?').bind(device.id).run();
          await env.DB.prepare("UPDATE push_deliveries SET state = 'failed', claim_until = ?, last_error = ? WHERE device_id = ? AND occurrence_key = ? AND lead_days = ? AND claim = ?").bind(now+300000,'provider:'+response.status,device.id,e.key,device.lead_days,claim).run();failed++;
        }
      }catch{await env.DB.prepare("UPDATE push_deliveries SET state = 'failed', claim_until = ?, last_error = 'network' WHERE device_id = ? AND occurrence_key = ? AND lead_days = ? AND claim = ?").bind(now+300000,device.id,e.key,device.lead_days,claim).run();failed++;}
    }
  }
  await env.DB.prepare("INSERT INTO push_state (key, value) VALUES ('last_dispatch', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(String(now)).run();
  // Keep only recent deduplication rows; older occurrences cannot be due again.
  await env.DB.prepare('DELETE FROM push_deliveries WHERE sent_at < ?').bind(now-90*86400000).run();
  return {ok:failed===0,sent,failed};
}
export async function fetchHandler(request,env){
  const url=new URL(request.url);
  if(url.pathname.startsWith('/api/push/')){
    if(url.pathname==='/api/push/config'&&request.method==='GET'){const heartbeat=ready(env)?await env.DB.prepare("SELECT value FROM push_state WHERE key = 'last_dispatch'").first():null;return json({ready:ready(env),schedulerReady:!!heartbeat&&Date.now()-Number(heartbeat.value)<3*3600000,publicKey:env.VAPID_PUBLIC_KEY||null});}
    if(!ready(env))return json({error:'Bildirim sunucusu hazır değil.'},503);
    if(url.pathname==='/api/push/dispatch'&&request.method==='POST'){
      const bearer=request.headers.get('Authorization')?.replace(/^Bearer /,'');
      if(!await Push.verifySchedulerJWT(bearer,url.origin,env))return json({error:'Yetkisiz zamanlayıcı.'},401);
      const result=await dispatch(env);return json(result,result.failed?503:200);
    }
    // This shared updater is enabled only on the confirmed owner-private Site.
    // Sites validates/consumes its service credential before reaching this Worker.
    // Disable this integration before changing the Site's audience.
    if(['/api/push/private-dispatch','/api/push/private-test'].includes(url.pathname)){
      if(env.SITES_PRIVATE_SCHEDULER!=='1')return json({error:'Özel zamanlayıcı etkin değil.'},403);
      if(request.method!=='POST')return json({error:'POST gerekli.'},405);
      if(request.headers.has('Origin')&&request.headers.get('Origin')!==url.origin)return json({error:'Geçersiz kaynak.'},403);
      if(url.pathname==='/api/push/private-dispatch'){const result=await dispatch(env);return json(result,result.failed?503:200);}
      const {results}=await env.DB.prepare('SELECT id FROM push_devices WHERE enabled = 1 ORDER BY updated_at DESC LIMIT 20').all();
      if(!results.length)return json({error:'Etkin bildirim aboneliği yok.'},404);
      const resultsOut=[];for(const row of results){const response=await testDevice(env,row.id);resultsOut.push({status:response.status,...await response.json()});}
      return json({results:resultsOut},resultsOut.every(r=>r.ok)?200:502);
    }
    if(request.method!=='GET'&&request.headers.get('Origin')!==url.origin)return json({error:'Geçersiz kaynak.'},403);
    const token=tokenOf(request);if(!token)return json({error:'Cihaz kimliği eksik.'},401);const id=await Push.hash(token);
    if(url.pathname==='/api/push/device'){
      if(request.method==='GET')return json(await status(env,id));
      if(request.method==='DELETE'){await env.DB.batch([env.DB.prepare('DELETE FROM push_deliveries WHERE device_id = ?').bind(id),env.DB.prepare('DELETE FROM push_devices WHERE id = ?').bind(id)]);return json({ok:true});}
      if(request.method==='PUT'){
        try{
          const value=await bodyOf(request);if(![0,1,3,7].includes(value.leadDays)||typeof value.details!=='boolean')throw new Error('Geçersiz hatırlatma ayarı.');
          const rules=Model.validateData(value.rules);if(rules.entries.length>1000)throw new Error('En fazla 1.000 hatırlatma serisi destekleniyor.');
          // Reject projections containing notes; do not retain the user's full financial ledger.
          for(const e of rules.entries){e.notes='';for(const o of Object.values(e.overrides))o.notes='';if(!value.details){e.title=e.type==='income'?'Beklenen gelir':'Ödeme';e.amountCents=1;e.bank='';for(const o of Object.values(e.overrides)){o.title=e.title;o.amountCents=1;o.bank='';}}}
          const subscription=await Push.validateSubscription(value.subscription),now=Date.now();
          await env.DB.prepare(`INSERT INTO push_devices (id, subscription, rules, lead_days, details, enabled, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?) ON CONFLICT(id) DO UPDATE SET subscription = excluded.subscription, rules = excluded.rules, lead_days = excluded.lead_days, details = excluded.details, enabled = 1, updated_at = excluded.updated_at`).bind(id,JSON.stringify(subscription),JSON.stringify(rules),value.leadDays,value.details?1:0,now).run();
          return json(await status(env,id));
        }catch(e){return json({error:e.message||'Hatırlatma kaydedilemedi.'},400);}
      }
    }
    if(url.pathname==='/api/push/test'&&request.method==='POST')return testDevice(env,id);
    return json({error:'Bulunamadı.'},404);
  }
  return serveAsset(request,url);
}
export function serveAsset(request,url){
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  const path=url.pathname==='/'?'/index.html':url.pathname;
  const asset=globalThis.__HMS_ASSETS?.[path];if(!asset)return new Response('Not found',{status:404});
  const headers={'Content-Type':asset.type,'X-Content-Type-Options':'nosniff','Cache-Control':path==='/sw.js'||path==='/release.json'||path==='/index.html'?'no-store':url.searchParams.has('v')?'public, max-age=31536000, immutable':'public, max-age=3600'};
  if(path==='/sw.js')headers['Service-Worker-Allowed']='/';
  return new Response(request.method==='HEAD'?null:Push.unb64(asset.body),{headers});
}
export default {async fetch(request,env){try{return await fetchHandler(request,env)}catch{return json({error:'Sunucu geçici olarak yanıt veremiyor.'},500);}},async scheduled(controller,env,ctx){ctx.waitUntil(dispatch(env));}};
