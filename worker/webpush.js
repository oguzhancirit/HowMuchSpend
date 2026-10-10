const utf8=new TextEncoder();
export const bytes=s=>utf8.encode(s);
export const concat=(...parts)=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;};
export const b64=raw=>btoa(String.fromCharCode(...new Uint8Array(raw))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
export const unb64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));
export const hash=async s=>b64(await crypto.subtle.digest('SHA-256',bytes(s)));
async function hmac(key,input){const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,input));}
export async function encryptPayload(payload,keys,options={}){
  const receiver=unb64(keys.p256dh),auth=unb64(keys.auth);
  const pair=options.keyPair||await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const sender=new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey));
  const peer=await crypto.subtle.importKey('raw',receiver,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:peer},pair.privateKey,256));
  const prkKey=await hmac(auth,shared);
  const ikm=await hmac(prkKey,concat(bytes('WebPush: info\0'),receiver,sender,new Uint8Array([1])));
  const salt=options.salt||crypto.getRandomValues(new Uint8Array(16));
  const prk=await hmac(salt,ikm);
  const cek=(await hmac(prk,bytes('Content-Encoding: aes128gcm\0\x01'))).slice(0,16);
  const nonce=(await hmac(prk,bytes('Content-Encoding: nonce\0\x01'))).slice(0,12);
  const key=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['encrypt']);
  const plain=bytes(typeof payload==='string'?payload:JSON.stringify(payload));
  if(plain.length>3993)throw new Error('Push payload too large');
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},key,concat(plain,new Uint8Array([2]))));
  const header=new Uint8Array(5);new DataView(header.buffer).setUint32(0,4096);header[4]=65;
  return concat(salt,header,sender,encrypted);
}
export async function vapidAuthorization(endpoint,env,now=Date.now()){
  const jwk=JSON.parse(env.VAPID_PRIVATE_JWK);
  const header=b64(bytes(JSON.stringify({typ:'JWT',alg:'ES256'})));
  const claims=b64(bytes(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(now/1000)+12*3600,sub:env.VAPID_SUBJECT})));
  const input=header+'.'+claims;
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,bytes(input));
  return 'vapid t='+input+'.'+b64(signature)+', k='+env.VAPID_PUBLIC_KEY;
}
export async function validateSubscription(value){
  if(!value||typeof value.endpoint!=='string'||value.endpoint.length>2048)throw new Error('Geçersiz abonelik.');
  const url=new URL(value.endpoint);
  const allowed=url.hostname==='web.push.apple.com'||url.hostname==='fcm.googleapis.com'||url.hostname==='updates.push.services.mozilla.com'||url.hostname==='updates-autopush.stage.mozaws.net';
  if(url.protocol!=='https:'||!allowed||url.port||url.username||url.password||url.hash)throw new Error('Desteklenmeyen bildirim servisi.');
  if(typeof value.keys?.p256dh!=='string'||typeof value.keys?.auth!=='string')throw new Error('Abonelik anahtarları eksik.');
  const publicKey=unb64(value.keys.p256dh),auth=unb64(value.keys.auth);
  if(publicKey.length!==65||publicKey[0]!==4||auth.length!==16)throw new Error('Geçersiz abonelik anahtarları.');
  await crypto.subtle.importKey('raw',publicKey,{name:'ECDH',namedCurve:'P-256'},false,[]);
  return {endpoint:url.href,keys:{p256dh:value.keys.p256dh,auth:value.keys.auth}};
}
export async function sendPush(subscription,payload,env){
  let body,authorization;
  try{body=await encryptPayload(payload,subscription.keys)}catch(e){throw Object.assign(new Error('Push encryption failed'),{stage:'encryption',causeName:e.name});}
  try{authorization=await vapidAuthorization(subscription.endpoint,env)}catch(e){throw Object.assign(new Error('Push signing failed'),{stage:'signing',causeName:e.name});}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{return await fetch(subscription.endpoint,{method:'POST',redirect:'manual',headers:{Authorization:authorization,'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:'3600',Urgency:'normal'},body,signal:controller.signal});}
  catch(e){const diagnostic=String(e.message||'').replace(/https?:\/\/[^\s"']+/g,'[url]').replace(/[A-Za-z0-9_+\/-]{24,}/g,'[redacted]').replace(/[^A-Za-z0-9 .,;:()_\[\]-]/g,'').slice(0,180);throw Object.assign(new Error('Push network failed'),{stage:'network',causeName:e.name,diagnostic});}
  finally{clearTimeout(timer);}
}
export async function providerReason(response){
  try{const value=await response.json();return typeof value.reason==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(value.reason)?value.reason:'ProviderRejected';}catch{return 'ProviderRejected';}
}
let jwksCache=null,jwksAt=0;
export async function verifySchedulerJWT(token,origin,env,now=Date.now()){
  try{
    if(typeof token!=='string'||token.length>16000)return false;
    const parts=token.split('.');if(parts.length!==3)return false;
    const decode=s=>JSON.parse(new TextDecoder().decode(unb64(s))),header=decode(parts[0]),claims=decode(parts[1]);
    if(header.alg!=='RS256'||!header.kid)return false;
    const seconds=Math.floor(now/1000);
    if(![claims.exp,claims.nbf,claims.iat].every(Number.isFinite))return false;
    if(claims.iss!=='https://token.actions.githubusercontent.com'||claims.aud!==origin||claims.exp<=seconds||claims.nbf>seconds+30||claims.iat>seconds+30||seconds-claims.iat>600)return false;
    if(claims.repository!==env.SCHEDULER_REPOSITORY||String(claims.repository_id)!==String(env.SCHEDULER_REPOSITORY_ID)||claims.ref!=='refs/heads/main'||claims.workflow_ref!==env.SCHEDULER_REPOSITORY+'/.github/workflows/payment-reminders.yml@refs/heads/main'||!['schedule','workflow_dispatch','push'].includes(claims.event_name))return false;
    if(!jwksCache||now-jwksAt>900000||!jwksCache.keys.some(k=>k.kid===header.kid)){
      const r=await fetch('https://token.actions.githubusercontent.com/.well-known/jwks',{signal:AbortSignal.timeout(10000)});if(!r.ok)return false;jwksCache=await r.json();jwksAt=now;
    }
    const jwk=jwksCache.keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.use==='sig');if(!jwk)return false;
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,unb64(parts[2]),bytes(parts[0]+'.'+parts[1]));
  }catch{return false;}
}
