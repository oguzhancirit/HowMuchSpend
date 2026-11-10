// Counts summary figures up/down to their new value after a re-render (countUp.js, vendored, no network).
// Respects the app's motion setting and the system "reduce motion" preference. Display only: stored data is never touched.
import {CountUp} from './vendor/countUp.min.js?v=38';
import {formatNumber} from './model.js?v=38';
export function createCountController({root,reduced=()=>false,isVisible=()=>true}) {
  const last=new Map();let running=[],first=true;
  const stop=()=>{for(const r of running){try{r.reset();}catch{}}running=[];};
  function afterRender() {
    stop();
    const nodes=root.querySelectorAll?.('[data-count]')||[];
    const skip=reduced()||!isVisible();
    for(const el of nodes) {
      const key=el.dataset.countKey,target=Number(el.dataset.count),prev=last.get(key);
      if(!key||!Number.isFinite(target))continue;
      last.set(key,target);
      const intro=first&&prev===undefined&&target!==0;
      if(skip||(prev===undefined&&!intro)||prev===target)continue;
      const final=el.textContent;
      try {
        const counter=new CountUp(el,target/100,{startVal:(intro?0:prev)/100,duration:intro?.9:.6,decimalPlaces:2,formattingFn:v=>formatNumber(Math.round(v*100)),onCompleteCallback:()=>{el.textContent=final;}});
        if(counter.error){el.textContent=final;continue;}
        running.push(counter);counter.start();
      } catch {el.textContent=final;}
    }
    if(nodes.length)first=false;
  }
  return {afterRender,stop};
}
