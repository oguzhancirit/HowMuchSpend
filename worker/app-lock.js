// Keep certificate/parser initialization off the normal calendar/push path.
let verificationLibrary;
const loadVerification=()=>verificationLibrary??=import('./passkey-verifier.js');

// This is a secondary app lock. Sites remains the identity/access authority.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
const hash=async value=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
const toB64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const fromB64=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),x=>x.charCodeAt(0));
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
async function readBody(request){
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))throw fail('JSON gerekli.',415);
  if(Number(request.headers.get('Content-Length')||0)>65536)throw fail('İstek çok büyük.',413);
  const reader=request.body?.getReader();if(!reader)throw fail('İstek gövdesi gerekli.');
  let size=0;const chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw fail('İstek çok büyük.',413);}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let i=0;for(const chunk of chunks){bytes.set(chunk,i);i+=chunk.length;}
  try{const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw fail('Geçersiz JSON.');}
}
async function consume(db,id,user,purpose,origin,now){
  // A challenge can be consumed only once, including invalid signature attempts.
  const row=await db.prepare('DELETE FROM app_lock_challenges WHERE id = ? AND user_id = ? AND purpose = ? AND origin = ? AND expires_at > ? RETURNING challenge').bind(id,user,purpose,origin,now).first();
  if(!row)throw fail('Doğrulama süresi doldu. Tekrar dene.');return row.challenge;
}
export async function lockHandler(request,env){
  const url=new URL(request.url),origin=url.origin;
  if(request.method!=='POST')return json({error:'POST gerekli.'},405);
  if(request.headers.get('Origin')!==origin)return json({error:'Geçersiz kaynak.'},403);
  const user=request.headers.get('oai-authenticated-user-id');
  if(!user)return json({error:'Oturumunu yenilemek için ChatGPT ile tekrar giriş yap.'},401);
  if(!env.DB)return json({error:'Kilit sunucusu hazır değil.'},503);
  try{
    const input=await readBody(request),token=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if(!token)return json({error:'Bu cihazın kilit anahtarı eksik.'},401);
    const id=await hash(token),now=Date.now(),db=env.DB;
    const device=await db.prepare('SELECT * FROM app_lock_devices WHERE id = ?').bind(id).first();
    if(device&&(device.user_id!==user||device.origin!==origin))return json({error:'Bu kilit farklı bir oturuma ait.'},403);
    const route=url.pathname.slice('/api/app-lock/'.length);
    if(route==='status')return json({enrolled:device?.enabled===1,cleared:device?.enabled===0});
    if(route==='options'){
      const purpose=input.purpose;
      if(!['register','unlock','disable'].includes(purpose))throw fail('Geçersiz işlem.');
      if(purpose==='register'&&device?.enabled===1)throw fail('Bu cihazda kilit zaten etkin.',409);
      if(purpose!=='register'&&device?.enabled!==1)throw fail('Kilit kaydı bulunamadı. Kurtarma kodunu kullan.',404);
      const recent=await db.prepare('SELECT created_at FROM app_lock_challenges WHERE id = ?').bind(id).first();
      if(recent&&now-recent.created_at<1000)throw fail('Bir saniye sonra tekrar dene.',429);
      const stored=device?.enabled===1?JSON.parse(device.credential):null;
      const {generateRegistrationOptions,generateAuthenticationOptions}=await loadVerification();
      const options=purpose==='register'?await generateRegistrationOptions({rpName:'DebTracker',rpID:url.hostname,userName:'DebTracker kişisel alan',userID:new TextEncoder().encode(id),attestationType:'none',supportedAlgorithmIDs:[-7],authenticatorSelection:{residentKey:'required',userVerification:'required',authenticatorAttachment:'platform'}}):await generateAuthenticationOptions({rpID:url.hostname,userVerification:'required',allowCredentials:[{id:stored.id,transports:stored.transports}]});
      await db.batch([
        db.prepare('DELETE FROM app_lock_challenges WHERE expires_at < ?').bind(now),
        db.prepare('INSERT INTO app_lock_challenges (id,user_id,purpose,challenge,origin,expires_at,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,purpose=excluded.purpose,challenge=excluded.challenge,origin=excluded.origin,expires_at=excluded.expires_at,created_at=excluded.created_at').bind(id,user,purpose,options.challenge,origin,now+120000,now)
      ]);
      return json({options});
    }
    if(route==='register'){
      if(device?.enabled===1)throw fail('Bu cihazda kilit zaten etkin.',409);
      if(!/^[a-f0-9]{32}$/.test(input.recoveryCode||''))throw fail('Geçerli kurtarma kodu gerekli.');
      const challenge=await consume(db,id,user,'register',origin,now);
      const {verifyRegistrationResponse}=await loadVerification();
      let result;try{result=await verifyRegistrationResponse({response:input.response,expectedChallenge:challenge,expectedOrigin:origin,expectedRPID:url.hostname,requireUserVerification:true,supportedAlgorithmIDs:[-7]});}catch{throw fail('Geçiş anahtarı doğrulanamadı.');}
      if(!result.verified||!result.registrationInfo)throw fail('Geçiş anahtarı doğrulanamadı.');
      const c=result.registrationInfo.credential;
      const credential={id:c.id,publicKey:toB64(c.publicKey),counter:c.counter,transports:c.transports};
      const created=await db.prepare('INSERT INTO app_lock_devices (id,user_id,credential,recovery_hash,origin,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET credential=excluded.credential,recovery_hash=excluded.recovery_hash,enabled=1,updated_at=excluded.updated_at WHERE app_lock_devices.enabled=0').bind(id,user,JSON.stringify(credential),await hash(input.recoveryCode),origin,now).run();
      if(!created.meta.changes)throw fail('Bu cihazda kilit zaten etkin.',409);
      return json({ok:true});
    }
    if(route==='verify'){
      if(device?.enabled!==1)throw fail('Kilit kaydı bulunamadı. Kurtarma kodunu kullan.',404);
      const purpose=input.purpose;if(!['unlock','disable'].includes(purpose))throw fail('Geçersiz işlem.');
      const challenge=await consume(db,id,user,purpose,origin,now),stored=JSON.parse(device.credential);
      const {verifyAuthenticationResponse}=await loadVerification();
      let result;try{result=await verifyAuthenticationResponse({response:input.response,expectedChallenge:challenge,expectedOrigin:origin,expectedRPID:url.hostname,requireUserVerification:true,credential:{...stored,publicKey:fromB64(stored.publicKey)}});}catch{throw fail('Kimliğin doğrulanamadı. Tekrar dene.',401);}
      if(!result.verified)throw fail('Kimliğin doğrulanamadı.',401);
      if(purpose==='disable')await db.prepare("UPDATE app_lock_devices SET enabled=0,credential='',recovery_hash='',updated_at=? WHERE id = ? AND user_id = ?").bind(now,id,user).run();
      else {stored.counter=result.authenticationInfo.newCounter;await db.prepare('UPDATE app_lock_devices SET credential = ?, updated_at = ? WHERE id = ? AND user_id = ?').bind(JSON.stringify(stored),now,id,user).run();}
      return json({ok:true});
    }
    if(route==='recover'){
      const code=(input.recoveryCode||'').replace(/[\s-]/g,'').toLowerCase();
      if(!/^[a-f0-9]{32}$/.test(code))throw fail('Kurtarma kodunu kontrol et.',401);
      const result=await db.prepare("UPDATE app_lock_devices SET enabled=0,credential='',recovery_hash='',updated_at=? WHERE id = ? AND user_id = ? AND origin = ? AND recovery_hash = ? AND enabled=1").bind(now,id,user,origin,await hash(code)).run();
      // An absent registration must never silently unlock the browser.
      if(!result.meta.changes)throw fail('Kurtarma kodunu kontrol et.',401);
      await db.prepare('DELETE FROM app_lock_challenges WHERE id = ?').bind(id).run();
      return json({ok:true});
    }
    return json({error:'Bulunamadı.'},404);
  }catch(error){return json({error:error.status?error.message:'Kilit sunucusuna ulaşılamadı. Tekrar dene.'},error.status||503);}
}
