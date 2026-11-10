// Generates a VAPID key pair for Web Push. Run locally: node scripts/generate-vapid.mjs
// Paste the two values into Cloudflare (Worker -> Settings -> Variables and Secrets). Never commit them.
const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const b64=bytes=>Buffer.from(bytes).toString('base64url');
const publicKey=b64(await crypto.subtle.exportKey('raw',pair.publicKey));
const privateJwk=JSON.stringify(await crypto.subtle.exportKey('jwk',pair.privateKey));
console.log('VAPID_PUBLIC_KEY (Text):\n'+publicKey+'\n');
console.log('VAPID_PRIVATE_JWK (Secret):\n'+privateJwk+'\n');
console.log('Keep VAPID_PRIVATE_JWK private. If the keys change, every device must turn notifications on again.');
