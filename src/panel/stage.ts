import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import meta from './assets/stage/meta.json';
import {api, post, poll, isMock, escapeHtml, brand} from './common';
import type {Stage, StageState} from './types';
import './stage.css';
import {blockedLabel, bridgeAngle, endingElapsed, closingCounts, closingPhase} from './stage-model';
import {overlaps, placeBubble, type ScreenBox} from './stage-layout';

const root=document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML=`<main class="stage" aria-label="腿庫小島"><div class="scene" aria-hidden="true"></div><div class="blocked-counter" hidden aria-live="polite"></div><div class="stage-heading" aria-live="polite"></div><div class="speech"></div><div class="envelope-count" hidden>×50</div><aside class="stage-grant"></aside><div class="key-card" hidden><small>展示用假金鑰</small><div class="key-value">sk-7Hq2-9xPf<span class="ink-swipe"></span></div><strong>AI 只看得到這樣</strong></div><div class="closing-numbers" hidden aria-live="polite"></div><div class="stage-end" hidden><div class="brand">${brand}</div><p>每一次使用，都在你的授權之內。</p><small>Give AI access. Not your secrets.</small></div><div class="stage-footer"><span>PassVault 推庫</span><span class="stage-hint">空白鍵開場</span></div><div class="connection" role="status"></div><div class="loading" role="status"><span class="loading-mark">▰</span><strong>載入中</strong><p>腿庫正在準備小島</p></div><dialog class="pass-dialog"><form><div class="brand">${brand}</div><h2>舞台通行碼</h2><p>只在這次開啟的頁面使用。</p><label for="stage-pass">通行碼</label><input id="stage-pass" type="password" autocomplete="off" required><button type="submit">進入舞台</button><p class="pass-note">請在投影前輸入。</p></form></dialog></main>`;
const shell=root.querySelector<HTMLElement>('.stage')!;
const keyShade=document.createElement('div');keyShade.className='key-shade';keyShade.setAttribute('aria-hidden','true');shell.append(keyShade);
const closingScreen=document.createElement('div');closingScreen.className='closing-screen';closingScreen.hidden=true;shell.append(closingScreen);
const sceneHost=root.querySelector<HTMLElement>('.scene')!;
const counter=root.querySelector<HTMLElement>('.blocked-counter')!;
let lastBlockedLabel='';
const heading=root.querySelector<HTMLElement>('.stage-heading')!;
const speech=root.querySelector<HTMLElement>('.speech')!;
const grantCard=root.querySelector<HTMLElement>('.stage-grant')!;
const keyCard=root.querySelector<HTMLElement>('.key-card')!;
const numbersCard=root.querySelector<HTMLElement>('.closing-numbers')!;
let closingSnapshot:ReturnType<typeof closingCounts>|undefined;
const endCard=root.querySelector<HTMLElement>('.stage-end')!;
const contactCard=document.createElement('div');contactCard.className='closing-contact';contactCard.hidden=true;
contactCard.innerHTML=`<div class="contact-text"><div class="brand">${brand}</div><p class="contact-say">想試用、想合作？<br>掃 QR，<b>直接寄信給我</b></p><span class="contact-mail">lelelkeke0935@gmail.com</span></div><img class="contact-qr" src="${new URL('./assets/stage/contact-qr.svg',import.meta.url).href}" alt="寄信給 PassVault 推庫的 QR code">`;
closingScreen.append(numbersCard,endCard,contactCard);
const mascot=document.createElement('img');mascot.className='closing-mascot';mascot.alt='開心眨眼的腿庫';mascot.src=new URL('./assets/stage/corgi-wink.webp',import.meta.url).href;endCard.append(mascot);
const connection=root.querySelector<HTMLElement>('.connection')!;
const dialog=root.querySelector<HTMLDialogElement>('dialog')!;
let stageToken='', ready=false, busy=false;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let data:Stage={seq:-1,state:'idle',caption:''};
let stateStart=performance.now(), ending=false;
let audioContext:AudioContext|undefined;
function sound(notes:number[]){if(!audioContext)return;const audio=audioContext;try{notes.forEach((frequency,index)=>{const oscillator=audio.createOscillator(),gain=audio.createGain();const at=audio.currentTime+index*.12;oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,at);gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.07,at+.02);gain.gain.exponentialRampToValueAtTime(.0001,at+.22);oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(at);oscillator.stop(at+.24);});}catch{/* Audio is optional. */}}
let renderer:THREE.WebGLRenderer;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(37,1,.1,100);
const world=new THREE.Group();scene.add(world);
scene.add(new THREE.HemisphereLight(0xfff5e4,0xb57772,Math.PI*.45));
const sun=new THREE.DirectionalLight(0xffecd2,Math.PI*.55);sun.position.set(-5,10,8);scene.add(sun);
const fill=new THREE.DirectionalLight(0xd6c7ff,Math.PI*.15);fill.position.set(7,5,-4);scene.add(fill);
const material=(color:number)=>new THREE.MeshStandardMaterial({color,roughness:.86});
const cream=material(0xffdfac),cliff=material(0xb96538),wood=material(0x8a492b),rope=material(0xffe5bc),roofMat=material(0xf29946),doorMat=material(0x5f7478),mint=material(0x8fd6bb);
function mesh(geometry:THREE.BufferGeometry,mat:THREE.Material,parent:THREE.Object3D,x=0,y=0,z=0){const obj=new THREE.Mesh(geometry,mat);obj.position.set(x,y,z);parent.add(obj);return obj;}
function island(x:number,r:number){const group=new THREE.Group();group.position.x=x;world.add(group);mesh(new THREE.CylinderGeometry(r,r*.75,1.15,48),cliff,group,0,-.7,0);mesh(new THREE.CylinderGeometry(r*.76,r*.3,.65,32),material(0xc77749),group,0,-1.55,0);mesh(new THREE.CylinderGeometry(r,r,.22,64),cream,group,0,-.02,0);return group;}
island(-4.5,1.85);island(4.6,2.8);
function ellipsoid(parent:THREE.Object3D,x:number,y:number,z:number,sx:number,sy:number,sz:number,mat:THREE.Material){const obj=mesh(new THREE.SphereGeometry(1,24,16),mat,parent,x,y,z);obj.scale.set(sx,sy,sz);return obj;}
for(const [x,z] of [[-5.6,-.5],[-3.7,-.7],[2.8,-1.5],[6.5,.5]]){for(let n=0;n<3;n++){const leaf=ellipsoid(world,x+n*.12,.28,z,.12,.38,.09,material(n%2?0x8eaa63:0x6f8754));leaf.rotation.z=(n-1)*.48;}}
for(const [x,z] of [[-5.5,.8],[3.8,1.1],[5.2,1.4],[6.3,1.6]])ellipsoid(world,x,.14,z,.28,.1,.2,material(0xd9ae85));
const clouds=new THREE.Group();scene.add(clouds);
for(let i=0;i<8;i++){const cloud=new THREE.Group();cloud.position.set((i%4-1.5)*6,-3-(i%3)*.5,(i<4?-5:4));for(let j=0;j<3;j++)ellipsoid(cloud,j*.7,Math.sin(j)*.2,0,.9,.65,.6,material(0xffe3dc));clouds.add(cloud);}
// The lifting group pivots at the vault island; its support posts stay in world space.
const bridge=new THREE.Group();bridge.position.set(2.05,.12,0);world.add(bridge);
const planks:THREE.Mesh[]=[];
for(let i=0;i<12;i++){const plank=mesh(new THREE.BoxGeometry(.37,.15,1.2),wood,bridge,-.18-i*.36,Math.sin(i/11*Math.PI)*-.22,0);planks.push(plank);}
for(const z of [-.6,.6]){
 const points=Array.from({length:25},(_,i)=>new THREE.Vector3(-i/24*4.25,.8-Math.sin(i/24*Math.PI)*.24,z));
 mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),40,.045,8,false),rope,bridge);
 for(const x of [-2.2,2.05]){mesh(new THREE.CylinderGeometry(.1,.13,1.12,16),wood,world,x,.55,z);const tie=mesh(new THREE.TorusGeometry(.13,.035,8,20),rope,world,x,.84,z);tie.rotation.x=Math.PI/2;}
}
const vault=new THREE.Group();vault.position.set(4.95,.12,-.55);world.add(vault);
mesh(new RoundedBoxGeometry(2.3,2.1,1.9,4,.16),cream,vault,0,1.05,0);
const roof=mesh(new THREE.ConeGeometry(1.92,.95,4),roofMat,vault,0,2.58,0);roof.rotation.y=Math.PI/4;roof.scale.z=.94;
const trim=mesh(new THREE.BoxGeometry(2.48,.12,2.06),rope,vault,0,2.12,0);
const doorRing=mesh(new THREE.TorusGeometry(.77,.105,12,48),material(0xd6b886),vault,0,1.03,1.01);
const door=new THREE.Group();door.position.set(-.7,1.03,1.04);vault.add(door);
const face=mesh(new THREE.CylinderGeometry(.67,.67,.13,48),doorMat,door,.7,0,0);face.rotation.x=Math.PI/2;
const wheel=new THREE.Group();wheel.position.set(.7,0,.14);door.add(wheel);
mesh(new THREE.TorusGeometry(.32,.045,10,32),rope,wheel);
for(let i=0;i<3;i++){const spoke=mesh(new THREE.BoxGeometry(.045,.35,.045),rope,wheel,0,0,0);spoke.rotation.z=i*Math.PI*2/3;spoke.position.set(Math.sin(-spoke.rotation.z)*.16,Math.cos(spoke.rotation.z)*.16,0);}
const hub=mesh(new THREE.SphereGeometry(.1,16,12),roofMat,wheel,0,0,.05);hub.scale.z=.45;
const windowRing=mesh(new THREE.TorusGeometry(.32,.065,12,32),rope,vault,-1.17,1.35,0);windowRing.rotation.y=-Math.PI/2;
const windowPane=mesh(new THREE.CircleGeometry(.29,32),doorMat,vault,-1.18,1.35,0);windowPane.rotation.y=-Math.PI/2;
const glow=mesh(new THREE.CircleGeometry(.68,48),new THREE.MeshBasicMaterial({color:0xffedb1,transparent:true,opacity:.7}),vault,0,1.03,.99);
const threshold=mesh(new THREE.BoxGeometry(.12,.7,1.38),new THREE.MeshBasicMaterial({color:0xf35d59,transparent:true,opacity:.7}),world,1.42,.42,0);
threshold.visible=false;
const textures=new Map<string,THREE.Texture>();
function sprite(name:string,height:number){const mat=new THREE.SpriteMaterial({map:textures.get(name),transparent:true,depthWrite:false,toneMapped:false});const obj=new THREE.Sprite(mat);const size=meta[name as keyof typeof meta];obj.scale.set(height*size[0]/size[1],height,1);obj.center.set(.5,0);world.add(obj);return obj;}
function outfit(obj:THREE.Sprite,name:string,height:number){if(obj.userData.outfit===name&&obj.scale.y===height)return;obj.userData.outfit=name;obj.material.map=textures.get(name)!;obj.material.needsUpdate=true;const size=meta[name as keyof typeof meta];obj.scale.set(height*size[0]/size[1],height,1);}
let corgi:THREE.Sprite,robot:THREE.Sprite,envelopes:THREE.Sprite;
const props:THREE.Sprite[]=[];
function setState(next:Stage){
 const changed=next.state!==data.state || (next.state==='intro'&&next.seq!==data.seq);
 data=next;
 const label=blockedLabel(next.blockedCount);
 counter.hidden=!label;shell.classList.toggle('has-counter',!!label);
 if(label!==lastBlockedLabel){counter.textContent=label;counter.classList.remove('count-bump');void counter.offsetWidth;counter.classList.add('count-bump');lastBlockedLabel=label;}
 if(changed){stateStart=performance.now();ending=false;closingSnapshot=undefined;keyCard.classList.remove('masked','flying');if(next.state==='blocked'||next.state==='denied')sound([130,90]);if(next.state==='allowed')sound([520,780]);if(next.state==='sent')sound([660]);if(next.state==='locked')sound([220,110,330]);if(next.state==='intro')sound([440,550,660,880]);}
 const titles:Partial<Record<StageState,string>>={masked:'AI 只拿到塗黑的金鑰',blocked:'已擋下',allowed:'已授權一次',sent:'已授權一次',denied:'授權只限一次',locked:'已全部收回'};
 heading.dataset.state=data.state;heading.textContent=titles[data.state]||'';heading.dataset.tone=['blocked','denied'].includes(data.state)?'red':['allowed','sent'].includes(data.state)?'mint':'ink';heading.hidden=!titles[data.state];
 speech.textContent=data.state==='retry'?'我再試試':data.caption;speech.hidden=!speech.textContent||data.state==='locked';
 grantCard.hidden=!['blocked','retry'].includes(data.state);
 if(data.state==='retry')grantCard.innerHTML='<h2>AI 還想再試</h2><p class="once">收回所有授權</p><div class="stage-lock-hint">全部收回</div><div class="phone-hint">請在手機按「全部收回」</div>';
 if(data.state==='blocked')grantCard.innerHTML=`<span class="card-eyebrow">已擋下，等你授權</span><h2>${escapeHtml(data.grant?.summary||'要寄給 50 人')}</h2><p class="once">只限這一次</p><dl><div><dt>誰提出請求</dt><dd>${escapeHtml(data.grant?.agent||'AI')}</dd></div><div><dt>使用的金鑰</dt><dd>${escapeHtml(data.grant?.secretName||'—')}</dd></div></dl><div class="phone-hint">請在手機按「授權這一次」</div>`;
 root.querySelector<HTMLElement>('.stage-hint')!.textContent=data.state==='idle'?'空白鍵開場':isMock?'示範模式':'';
}
let viewport={x:0,y:0,width:0,height:0},lastFrame=0;
function resize(){shell.classList.toggle('portrait',innerWidth<innerHeight);viewport.width=0;}
function screenBox(element:HTMLElement):ScreenBox {const r=element.getBoundingClientRect();return {x:r.left,y:r.top,width:r.width,height:r.height};}
function projectPoint(point:THREE.Vector3){const p=point.clone().project(camera);return {x:viewport.x+(p.x*.5+.5)*viewport.width,y:viewport.y+(-p.y*.5+.5)*viewport.height};}
function projectedBox(points:THREE.Vector3[]):ScreenBox {const projected=points.map(projectPoint),xs=projected.map(p=>p.x),ys=projected.map(p=>p.y);const x=Math.min(...xs),y=Math.min(...ys);return {x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y};}
// Sprites face the camera: their head/corner anchors use camera axes, not world Y.
function spriteCorners(obj:THREE.Sprite){
 const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);
 const center=obj.getWorldPosition(new THREE.Vector3());
 return [0,1].flatMap(x=>[0,1].map(y=>center.clone().addScaledVector(right,(x-obj.center.x)*obj.scale.x).addScaledVector(up,(y-obj.center.y)*obj.scale.y)));
}
function spriteBox(obj:THREE.Sprite){return projectedBox(spriteCorners(obj));}
// Fit actual geometry and attached labels, avoiding a large empty bounding cuboid.
function fitScene(){
 const target=new THREE.Vector3(.55,.7,0),direction=new THREE.Vector3(3,5.7,18.8).normalize();
 camera.position.copy(target).add(direction);camera.lookAt(target);camera.updateMatrixWorld(true);world.updateMatrixWorld(true);
 const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);
 const tangent=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));let distance=0;
 function include(point:THREE.Vector3,padX=0,padTop=0){
  const delta=point.clone().sub(target),depth=delta.dot(direction),x=delta.dot(right),y=delta.dot(up);
  const roomX=Math.max(.12,.96-2*padX/viewport.width),roomY=Math.max(.12,.96-2*(y>0?padTop:0)/viewport.height);
  distance=Math.max(distance,depth+Math.abs(x)/(tangent*camera.aspect*roomX),depth+Math.abs(y)/(tangent*roomY));
 }
 world.traverseVisible(obj=>{
  if(obj instanceof THREE.Mesh){
   const geometry=obj.geometry;
   if(!geometry.boundingBox)geometry.computeBoundingBox();
   const box=geometry.boundingBox!;
   for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])include(new THREE.Vector3(x,y,z).applyMatrix4(obj.matrixWorld));
  }else if(obj instanceof THREE.Sprite){for(const point of spriteCorners(obj))include(point);}
 });
 if(!speech.hidden){
  const head=robot.getWorldPosition(new THREE.Vector3()).addScaledVector(up,robot.scale.y);
  include(head,speech.offsetWidth/2+8,speech.offsetHeight+22);
 }
 const badge=root.querySelector<HTMLElement>('.envelope-count')!;
 if(!badge.hidden){const corners=spriteCorners(envelopes);include(corners[3],badge.offsetWidth+8,badge.offsetHeight+18);}
 camera.position.copy(target).addScaledVector(direction,distance);camera.lookAt(target);camera.updateMatrixWorld(true);
}
function layoutStage(now:number,ending:boolean,modal:boolean){
 const width=shell.clientWidth||innerWidth,height=shell.clientHeight||innerHeight,phone=width<height,gap=phone?12:height<=600?16:20;
 const dt=Math.min(.1,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
 const rail=!grantCard.hidden;
 speech.style.maxWidth=`${phone?112:rail?width-grantCard.offsetWidth-gap*3:width-gap*2}px`;
 shell.classList.toggle('key-modal',modal);shell.classList.toggle('is-ending',ending);
 // Share the top row when clear; labels on scene objects never reserve a screen row.
 const badge=root.querySelector<HTMLElement>('.envelope-count')!;
 let headingTop=gap;
 heading.style.top=`${headingTop}px`;
 if(!counter.hidden&&!heading.hidden&&overlaps(screenBox(heading),screenBox(counter),gap)){headingTop=gap+counter.offsetHeight+gap;heading.style.top=`${headingTop}px`;}
 const headingBottom=headingTop+(heading.hidden?0:heading.offsetHeight);
 const top=headingBottom+gap;
 const footer=phone?46:50;
 grantCard.style.top=phone?'auto':`${headingBottom+gap}px`;
 grantCard.style.maxHeight=`${phone?height*.36:height-headingBottom-gap-footer}px`;
 const railBox=screenBox(grantCard);
 const target={x:gap,y:top,width:width-gap*2,height:Math.max(80,height-top-footer)};
 if(rail){if(phone)target.height=Math.max(80,railBox.y-gap-top);else target.width=Math.max(80,railBox.x-gap*2);}
 const blend=reduced.matches||!viewport.width?1:1-Math.exp(-dt*12);
 viewport.y=target.y;
 for(const key of ['x','width','height'] as const)viewport[key]=Math.abs(viewport[key]-target[key])<.5?target[key]:lerp(viewport[key],target[key],blend);
 viewport.height=Math.min(viewport.height,height-viewport.y-footer);
 // Hide the incoming card until its lane is clear, including during viewport interpolation.
 const clear=!overlaps({x:viewport.x,y:viewport.y,width:viewport.width,height:viewport.height},railBox,2);
 grantCard.classList.toggle('rail-ready',rail&&clear);
 sceneHost.style.left=`${viewport.x}px`;sceneHost.style.top=`${viewport.y}px`;sceneHost.style.width=`${viewport.width}px`;sceneHost.style.height=`${viewport.height}px`;
 const renderWidth=Math.round(viewport.width),renderHeight=Math.round(viewport.height);
 if(renderer.domElement.width!==Math.floor(renderWidth*renderer.getPixelRatio())||renderer.domElement.height!==Math.floor(renderHeight*renderer.getPixelRatio()))renderer.setSize(renderWidth,renderHeight,false);
 camera.aspect=viewport.width/viewport.height;camera.updateProjectionMatrix();fitScene();
 if(!badge.hidden){
  const box=spriteBox(envelopes);
  badge.hidden=box.x+box.width<viewport.x||box.x>viewport.x+viewport.width||box.y+box.height<viewport.y||box.y>viewport.y+viewport.height;
  badge.style.left=`${box.x+box.width-4}px`;badge.style.top=`${box.y-badge.offsetHeight-12}px`;
 }
 if(!speech.hidden){
  const box=spriteBox(robot),head={x:box.x+box.width/2,y:box.y,right:box.x+box.width};
  const obstacles=[heading,counter].filter(element=>!element.hidden).map(screenBox);
  const result=placeBubble(speech.offsetWidth,speech.offsetHeight,head,obstacles);
  speech.style.left=`${result.x}px`;speech.style.top=`${result.y}px`;speech.dataset.tail=result.tail;
 }

}
const lerp=THREE.MathUtils.lerp;const clamp=(n:number)=>THREE.MathUtils.clamp(n,0,1);
function render(now:number){
 if(!ready)return;
 const t=(now-stateStart)/1000,s=data.state;
 const endTime=endingElapsed(s,t);
 ending=endTime!==null;
 const endElapsed=endTime??0;
 const moving=!reduced.matches;
 const blocked=['blocked','denied'].includes(s);
 threshold.visible=blocked&&!ending;
 bridge.rotation.z=bridgeAngle(s,t,reduced.matches);
 planks.forEach((plank,i)=>plank.material=(s==='sent'||s==='allowed'&&t>i*.045)?mint:wood);
 door.rotation.y=s==='intro'&&t<5?-.95:s==='sent'&&t<2.3?-.85:0;
 wheel.rotation.z=s==='locked'?clamp((t-2)/1.2)*Math.PI*2:s==='sent'?Math.min(t/3,1)*Math.PI*2:s==='masked'?Math.min(t,1)*Math.PI*2:0;
 glow.visible=door.rotation.y!==0;
 const ringMaterial=doorRing.material as THREE.MeshStandardMaterial;
 ringMaterial.emissive.setHex(0xffe6b4);ringMaterial.emissiveIntensity=s==='locked'?Math.max(0,1-Math.abs(t-3.2)/.55)*1.8:0;
 corgi.position.set(2.25,.14,.6);robot.position.set(-4.5,.14,.25);
 outfit(corgi,ending?(endElapsed<1?'corgi-sit':'corgi-wink'):s==='blocked'?(t<1.3?'corgi-block':'corgi-alert'):s==='retry'?'corgi-alert':s==='locked'?(t<2?'corgi-paw':'corgi-happy'):s==='denied'?'corgi-paw':['allowed','sent'].includes(s)?'corgi-hop':s==='idle'?'corgi-sit':'corgi-happy',2.35);
 outfit(robot,s==='masked'?'robot-squint':s==='locked'?(t<1.1?'robot-flinch':'robot-droop'):s==='denied'?'robot-droop':['blocked','retry'].includes(s)?'robot-push':'robot-idle',2.15);
 if(['allowed','sent'].includes(s)){corgi.position.z=1.15;if(moving&&s==='allowed')corgi.position.y+=Math.max(0,Math.sin(Math.min(t,1)*Math.PI))*.6;}
 if(s==='locked'){const hop=moving?clamp(t/.5):1;corgi.position.set(lerp(2.25,2.95,hop),.14+(moving?Math.sin(hop*Math.PI)*.65:0),lerp(.6,1.15,hop));}
 if(ending)corgi.position.set(4.5,.15,1);
 outfit(envelopes,'prop-envelopes',innerWidth<innerHeight?1.05:1.6);
 envelopes.visible=['blocked','allowed','sent','denied'].includes(s)&&!ending;
 envelopes.position.set(-.7,1.25,.15);
 if(s==='sent'){const progress=clamp(t/2.3);envelopes.position.set(lerp(-.7,4.9,moving?progress:1),lerp(1.25,.65,progress),.4);envelopes.material.opacity=moving?1:1-progress;if(t>2.3)envelopes.visible=false;}else{envelopes.material.opacity=1;}
 // Return beside the robot, below its attached speech bubble; keep the same timing.
 if(s==='denied'){const progress=clamp((t-2)/2);envelopes.position.set(lerp(-.7,-2.8,progress),lerp(1.25,innerWidth<innerHeight?-.9:-.45,progress),lerp(.15,1.4,progress));if(t>4)envelopes.visible=false;}
 props.forEach((prop,i)=>{const progress=clamp((t-i*1.05)/1.5);prop.visible=s==='intro'&&t>i*1.05&&progress<1;prop.position.set(lerp(-3.8+i*.7,4.9,moving?progress:1),1.8+Math.sin(progress*Math.PI)*1.4,1.2);prop.material.opacity=moving?1:1-progress;});
 const keyFlight=clamp((t-2.7)/.6),keyModal=s==='masked'&&keyFlight<1;
 keyCard.hidden=s!=='masked';keyCard.classList.toggle('masked',s==='masked'&&t>=1);keyCard.classList.toggle('flying',s==='masked'&&t>=2.7);
 keyShade.style.opacity=s==='masked'?String(1-clamp((t-2.7)/.3)):'0';
 speech.hidden=speech.hidden||keyModal;
 sceneHost.style.opacity=reduced.matches?String(clamp(t/.2)):'1';
 keyCard.style.opacity='1';
 if(ending&&closingSnapshot===undefined){
  closingSnapshot=closingCounts(data);
  numbersCard.innerHTML=closingSnapshot?closingSnapshot.map((count,index)=>`<div class="closing-stat"><span>${['AI 拿到金鑰','擋下','你授權'][index]}</span><strong>${count}<small>次</small></strong></div>`).join(''):'';
 }
 const phase=closingPhase(endElapsed,!!closingSnapshot);
 numbersCard.hidden=!ending||phase!=='numbers';
 endCard.hidden=!ending||phase!=='brand';
 contactCard.hidden=!ending||phase!=='contact';
 // Fade during the last half-second of the existing settle beat, before the numbers.
 closingScreen.hidden=!ending||endElapsed<1.1;
 closingScreen.style.opacity=ending?String(reduced.matches?1:clamp((endElapsed-1.1)/.5)):'0';
 counter.classList.toggle('faded',ending);
 if(ending){heading.hidden=true;speech.hidden=true;grantCard.hidden=true;keyCard.hidden=true;}
 if(moving)clouds.position.x=Math.sin(now*.00008)*.3;
 const envelopeCount=root.querySelector<HTMLElement>('.envelope-count')!;envelopeCount.hidden=!envelopes.visible||ending;
 layoutStage(now,ending,keyModal);
 if(s==='masked'){
  const hand=projectPoint(robot.position.clone().add(new THREE.Vector3(.35,1.2,.1)));
  const originY=Math.max(innerHeight*.5,heading.getBoundingClientRect().bottom+keyCard.offsetHeight/2+20);
  const progress=reduced.matches?(keyFlight>0?1:0):1-Math.pow(1-keyFlight,3);
  const robotWidth=projectedBox([robot.position.clone().add(new THREE.Vector3(-.6,0,0)),robot.position.clone().add(new THREE.Vector3(.6,0,0))]).width;
  const finalScale=Math.min(.18,Math.max(.055,robotWidth*.75/keyCard.offsetWidth));
  keyCard.style.left=`${lerp(innerWidth*.5,hand.x,progress)}px`;
  keyCard.style.top=`${lerp(originY,hand.y,progress)}px`;
  keyCard.style.transform=`translate(-50%,-50%) scale(${lerp(1,finalScale,progress)})`;
 }
 renderer.render(scene,camera);
 requestAnimationFrame(render);
}
async function command(path:string){if(!ready||busy||dialog.open)return;busy=true;try{await post(path,{'X-Stage-Token':stageToken});connection.textContent='';}catch{connection.textContent='動作未完成，請確認通行碼與連線。';}finally{busy=false;}}
document.addEventListener('keydown',event=>{if(event.repeat||dialog.open||event.ctrlKey||event.metaKey||event.altKey||event.target instanceof HTMLInputElement)return;const key=event.key.toLowerCase();if(event.code==='Space'){event.preventDefault();try{audioContext??=new AudioContext();void audioContext.resume();}catch{/* Silent mode still runs the stage. */}void command('/api/stage/intro');}if(key==='a'&&data.state==='blocked'&&data.grant?.status==='pending')void command(`/api/grants/${encodeURIComponent(data.grant.id)}/allow-stage`);if(key==='l')void command('/api/lockdown/stage');if(key==='r')void command('/api/demo/reset');});
dialog.addEventListener('cancel',event=>event.preventDefault());
dialog.querySelector('form')!.addEventListener('submit',event=>{event.preventDefault();const input=dialog.querySelector<HTMLInputElement>('input')!;stageToken=input.value;input.value='';dialog.close();});
async function boot(){try{
 await document.fonts.ready;
 await Promise.all(Object.keys(meta).map(async name=>{const url=new URL(`./assets/stage/${name}.webp`,import.meta.url).href;const texture=await new THREE.TextureLoader().loadAsync(url);texture.colorSpace=THREE.SRGBColorSpace;textures.set(name,texture);}));
 renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;sceneHost.append(renderer.domElement);
 corgi=sprite('corgi-happy',2.35);robot=sprite('robot-idle',2.15);envelopes=sprite('prop-envelopes',1.6);
 for(const name of ['prop-password','prop-key','prop-doc','prop-photo'])props.push(sprite(name,1.1));
 camera.position.set(3.4,6.6,18.8);resize();addEventListener('resize',resize);ready=true;setState(data);requestAnimationFrame(render);
 root.querySelector<HTMLElement>('.loading')!.hidden=true;
 // A launcher link may carry the stage pass in the hash (#t=...); take it into memory and drop it from the address bar.
 const hashToken=new URLSearchParams(location.hash.slice(1)).get('t');
 if(hashToken){stageToken=hashToken;history.replaceState(null,'',location.pathname+location.search);}
 if(!isMock&&!stageToken)dialog.showModal();
 poll(async()=>{try{const next=await api<Stage>('/api/stage');if(!['idle','intro','masked','blocked','allowed','sent','denied','retry','locked'].includes(next.state))return;setState(next);connection.textContent='';}catch{connection.textContent='連線中…';}},300);
 }catch{root.querySelector<HTMLElement>('.loading')!.innerHTML='<strong>素材尚未載入完成</strong><p>請重新整理，再進入舞台。</p>';}}
void boot();
