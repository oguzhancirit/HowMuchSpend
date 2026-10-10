// Small, interruptible interactions. No timers, loops or dependency downloads.
export function createMotionController({root,getMode=()=> 'system',media=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)'),isVisible=()=>true}) {
  let previous=null;
  const active=new Set();
  const reduced=()=>getMode()==='reduced'||!!media?.matches;
  const stop=()=>{for(const animation of active)animation.cancel();active.clear();};
  const play=(nodes,frames,duration=280,stagger=0)=>{
    if(reduced()||!isVisible())return;
    [...nodes].slice(0,8).forEach((node,i)=>{
      if(!node?.animate)return;
      try{const animation=node.animate(frames,{duration,delay:i*stagger,easing:'cubic-bezier(.2,.8,.2,1)',fill:'none'});active.add(animation);animation.finished?.then(()=>active.delete(animation),()=>active.delete(animation));}catch{}
    });
  };
  const enter=[{opacity:.35,transform:'translateY(9px)'},{opacity:1,transform:'translateY(0)'}];
  function afterRender(state){
    stop();const before=previous;previous={...state};
    if(!before||state.view!==before.view){play(root.querySelectorAll('.page-head, .summary-grid, .workspace-grid, .record-list, .settings-panel, .savings-form, .savings-empty, .savings-grid, .tracking-overview, .tracking-balance, .tracking-form'),enter,300,22);return;}
    if(state.month!==before.month){const x=state.month>before.month?16:-16;play(root.querySelectorAll('.calendar-grid, .agenda-list, .record-list, .tracking-detail-grid, .tracking-overview'),[{opacity:.45,transform:`translateX(${x}px)`},{opacity:1,transform:'translateX(0)'}],240);return;}
    if(state.selected!==before.selected){play(root.querySelectorAll('#selected-day'),enter,200);return;}
    if(state.payments!==before.payments){play(root.querySelectorAll('.tracking-balance, .tracking-form, .tracking-flow-panel'),enter,240);}
    if(state.savings!==before.savings){play(root.querySelectorAll('.savings-form, .savings-outcome'),enter,240);}
  }
  function paid(key){play([...root.querySelectorAll('[data-paid]')].filter(n=>n.dataset.paid===key),[{transform:'scale(.85)'},{transform:'scale(1.12)'},{transform:'scale(1)'}],280);}
  media?.addEventListener?.('change',()=>{if(reduced())stop();});
  return {afterRender,paid,reduced,stop};
}
