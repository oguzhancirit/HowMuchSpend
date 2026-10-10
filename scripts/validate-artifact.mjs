import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile('dist/server/index.js','utf8');
const worker=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
assert.equal(typeof worker.default.fetch,'function');
const manifest=JSON.parse(await readFile('dist/.openai/hosting.json','utf8'));
assert.equal(manifest.d1,'DB');assert.equal(manifest.static,undefined);
for(const route of ['/','/style.css?v=22','/sw.js','/motion.js?v=22','/savings.js?v=22','/savings-model.js?v=22','/payments.js?v=22','/payments-model.js?v=22','/fonts/SpaceGrotesk.ttf','/assets/akbank.png','/release.json']){const r=await worker.default.fetch(new Request('https://test.local'+route),{});assert.equal(r.status,200,route);assert.ok((await r.arrayBuffer()).byteLength>0);}
const api=await worker.default.fetch(new Request('https://test.local/api/push/config'),{});assert.equal((await api.json()).ready,false);
console.log('Artifact: valid ESM, embedded app/assets, API boundary, D1 declaration');
