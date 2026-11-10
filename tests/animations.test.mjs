import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createCountController} from '../public/animations.js';

test('count controller never throws and never touches nodes when motion is reduced',()=>{
  const el={dataset:{count:'500',countKey:'net'},textContent:'5'};
  const root={querySelectorAll:()=>[el]};
  const c=createCountController({root,reduced:()=>true});
  c.afterRender();el.dataset.count='900';el.textContent='9';c.afterRender();
  assert.equal(el.textContent,'9');
  assert.doesNotThrow(()=>createCountController({root:{}}).afterRender());
});
test('vendored countUp matches the hash recorded in LICENSES.md and is cached by the service worker',()=>{
  const file=fs.readFileSync(new URL('../public/vendor/countUp.min.js',import.meta.url));
  const hash=crypto.createHash('sha384').update(file).digest('hex');
  assert.ok(fs.readFileSync(new URL('../LICENSES.md',import.meta.url),'utf8').includes(hash));
  const sw=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
  assert.match(sw,/vendor\/countUp\.min\.js\?v=\d+/);assert.match(sw,/animations\.js\?v=\d+/);
});
