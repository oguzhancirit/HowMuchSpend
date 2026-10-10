import test from 'node:test';
import assert from 'node:assert/strict';
import {createMotionController} from '../public/motion.js';

function harness({reduced=false,mode='system',visible=true,animate=true}={}){
  const calls=[],listeners={};
  const node={dataset:{paid:'card@2026-10-10'},...(animate?{animate(frames,options){const a={cancelled:false,cancel(){this.cancelled=true},finished:new Promise(()=>{})};calls.push({frames,options,a});return a;}}:{})};
  const media={matches:reduced,addEventListener:(event,fn)=>listeners[event]=fn};
  const root={querySelectorAll:()=>[node]};
  const controller=createMotionController({root,getMode:()=>mode,media,isVisible:()=>visible});
  return {controller,calls,media,listeners};
}
test('Month motion follows direction and repeated background renders do not replay entrances',()=>{
  const h=harness(),base={view:'calendar',month:'2026-10',selected:'2026-10-10',recovery:''};
  h.controller.afterRender(base);assert.equal(h.calls.length,1);
  h.controller.afterRender(base);assert.equal(h.calls.length,1);assert.equal(h.calls[0].a.cancelled,true);
  h.controller.afterRender({...base,month:'2026-11'});assert.match(h.calls.at(-1).frames[0].transform,/16px/);
  h.controller.afterRender({...base,month:'2026-09'});assert.match(h.calls.at(-1).frames[0].transform,/-16px/);
});
test('OS reduced motion, explicit reduction, hidden tabs and missing animation APIs remain functional',()=>{
  for(const options of [{reduced:true},{mode:'reduced'},{visible:false},{animate:false}]){
    const h=harness(options);assert.doesNotThrow(()=>h.controller.afterRender({view:'recovery',month:'2026-10'}));h.controller.paid('card@2026-10-10');assert.equal(h.calls.length,0);
  }
});
test('Changing OS preference immediately cancels ongoing motion; payment feedback is key-specific',()=>{
  const h=harness();h.controller.paid('other');assert.equal(h.calls.length,0);h.controller.paid('card@2026-10-10');assert.equal(h.calls.length,1);
  h.media.matches=true;h.listeners.change();assert.equal(h.calls[0].a.cancelled,true);h.controller.paid('card@2026-10-10');assert.equal(h.calls.length,1);
});

test('Savings confetti is finite, cleans up after completion, and respects reduced motion',async()=>{
 const hosts=[],animations=[];const doc={body:{append:host=>hosts.push(host)},createElement:tag=>tag==='div'?{children:[],setAttribute(){},append(piece){this.children.push(piece)},remove(){this.removed=true}}:{style:{},animate(frames,options){const a={finished:Promise.resolve(),cancel(){}};animations.push({frames,options});return a}}};
 const root={ownerDocument:doc,querySelectorAll:()=>[]},motion=createMotionController({root,media:{matches:false}});motion.celebrate();assert.equal(hosts.length,1);assert.equal(hosts[0].children.length,28);assert.equal(animations.length,28);assert.ok(animations.every(a=>a.options.duration<1500));await new Promise(resolve=>setImmediate(resolve));assert.equal(hosts[0].removed,true);
 createMotionController({root,media:{matches:true}}).celebrate();createMotionController({root,getMode:()=> 'reduced'}).celebrate();assert.equal(hosts.length,1);
});

test('Opening currency rain is confined to net card and does not restart its window on redraw',()=>{
 const originalNow=Date.now;let now=1000;Date.now=()=>now;
 try{
  const hosts=[],frames=[],card={append:host=>hosts.push(host)},doc={createElement:tag=>({style:{},children:[],setAttribute(name,value){this[name]=value},append(piece){this.children.push(piece)},remove(){this.removed=true},...(tag==='span'?{animate(keyframes,options){frames.push({keyframes,options});return {finished:new Promise(()=>{}),cancel(){}}}}:{})})};
  const root={ownerDocument:doc,querySelector:selector=>selector==='.summary-card.net'?card:null,querySelectorAll:()=>[]};
  const c=createMotionController({root,media:{matches:false}}),state={view:'calendar',month:'2026-10'};c.afterRender(state);assert.equal(hosts.length,1);assert.equal(hosts[0]['aria-hidden'],'true');assert.deepEqual(new Set(hosts[0].children.map(n=>n.textContent)),new Set(['💵','💶']));assert.ok(frames.every(f=>f.options.duration+f.options.delay<=2600));
  const count=frames.length;assert.ok(hosts[0].children.every(n=>Number.parseInt(n.style.fontSize)>=30));assert.ok(frames.every(f=>f.keyframes.some(k=>k.opacity>=.8)));
  now=2000;c.afterRender(state);assert.equal(hosts[0].removed,true);assert.equal(hosts.length,2);assert.ok(frames.slice(count).every(f=>f.options.duration+f.options.delay<=1600));now=4000;c.afterRender(state);assert.equal(hosts[1].removed,true);assert.equal(hosts.length,2);
  createMotionController({root,media:{matches:true}}).afterRender(state);assert.equal(hosts.length,2);createMotionController({root,isVisible:()=>false}).afterRender(state);assert.equal(hosts.length,2);
 }finally{Date.now=originalNow;}
});
