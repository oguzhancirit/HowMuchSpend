// GitHub provides an ephemeral OIDC token; no persistent scheduler secret is needed.
const origin=process.env.SITE_ORIGIN;
if(origin!=='https://howmuchspend.ozicirit9.chatgpt.site')throw new Error('Unexpected Site');
const config=await fetch(origin+'/api/push/config');
if(!config.ok||!(await config.json()).ready)throw new Error('Push server not ready');
const oidcURL=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);oidcURL.searchParams.set('audience',origin);
const tokenResponse=await fetch(oidcURL,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}});
if(!tokenResponse.ok)throw new Error('OIDC request failed');
const {value:token}=await tokenResponse.json();
const response=await fetch(origin+'/api/push/dispatch',{method:'POST',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(90000)});
const result=await response.json();
console.log(JSON.stringify({sent:result.sent,failed:result.failed,status:response.status}));
if(!response.ok)throw new Error('Reminder check failed');
// GitHub disables public-repo cron after 60 days without activity. A bounded monthly
// marker commit keeps this user-requested notification scheduler active.
const repository=process.env.GH_REPOSITORY;
if(repository!=='oguzhancirit/HowMuchSpend')throw new Error('Unexpected repository');
const month=new Date().toISOString().slice(0,7),api='https://api.github.com/repos/'+repository+'/contents/.github/reminder-heartbeat.json';
const headers={Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
const current=await fetch(api,{headers});let old=null;
if(current.ok)old=await current.json();else if(current.status!==404)throw new Error('Cannot check scheduler heartbeat');
const previous=old?JSON.parse(Buffer.from(old.content,'base64').toString('utf8')):{};
if(previous.month!==month){
  const write=await fetch(api,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({message:'Maintain payment reminder scheduler ('+month+')',branch:'main',content:Buffer.from(JSON.stringify({month})+'\n').toString('base64'),...(old?{sha:old.sha}:{})})});
  if(!write.ok)throw new Error('Cannot maintain scheduler heartbeat');
}
