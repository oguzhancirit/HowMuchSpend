import test from 'node:test';
import assert from 'node:assert/strict';

async function controller(hostname,pushServer=''){
  const calls=[];
  Object.assign(globalThis,{
    location:{hostname},
    window:{addEventListener(){},matchMedia:()=>({matches:false})},
    document:{addEventListener(){},visibilityState:'visible'},
    localStorage:{getItem:()=>null,setItem(){}},
    fetch:async(...args)=>{calls.push(args);throw new Error('network must not be used');}
  });
  const mod=await import('../public/notifications.js?host='+hostname);
  return {push:mod.createPushController({getData:()=>({entries:[]}),canSync:()=>true,esc:v=>v,toast(){},onChange(){},pushServer}),calls};
}

test('GitHub Pages hides the notification panel and never calls the push server',async()=>{
  const {push,calls}=await controller('oguzhancirit.github.io');
  assert.equal(push.panel(),'');
  await push.refresh();await push.sync(true);
  assert.equal(calls.length,0);
});
test('Hosts with the push server keep the notification panel',async()=>{
  const {push}=await controller('howmuchspend.ozicirit9.chatgpt.site');
  assert.match(push.panel(),/id="notification-panel"/);
});

test('GitHub Pages keeps the notification panel when a push server origin is configured',async()=>{
  const {push}=await controller('oguzhancirit.github.io');
  const mod=await import('../public/notifications.js?host=configured');
  const configured=mod.createPushController({getData:()=>({entries:[]}),canSync:()=>true,esc:v=>v,toast(){},onChange(){},pushServer:'https://push.example.workers.dev'});
  assert.match(configured.panel(),/id="notification-panel"/);
  assert.equal(push.panel(),'');
});

test('The shipped push server origin points at the Cloudflare Worker',async()=>{
  const mod=await import('../public/notifications.js?host=shipped');
  assert.match(mod.PUSH_SERVER_ORIGIN,/^https:\/\/howmuchspend\.[a-z0-9-]+\.workers\.dev$/);
});
