import test from 'node:test';
import assert from 'node:assert/strict';

async function controller(hostname){
  const calls=[];
  Object.assign(globalThis,{
    location:{hostname},
    window:{addEventListener(){},matchMedia:()=>({matches:false})},
    document:{addEventListener(){},visibilityState:'visible'},
    localStorage:{getItem:()=>null,setItem(){}},
    fetch:async(...args)=>{calls.push(args);throw new Error('network must not be used');}
  });
  const mod=await import('../public/notifications.js?host='+hostname);
  return {push:mod.createPushController({getData:()=>({entries:[]}),canSync:()=>true,esc:v=>v,toast(){},onChange(){}}),calls};
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
