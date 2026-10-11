import {readFile,writeFile,readdir,mkdir,rm,cp} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
const assets={};
// Retain archived features in source, but do not ship unused code or retired fonts.
const archived=new Set(['recovery.js','recovery-model.js','fonts']);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf'};
async function collect(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(dir==='public'&&archived.has(entry.name))continue;if(entry.isDirectory())await collect(file);else {assets['/'+path.relative('public',file).split(path.sep).join('/')]={type:mime[path.extname(file)]||'text/plain',body:(await readFile(file)).toString('base64url')};}}}
await collect('public');
const result=await build({entryPoints:['worker/index.js'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify:true,banner:{js:`globalThis.__HMS_ASSETS=${JSON.stringify(assets)};`}});
const bundled=result.outputFiles[0].text;
await rm('dist',{recursive:true,force:true});await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',bundled);await cp('.openai/hosting.json','dist/.openai/hosting.json');await cp('drizzle','dist/.openai/drizzle',{recursive:true});
console.log(`Built Worker ESM: ${Object.keys(assets).length} embedded assets, ${Buffer.byteLength(bundled)} bytes`);
