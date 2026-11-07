import {api,post,poll,escapeHtml as e,brand,isMock,tokenFromUrl,ApiError} from './common';
import type {Grant,Remote} from './types';
import './phone.css';
const token=tokenFromUrl();
const isRemote=location.pathname==='/m/remote'||location.pathname==='/remote.html';
const id=decodeURIComponent(location.pathname.match(/\/m\/grants\/([^/]+)/)?.[1]||'demo-grant');
const root=document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML=`<main class="phone-page"><header class="brand">${brand}</header><section class="prompter" hidden aria-live="polite"></section><div class="phone-connection" role="status"></div><div class="phone-art" aria-hidden="true"><span class="art-halo"></span><img src="${new URL('./assets/stage/corgi-sit.webp',import.meta.url).href}" alt=""></div><section class="phone-card" aria-live="polite"><p>連線中…</p></section><footer>每一次使用，都在你的授權之內。${isMock?'<span>示範模式</span>':''}</footer></main>`;
const card=root.querySelector<HTMLElement>('.phone-card')!,connection=root.querySelector<HTMLElement>('.phone-connection')!;
let grant:Grant|undefined,busy=false,revision=0,lastRender='',accepted=false,wasIdle=false;
const handled=new Map<string,Grant['status']>();
let lastResult:Grant|undefined;
let lockAvailable=false;
const resultText:Record<Grant['status'],string>={pending:'等你授權',allowed:'已授權，只限這一次',used:'這一次已經授權過了，只限一次',denied:'已拒絕，請求沒有送出',expired:'授權已過期，請重新提出請求',revoked:'這次授權已收回'};
function render(html:string){if(html!==lastRender){lastRender=html;card.innerHTML=html;}}
function showGrant(value:Grant){if(handled.has(value.id)&&value.status==='pending')value={...value,status:handled.get(value.id)!};if(value.status==='pending'&&Date.parse(value.expiresAt)<=Date.now())value={...value,status:'expired'};grant=value;if(value.status!=='pending'){render(`<span class="status-icon">✓</span><h1>${resultText[value.status]}</h1><p>每張授權單只限指定的這一次使用。</p>`);return;}
 render(`<span class="phone-eyebrow">已擋下，請求還沒送出</span><h1>${e(value.summary==='寄給 50 人'?'要寄給 50 人':value.summary)}</h1><p class="phone-once">只限這一次</p><dl><div><dt>誰提出請求</dt><dd>${e(value.agent)}</dd></div><div><dt>使用的金鑰</dt><dd>${e(value.secretName)}</dd></div></dl><button class="allow-button" data-action="allow">授權這一次</button><button class="deny-button" data-action="deny">拒絕</button><p class="action-error" role="status"></p>`);
}
function showLocked(){grant=undefined;render('<span class="status-icon">✓</span><h1>已全部收回</h1><p>AI 目前不能用任何金鑰。</p>');}
function showLockCard(retry=false){
 render('<span class="phone-eyebrow">已授權，只限這一次</span><h1>AI 還想再試</h1><p class="phone-once">收回所有授權</p><button class="allow-button lock-button" data-action="lock">全部收回</button><p class="action-error" role="status"></p>');
 card.querySelector('.lock-button')?.classList.toggle('retry-pulse',retry);
}
async function lockdown(){
 if(!isRemote||!lockAvailable||busy)return;
 busy=true;revision++;
 const button=card.querySelector<HTMLButtonElement>('.lock-button');
 if(button){button.disabled=true;button.classList.remove('retry-pulse');button.classList.add('lock-pressed');button.setAttribute('aria-busy','true');}
 try{
  const [result]=await Promise.all([post<{locked:boolean}>(`/api/lockdown?token=${encodeURIComponent(token)}`),new Promise(resolve=>setTimeout(resolve,460))]);
  if(result.locked!==true)throw new Error('Lock state not confirmed');
  showLocked();connection.textContent='';
 }catch{
  const output=card.querySelector<HTMLElement>('.action-error');if(output)output.textContent='尚未收回，請再試一次。';
 }finally{busy=false;if(button){button.disabled=false;button.classList.remove('lock-pressed');button.removeAttribute('aria-busy');}}
}
async function allowOrDeny(action:'allow'|'deny'){if(!grant||busy||grant.status!=='pending'||handled.has(grant.id))return;busy=true;revision++;const current=grant;card.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=true);try{const updated=await post<Grant>(`/api/grants/${encodeURIComponent(current.id)}/${action}?token=${encodeURIComponent(token)}`);grant=updated;if(updated.status!=='pending'){handled.set(updated.id,updated.status);lastResult=updated;}accepted=['allowed','used'].includes(updated.status);if(isRemote&&accepted&&lockAvailable)showLockCard();else showGrant(updated);connection.textContent='';}catch(error){const output=card.querySelector<HTMLElement>('.action-error');if(output)output.textContent=error instanceof ApiError?error.message:'尚未完成，請稍後再試。';}finally{busy=false;card.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=false);}}
card.addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');if(button?.dataset.action==='lock')void lockdown();if(button?.dataset.action==='allow'||button?.dataset.action==='deny')void allowOrDeny(button.dataset.action);});
poll(async()=>{if(busy)return;const requestRevision=revision;try{if(!token&&!isMock){connection.textContent='請使用手機授權連結開啟。';render('<h1>需要通行碼</h1><p>請從自己的筆電開啟授權連結。</p>');return;}
 if(isRemote){const remote=await api<Remote>(`/api/remote?token=${encodeURIComponent(token)}`);if(requestRevision!==revision||busy)return;if(remote.state==='idle'&&!wasIdle){accepted=false;lastResult=undefined;handled.clear();}wasIdle=remote.state==='idle';cue(remote.state);lockAvailable=typeof remote.locked==='boolean';if(remote.locked||remote.state==='locked'){showLocked();}else if(remote.grant?.status==='pending'&&!handled.has(remote.grant.id)){showGrant(remote.grant);}else if(accepted||['allowed','sent','denied','retry'].includes(remote.state)){if(lockAvailable)showLockCard(remote.state==='retry');else render('<span class="status-icon">✓</span><h1>已授權，<br>只限這一次</h1><p>用完就失效，多一次都不行。</p>');}else if(lastResult){showGrant(lastResult);}else{render('<span class="waiting-dot"></span><h1 class="waiting">等開場…</h1><p>有待授權的請求時，會出現在這裡。</p>');}}
 else{const value=await api<Grant>(`/api/grants/${encodeURIComponent(id)}`);if(requestRevision!==revision||busy)return;showGrant(value);}connection.textContent='';
 }catch(error){connection.textContent=error instanceof ApiError&&error.status===401?'通行碼無效，請重新開啟授權連結。':'連線中…';}},1000);
let wake:WakeLockSentinel|undefined;
async function keepAwake(){if(document.visibilityState!=='visible'||!('wakeLock' in navigator))return;try{wake=await navigator.wakeLock.request('screen');wake.addEventListener('release',()=>{wake=undefined;});}catch{/* Screen lock is optional. */}}
if(isRemote){void keepAwake();document.addEventListener('visibilitychange',()=>{if(!wake)void keepAwake();});}

// Kyle 11-07: a prompter on the remote page — the line to say now, following the stage.
const prompter=document.querySelector<HTMLElement>('.prompter')!;
const OPEN='現在大家把 API 金鑰直接貼給 AI，它就一直拿著。PassVault 推庫，是一個保險箱。';
const CUES:Record<string,[string,string]>={
 idle:['按空白鍵開場，然後說',OPEN],intro:['現在說',OPEN],
 masked:['現在說','AI 說它要我的 API。PassVault 給它用，但不給它看。你看，它拿到的金鑰是塗黑的。'],
 blocked:['說完就按下面「授權這一次」','它想寄信給 50 個人，超出規則，先擋下。'],
 allowed:['現在說','我的手機，就是放行的鑰匙。'],sent:['現在說','我的手機，就是放行的鑰匙。'],
 denied:['現在說','用完就失效，多一次都不行。'],
 retry:['說完就按下面「全部收回」','AI 不死心？'],
 locked:['現在說','一鍵，全部收回。AI 拿到金鑰：零次。每一次使用，都在你的授權之內。'],
};
const CLOSE='我是 Kyle，這是 PassVault 推庫。想試用，掃這個 QR 直接寄信給我。謝謝！';
let lockedSince=0,lastCue='';
function cue(state:string){
 if(!isRemote)return;
 lockedSince=state==='locked'?(lockedSince||Date.now()):0;
 const pair:[string,string]|undefined=state==='locked'&&Date.now()-lockedSince>9000?['最後說',CLOSE]:CUES[state];
 const html=pair?`<small>${pair[0]}</small><p>${pair[1]}</p>`:'';
 if(html!==lastCue){lastCue=html;prompter.innerHTML=html;prompter.hidden=!html;}
}
if(isRemote)document.querySelector('.phone-page')!.classList.add('is-remote');
