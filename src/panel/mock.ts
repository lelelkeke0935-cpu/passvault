import type { Stage, StageState, Grant, Item } from './types';
// Synthetic metadata only. Never persist submitted secret values or phone tokens.
const now = new Date().toISOString();
const grant: Grant = {id:'demo-grant', agent:'Claude Code', secretName:'SANDBOX_MAIL_KEY', summary:'寄給 50 人', status:'pending', createdAt:now, expiresAt:new Date(Date.now()+300000).toISOString(), phoneUrl:'/m/grants/demo-grant?mock'};
const valid = new Set<StageState>(['idle','intro','masked','blocked','allowed','sent','denied','retry','locked']);
const initial = new URLSearchParams(location.search).get('state') as StageState;
const storageKey = 'passvault-synthetic-stage-v1';
let stage: Stage = {seq:0, state:valid.has(initial) ? initial : 'idle', caption:'', blockedCount:0, allowedCount:0};
let items: Item[] = [
 {id:'1',type:'api_key',name:'SANDBOX_MAIL_KEY',size:32,createdAt:now},
 {id:'2',type:'password',name:'工作帳號',size:20,createdAt:now},
 {id:'3',type:'document',name:'產品介紹.pdf',size:482400,createdAt:now},
 {id:'4',type:'photo',name:'小島的午後.webp',size:1280000,createdAt:now},
];
const runKey=storageKey+'-run';
const nextRun=()=>{const run=Number(localStorage.getItem(runKey)||0)+1;localStorage.setItem(runKey,String(run));return run;};
function setState(state: StageState) {
 stage = {...stage, seq:stage.seq+1, state, caption:({masked:'金鑰給我看',blocked:'寄給 50 人',denied:'再寄一次',retry:'我再試試'} as Partial<Record<StageState,string>>)[state] || '', blockedCount:['retry','locked'].includes(state)?3:state==='denied'?2:['blocked','allowed','sent'].includes(state)?1:0,allowedCount:['allowed','sent','denied','retry','locked'].includes(state)?1:0};
 grant.status = state==='blocked'?'pending':state==='allowed'?'allowed':['sent','denied','retry'].includes(state)?'used':state==='locked'?'revoked':'pending';
 stage.grant = state==='idle'||state==='intro'||state==='masked'?undefined:{...grant};
 localStorage.setItem(storageKey,JSON.stringify(stage));
}
if (valid.has(initial)) setState(initial);
function refresh(){ try {const raw=localStorage.getItem(storageKey);if(raw){const data=JSON.parse(raw);if(valid.has(data.state)){stage=data;if(data.grant)Object.assign(grant,data.grant);}}}catch {/* Synthetic state is disposable. */} }
const later=(state:StageState, ms:number, run:number)=>setTimeout(()=>{refresh();if(Number(localStorage.getItem(runKey))===run)setState(state);},ms);
export async function mockRequest(path: string, init: RequestInit) {
 refresh(); const url = new URL(path,location.origin);const route=url.pathname;const write=init.method==='POST';
 await new Promise(resolve=>setTimeout(resolve,40));
 if(write && route==='/api/stage/intro'){setState('intro');const run=nextRun();later('masked',6000,run);later('blocked',14000,run);return {ok:true};}
 if(write && route==='/api/demo/reset'){nextRun();setState('idle');return {ok:true,locked:false};}
 if(write && route.includes('/api/lockdown')){nextRun();setState('locked');return {locked:true};}
 if(write && /\/allow(?:-stage)?$/.test(route)){if(grant.status!=='pending')return {...grant};setState('allowed');const run=nextRun();later('sent',1000,run);later('denied',4000,run);later('retry',10000,run);return {...grant};}
 if(write && route.endsWith('/deny')){grant.status='denied';stage.grant={...grant};localStorage.setItem(storageKey,JSON.stringify(stage));return {...grant};}
 if(route==='/api/stage') return {...stage};
 if(route==='/api/remote') return {state:stage.state,locked:stage.state==='locked',grant:stage.state==='blocked'&&grant.status==='pending'?{...grant}:undefined};
 if(route==='/api/lockdown') return {locked:stage.state==='locked'};
 if(route==='/api/grants') return stage.grant?[{...grant}]:[];
 if(route.startsWith('/api/grants/')) return {...grant};
 if(route==='/api/evidence/verify') return {ok:true,count:4,head:'a1b2c3d4e5f6'};
 if(route==='/api/evidence')return {keyGivenToAi:false,sent:stage.allowedCount?1:0,blocked:stage.blockedCount?1:0,denied:Math.max(0,(stage.blockedCount||0)-1),recent:stage.blockedCount?[{id:'log-1',at:now,agent:'Claude Code',secret:'SANDBOX_MAIL_KEY',method:'POST',url:'http://127.0.0.1:8787/sandbox/mail/lists/customers/send',outcome:'blocked',reason:'寄給整份名單要你授權'}]:[]};
 if(route==='/api/usage') return {used:1762400,quota:53687091200,store:'local'};
 if(route==='/api/items'&&write){const data=init.body instanceof FormData?{name:(init.body.get('file') as File).name,type:init.body.get('type'),size:(init.body.get('file') as File).size}:JSON.parse(String(init.body));const item={id:crypto.randomUUID(),name:data.name,type:data.type,size:data.size||24,createdAt:new Date().toISOString()};items=[item,...items] as Item[];return {id:item.id,encrypted:true};}
 if(route==='/api/items')return items;
 throw new Error('示範路徑尚未提供');
}
