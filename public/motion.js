// Small, interruptible interactions. No timers, loops or dependency downloads.
export function createMotionController({root,getMode=()=> 'system',media=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)'),isVisible=()=>true}) {
  let previous=null,rainUntil=null,rainHost=null;
  const active=new Set();
  const reduced=()=>getMode()==='reduced'||!!media?.matches;
  const stop=()=>{for(const animation of active)animation.cancel();active.clear();rainHost?.remove();rainHost=null;};
  const play=(nodes,frames,duration=280,stagger=0)=>{
    if(reduced()||!isVisible())return;
    [...nodes].slice(0,8).forEach((node,i)=>{
      if(!node?.animate)return;
      try{const animation=node.animate(frames,{duration,delay:i*stagger,easing:'cubic-bezier(.2,.8,.2,1)',fill:'none'});active.add(animation);animation.finished?.then(()=>active.delete(animation),()=>active.delete(animation));}catch{}
    });
  };
  const enter=[{opacity:.35,transform:'translateY(9px)'},{opacity:1,transform:'translateY(0)'}];
  function openingRain(){
    if(reduced()||!isVisible())return;
    const card=root.querySelector?.('.summary-card.net'),doc=root.ownerDocument||globalThis.document;
    if(!card?.append||!doc?.createElement)return;
    const now=Date.now();if(rainUntil===null)rainUntil=now+2600;
    const remaining=rainUntil-now;if(remaining<=0)return;
    const host=doc.createElement('div');host.className='summary-net-rain';host.setAttribute('aria-hidden','true');card.append(host);rainHost=host;
    const pending=[];
    const fall=(card.clientHeight||160)+80;
    for(let i=0;i<24;i++){
      const piece=doc.createElement('span');piece.textContent=i%2?'💶':'💵';piece.style.left=(5+(i*37)%88)+'%';piece.style.fontSize=(30+i%4*4)+'px';host.append(piece);
      if(!piece.animate)continue;
      const tilt=i%2?22:-24,drift=(i%2?1:-1)*(45+i%5*18),delay=Math.min(i%6*115+Math.floor(i/6)*65,Math.max(0,remaining-800));
      try{const a=piece.animate([{transform:`translate(${-drift*.3}px,-65px) rotate(${tilt}deg) scale(.9)`,opacity:0},{transform:`translate(0,5px) rotate(${tilt*.5}deg) scale(1)`,opacity:.88,offset:.16},{transform:`translate(${drift*.55}px,${fall*.48}px) rotate(${-tilt*.5}deg) scale(1)`,opacity:.8,offset:.55},{transform:`translate(${drift}px,${fall}px) rotate(${-tilt}deg) scale(.95)`,opacity:0}],{duration:Math.min(1850+i%3*90,remaining-delay),delay,easing:'cubic-bezier(.15,.35,.6,1)',fill:'both'});active.add(a);pending.push(Promise.resolve(a.finished).finally(()=>active.delete(a)));}catch{}
    }
    Promise.allSettled(pending).then(()=>{host.remove();if(rainHost===host)rainHost=null;});
  }
  function afterRender(state){
    stop();const before=previous;previous={...state};if(state.view==='calendar')openingRain();
    if(!before||state.view!==before.view){play(root.querySelectorAll('.page-head, .summary-grid, .workspace-grid, .record-list, .settings-panel, .savings-form, .savings-empty, .savings-grid, .tracking-overview, .tracking-balance, .tracking-form'),enter,300,22);return;}
    if(state.month!==before.month){const x=state.month>before.month?16:-16;play(root.querySelectorAll('.calendar-grid, .agenda-list, .record-list, .tracking-detail-grid, .tracking-overview'),[{opacity:.45,transform:`translateX(${x}px)`},{opacity:1,transform:'translateX(0)'}],240);return;}
    if(state.selected!==before.selected){play(root.querySelectorAll('#selected-day'),enter,200);return;}
    if(state.payments!==before.payments){play(root.querySelectorAll('.tracking-balance, .tracking-form, .tracking-flow-panel'),enter,240);}
    if(state.savings!==before.savings){play(root.querySelectorAll('.savings-form, .savings-outcome'),enter,240);}
  }
  function celebrate(){
    if(reduced()||!isVisible())return;
    const doc=root.ownerDocument||globalThis.document;if(!doc?.createElement||!doc.body?.append)return;
    const host=doc.createElement('div');host.className='savings-confetti';host.setAttribute('aria-hidden','true');doc.body.append(host);
    const colors=['#ef9dbf','#f3d391','#83cbb2','#b0b6ef'],pending=[];
    for(let i=0;i<28;i++){
      const piece=doc.createElement('i');piece.style.background=colors[i%colors.length];host.append(piece);
      if(!piece.animate)continue;
      const angle=(i/27)*Math.PI,dx=Math.cos(angle)*(100+i%5*26),dy=-Math.sin(angle)*(140+i%6*19),spin=(i%2?1:-1)*(240+i*11);
      try{const a=piece.animate([{transform:'translate(0,0) rotate(0)',opacity:0},{transform:`translate(${dx*.45}px,${dy}px) rotate(${spin*.4}deg)`,opacity:1,offset:.35},{transform:`translate(${dx}px,${Math.abs(dy)+180}px) rotate(${spin}deg)`,opacity:0}],{duration:1150+i%4*80,easing:'cubic-bezier(.15,.6,.55,1)',fill:'both'});active.add(a);pending.push(Promise.resolve(a.finished).finally(()=>active.delete(a)));}catch{}
    }
    Promise.allSettled(pending).then(()=>host.remove());
  }
  function paid(key){play([...root.querySelectorAll('[data-paid]')].filter(n=>n.dataset.paid===key),[{transform:'scale(.85)'},{transform:'scale(1.12)'},{transform:'scale(1)'}],280);}
  media?.addEventListener?.('change',()=>{if(reduced())stop();});
  return {afterRender,paid,celebrate,reduced,stop};
}
