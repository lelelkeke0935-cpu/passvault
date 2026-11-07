import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {build} from 'esbuild';

// Real scene objects and entry code; only GPU, textures, clock and DOM are simulated.
const bundle=await build({entryPoints:[new URL('../stage.ts',import.meta.url).pathname],bundle:true,write:false,format:'cjs',external:['three'],loader:{'.css':'empty'},define:{'import.meta.url':JSON.stringify('http://localhost/stage.ts')},logLevel:'silent'});
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
function element(){const classes=new Set(),events=new Map();return {hidden:false,innerHTML:'',textContent:'',value:'',open:false,offsetWidth:100,offsetHeight:50,dataset:{},style:{},events,
 setAttribute(){},getBoundingClientRect(){return {left:Number.parseFloat(this.style.left)||0,top:Number.parseFloat(this.style.top)||0,width:this.hidden?0:this.offsetWidth,height:this.hidden?0:this.offsetHeight};},
 classList:{add:(...v)=>v.forEach(x=>classes.add(x)),remove:(...v)=>v.forEach(x=>classes.delete(x)),toggle:(x,on)=>on?classes.add(x):classes.delete(x),contains:x=>classes.has(x)},
 addEventListener:(name,fn)=>events.set(name,fn),append(){},showModal(){this.open=true;},close(){this.open=false;}};}
async function harness(reduced=false,width=1920,height=1080){
 const nodes=new Map(),created=[],get=selector=>{const dynamic=created.find(node=>`.${node.className}`===selector);if(dynamic)return dynamic;if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);};
 const root=get('#app'),dialog=get('dialog');root.querySelector=get;dialog.querySelector=get;
 const phone=width<height,gap=phone?12:20;
 get('.stage-grant').offsetWidth=phone?width-24:Math.min(540,Math.max(260,width*.28));
 get('.stage-grant').offsetHeight=phone?280:height<600?220:340;
 get('.stage-grant').getBoundingClientRect=function(){return {left:phone?12:width-20-this.offsetWidth,top:phone?height-46-this.offsetHeight:Number.parseFloat(this.style.top)||100,width:this.offsetWidth,height:this.offsetHeight};};
 get('.stage-heading').offsetWidth=phone?340:Math.min(width-40,700);
 get('.stage-heading').offsetHeight=phone?60:height*.08;
 get('.stage-heading').getBoundingClientRect=function(){return {left:(width-this.offsetWidth)/2,top:Number.parseFloat(this.style.top)||gap,width:this.offsetWidth,height:this.offsetHeight,bottom:(Number.parseFloat(this.style.top)||gap)+this.offsetHeight};};
 get('.speech').offsetWidth=phone?150:200;get('.speech').offsetHeight=phone?44:50;
 get('.key-card').offsetWidth=width*(phone?.86:.46);get('.key-card').offsetHeight=220;
 const events=new Map(),timers=new Map(),calls=[];let clock=0,nextTimer=0,frame,scene;
 const state={value:{seq:0,state:'idle',caption:'',blockedCount:0,allowedCount:0}};
 const setTimer=(fn,ms)=>{timers.set(++nextTimer,{fn,at:clock+ms});return nextTimer;};
 let camera;
 class Renderer{domElement={};ratio=1;setSize(w,h){this.domElement.width=w*this.ratio;this.domElement.height=h*this.ratio;}setPixelRatio(value){this.ratio=value;}getPixelRatio(){return this.ratio;}render(value,view){scene=value;camera=view;value.updateMatrixWorld(true);view.updateMatrixWorld(true);}}
 class Loader{async loadAsync(){return new THREE.Texture();}}
 const context={URL,URLSearchParams,Headers,Response,AbortController,FormData,Promise,console,
  require:name=>{if(name==='three/addons/geometries/RoundedBoxGeometry.js')return {RoundedBoxGeometry};assert.equal(name,'three');return {...THREE,WebGLRenderer:Renderer,TextureLoader:Loader};},
  location:{search:'',hash:'',pathname:'/stage',origin:'http://localhost'},history:{replaceState(){}},
  document:{querySelector:()=>root,createElement:()=>{const node=element();created.push(node);return node;},fonts:{ready:Promise.resolve()},addEventListener:(name,fn)=>events.set(name,fn)},
  innerWidth:width,innerHeight:height,devicePixelRatio:1,matchMedia:()=>({matches:reduced}),HTMLInputElement:class {},
  performance:{now:()=>clock},requestAnimationFrame:fn=>{frame=fn;},addEventListener(){},
  setTimeout:setTimer,clearTimeout:id=>timers.delete(id),
  fetch:async(path,init)=>{calls.push({path,init});return Response.json(init.method==='POST'?{ok:true}:state.value);}};
 context.window=context;vm.runInNewContext(bundle.outputFiles[0].text,context);await flush();
 get('input').value='synthetic-stage';get('form').events.get('submit')({preventDefault(){}});
 const draw=ms=>{clock+=ms;frame(clock);};draw(0);
 return {get,calls,draw,scene:()=>scene,camera:()=>camera,
  update:async value=>{state.value={...state.value,...value,seq:state.value.seq+1};clock+=300;for(const [id,timer] of [...timers])if(timer.at<=clock){timers.delete(id);timer.fn();}await flush();draw(0);},
  key:async key=>{events.get('keydown')({key,code:key===' '?'Space':'Key'+key.toUpperCase(),target:{},preventDefault(){}});await flush();}};
}

test('actual stage waits for owner, lifts bridge with fixed posts, then shows counts and resets',async()=>{
 const app=await harness();
 await app.update({state:'blocked',blockedCount:1});assert.equal(app.get('.blocked-counter').textContent,'已擋下 1 次');
 await app.update({state:'denied',blockedCount:2});app.draw(7900);assert.equal(app.get('.stage-end').hidden,true);
 await app.update({state:'retry',blockedCount:3,allowedCount:1});app.draw(20000);
 assert.equal(app.get('.stage-end').hidden,true);assert.equal(app.get('.speech').textContent,'我再試試');assert.equal(app.get('.stage-grant').hidden,false);
 await app.key('l');assert.ok(app.calls.some(c=>c.path==='/api/lockdown/stage'&&new Headers(c.init.headers).get('X-Stage-Token')==='synthetic-stage'));
 await app.update({state:'locked'});
 const world=app.scene().children.find(node=>node.type==='Group');
 const bridge=world.children.find(node=>node.type==='Group'&&node.position.x===2.05);
 const posts=world.children.filter(node=>node.type==='Mesh'&&node.geometry.type==='CylinderGeometry'&&node.position.y===.55);
 const postPositions=posts.map(node=>node.position.toArray());assert.equal(posts.length,4);
 app.draw(2500);assert.ok(bridge.rotation.z< -1.1);assert.deepEqual(posts.map(node=>node.position.toArray()),postPositions);
 const corgi=world.children.find(node=>node.type==='Sprite'&&node.userData.outfit?.startsWith('corgi-'));
 assert.ok(corgi.position.x>2.05&&corgi.position.z>.6);
 app.draw(3200);assert.equal(app.get('.closing-numbers').hidden,false);assert.match(app.get('.closing-numbers').innerHTML,/>3<small/);assert.match(app.get('.closing-numbers').innerHTML,/>1<small/);
 app.draw(2500);assert.equal(app.get('.closing-numbers').hidden,true);assert.equal(app.get('.stage-end').hidden,false);assert.ok(bridge.rotation.z< -1.1);
 await app.key('r');assert.ok(app.calls.some(c=>c.path==='/api/demo/reset'&&new Headers(c.init.headers).get('X-Stage-Token')==='synthetic-stage'));
 await app.update({state:'idle',blockedCount:0,allowedCount:0});assert.equal(bridge.rotation.z,0);assert.equal(app.get('.blocked-counter').hidden,true);assert.equal(app.get('.stage-end').hidden,true);
});

test('actual stage skips missing stats and respects reduced motion during lock',async()=>{
 const app=await harness(true);await app.update({state:'locked',blockedCount:undefined,allowedCount:undefined});
 assert.equal(app.get('.blocked-counter').hidden,true);app.draw(5700);
 assert.equal(app.get('.closing-numbers').hidden,true);assert.equal(app.get('.stage-end').hidden,false);
});

// These checks exercise real Three.js projection with measured-size DOM fixtures.
// Browser typography and actual CSS painting remain a separate integration check.
const intersects=(a,b)=>a.left<b.left+b.width&&a.left+a.width>b.left&&a.top<b.top+b.height&&a.top+a.height>b.top;
for(const [width,height] of [[1920,1080],[1280,720],[1000,515],[390,844]]){
 test('reserved stage regions and full-scene fit at '+width+'x'+height,async()=>{
  const app=await harness(false,width,height);
  for(const state of ['intro','blocked','allowed','sent','denied','retry','locked']){
   await app.update({state,caption:'再寄一次',blockedCount:3,allowedCount:1});
   for(let frame=0;frame<90;frame++){
    app.draw(1000/60);
    const style=app.get('.scene').style;
    const sceneBox={left:parseFloat(style.left),top:parseFloat(style.top),width:parseFloat(style.width),height:parseFloat(style.height)};
    assert.ok(sceneBox.left>=0&&sceneBox.top>=0&&sceneBox.left+sceneBox.width<=width+.1&&sceneBox.top+sceneBox.height<=height+.1,state+' viewport stays on screen');
    const heading=app.get('.stage-heading'),speech=app.get('.speech'),grant=app.get('.stage-grant');
    if(!heading.hidden)assert.equal(intersects(sceneBox,heading.getBoundingClientRect()),false,state+' headline clears scene');
    if(!speech.hidden){
     assert.equal(intersects(sceneBox,speech.getBoundingClientRect()),false,state+' bubble clears scene');
     if(!heading.hidden)assert.equal(intersects(heading.getBoundingClientRect(),speech.getBoundingClientRect()),false,state+' bubble clears headline');
    }
    if(!grant.hidden&&grant.classList.contains('rail-ready'))assert.equal(intersects(sceneBox,grant.getBoundingClientRect()),false,state+' grant clears scene');
    for(const x of [-6.5,7.6])for(const y of [-2,4.6])for(const z of [-3,3]){
     const p=new THREE.Vector3(x,y,z).project(app.camera());
     assert.ok(Math.abs(p.x)<=.911&&Math.abs(p.y)<=.911,state+' world bounds fit');
    }
   }
   if(['blocked','retry'].includes(state))assert.equal(app.get('.stage-grant').classList.contains('rail-ready'),true,'card becomes visible');
  }
  app.draw(4200);
  assert.equal(app.get('.closing-screen').hidden,false);
  assert.equal(app.get('.closing-screen').style.opacity,'1');
  assert.equal(app.get('.closing-numbers').hidden,false);
  assert.equal(app.get('.stage-grant').hidden,true);
  app.draw(2500);
  assert.equal(app.get('.stage-end').hidden,false);
  assert.equal(app.get('.closing-screen').style.opacity,'1');
  await app.update({state:'idle',caption:'',blockedCount:0,allowedCount:0});
  assert.equal(app.get('.closing-screen').hidden,true);
 });
}

test('masked presentation holds the message then flies to the robot within 0.6 seconds',async()=>{
 const app=await harness();await app.update({state:'masked',caption:'我來使用金鑰'});
 assert.equal(app.get('.key-shade').style.opacity,'1');
 assert.equal(app.get('.speech').hidden,true);
 app.draw(1000);assert.equal(app.get('.key-card').classList.contains('masked'),true);
 app.draw(1700);assert.equal(app.get('.key-card').classList.contains('flying'),true);
 app.draw(600);assert.equal(app.get('.key-shade').style.opacity,'0');
 assert.ok(Number.parseFloat(app.get('.key-card').style.left)<1920/2);
 assert.match(app.get('.key-card').style.transform,/scale\(0\./);
 await app.update({state:'locked'});assert.equal(app.get('.key-card').hidden,true);
});
