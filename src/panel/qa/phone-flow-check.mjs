import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';

// Execute the actual bundled phone entry with a small DOM and controlled HTTP/clock.
// This verifies behavior, not pixel layout; the integration owner checks screenshots.
const bundle=await build({entryPoints:[new URL('../phone.ts',import.meta.url).pathname],bundle:true,write:false,format:'iife',loader:{'.css':'empty'},define:{'import.meta.url':JSON.stringify('http://localhost/phone.ts')},logLevel:'silent'});
const code=bundle.outputFiles[0].text;
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
const fixture={id:'sample',agent:'Demo AI',secretName:'MAIL_SERVICE',summary:'寄給 50 人',status:'pending',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+300000).toISOString(),phoneUrl:''};
function element(){
 const classes=new Set(),events=new Map();
 return {innerHTML:'',textContent:'',disabled:false,dataset:{},events,
  classList:{add:(...names)=>names.forEach(n=>classes.add(n)),remove:(...names)=>names.forEach(n=>classes.delete(n)),toggle:(name,on)=>on?classes.add(name):classes.delete(name),contains:name=>classes.has(name)},
  setAttribute(){},removeAttribute(){},addEventListener:(name,fn)=>events.set(name,fn)};
}
async function harness(path='/m/remote'){
 const card=element(),connection=element(),output=element(),root=element();
 let buttons=[],html='',clock=0,nextTimer=0;
 Object.defineProperty(card,'innerHTML',{get:()=>html,set:value=>{html=value;buttons=[...value.matchAll(/data-action="([^"]+)"/g)].map(match=>{const b=element();b.dataset.action=match[1];return b;});}});
 card.querySelector=selector=>selector==='.action-error'?output:selector==='.lock-button'?buttons.find(b=>b.dataset.action==='lock')||null:null;
 card.querySelectorAll=()=>buttons;
 root.querySelector=selector=>selector==='.phone-card'?card:connection;
 const timers=new Map(),calls=[];
 const state={remote:{state:'idle',locked:false},grant:{...fixture},offline:false,lockFailure:false,holdRemote:null};
 const setTimer=(fn,ms)=>{timers.set(++nextTimer,{fn,at:clock+ms});return nextTimer;};
 const context={URL,URLSearchParams,Request,Response,Headers,AbortController,FormData,Date,Promise,
  location:{pathname:path,search:'?token=synthetic-owner',origin:'http://localhost'},
  document:{querySelector:()=>root,visibilityState:'hidden',addEventListener(){}},navigator:{},
  setTimeout:setTimer,clearTimeout:id=>timers.delete(id),
  fetch:async(url,init)=>{
   calls.push({url,method:init.method||'GET'});
   if(state.offline)throw new Error('Offline');
   if(url.startsWith('/api/remote')){if(state.holdRemote)return state.holdRemote;return Response.json(state.remote);}
   if(url.startsWith('/api/lockdown')){if(state.lockFailure)return Response.json({}, {status:500});state.remote={state:'locked',locked:true};return Response.json({locked:true});}
   if(init.method==='POST'){state.grant={...state.grant,status:url.includes('/allow?')?'allowed':'denied'};state.remote={state:'allowed',locked:false};}
   return Response.json(state.grant);
  }};
 context.window=context;vm.runInNewContext(code,context);await flush();
 return {card,connection,output,state,calls,
  click:async action=>{const button=buttons.find(b=>b.dataset.action===action);assert.ok(button,`Button ${action} exists`);card.events.get('click')({target:{closest:()=>button}});await flush();return button;},
  tick:async ms=>{clock+=ms;for(const [id,timer] of [...timers])if(timer.at<=clock){timers.delete(id);timer.fn();}await flush();}};
}

test('remote waits, grants once, locks once, then resets without stale actions',async()=>{
 const app=await harness();assert.match(app.card.innerHTML,/等開場/);
 app.state.remote={state:'blocked',locked:false,grant:{...fixture}};await app.tick(1000);
 assert.match(app.card.innerHTML,/授權這一次/);await app.click('allow');
 assert.match(app.card.innerHTML,/收回所有授權/);
 app.state.remote={state:'retry',locked:false};await app.tick(1000);
 const button=app.card.querySelector('.lock-button');assert.ok(button.classList.contains('retry-pulse'));
 await app.click('lock');await app.click('lock');
 assert.ok(button.disabled);assert.ok(button.classList.contains('lock-pressed'));
 assert.equal(app.calls.filter(c=>c.url.startsWith('/api/lockdown')).length,1);
 assert.ok(app.calls.some(c=>c.url==='/api/lockdown?token=synthetic-owner'&&c.method==='POST'));
 await app.tick(460);assert.match(app.card.innerHTML,/已全部收回/);assert.doesNotMatch(app.card.innerHTML,/<button/);
 app.state.remote={state:'idle',locked:false};await app.tick(1000);assert.match(app.card.innerHTML,/等開場/);
});

test('failed lock stays actionable and offline polling preserves the last card',async()=>{
 const app=await harness();app.state.remote={state:'retry',locked:false};await app.tick(1000);
 app.state.lockFailure=true;await app.click('lock');await app.tick(460);
 assert.match(app.output.textContent,/尚未收回/);assert.equal(app.card.querySelector('.lock-button').disabled,false);
 app.state.offline=true;await app.tick(1000);assert.match(app.connection.textContent,/連線中/);assert.match(app.card.innerHTML,/收回所有授權/);
 app.state.offline=false;app.state.lockFailure=false;await app.click('lock');await app.tick(460);assert.match(app.card.innerHTML,/已全部收回/);
});

test('late polling cannot restore an unlocked card after a lock action',async()=>{
 const app=await harness();app.state.remote={state:'retry',locked:false};await app.tick(1000);
 let resolve;app.state.holdRemote=new Promise(done=>{resolve=done;});await app.tick(1000);
 await app.click('lock');await app.tick(460);
 resolve(Response.json({state:'retry',locked:false}));await flush();
 assert.match(app.card.innerHTML,/已全部收回/);assert.doesNotMatch(app.card.innerHTML,/<button/);
});

test('single grant page never offers global lockdown',async()=>{
 const app=await harness('/m/grants/sample');await app.click('allow');
 assert.match(app.card.innerHTML,/已授權，只限這一次/);assert.doesNotMatch(app.card.innerHTML,/全部收回/);
 assert.equal(app.calls.some(c=>c.url.startsWith('/api/lockdown')),false);
});

test('missing optional lockdown field preserves the base grant result',async()=>{
 const app=await harness();app.state.remote={state:'allowed'};await app.tick(1000);
 assert.match(app.card.innerHTML,/只限這一次/);assert.doesNotMatch(app.card.innerHTML,/全部收回/);
});
