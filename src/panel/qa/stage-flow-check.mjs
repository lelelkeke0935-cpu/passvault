import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {build} from 'esbuild';

// Real scene objects and entry code; only GPU, textures, clock and DOM are simulated.
const bundle=await build({entryPoints:[new URL('../stage.ts',import.meta.url).pathname],bundle:true,write:false,format:'cjs',external:['three'],loader:{'.css':'empty'},define:{'import.meta.url':JSON.stringify('http://localhost/stage.ts')},logLevel:'silent'});
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
function element(){const classes=new Set(),events=new Map();return {hidden:false,innerHTML:'',textContent:'',value:'',open:false,offsetWidth:100,dataset:{},style:{},events,
 classList:{add:(...v)=>v.forEach(x=>classes.add(x)),remove:(...v)=>v.forEach(x=>classes.delete(x)),toggle:(x,on)=>on?classes.add(x):classes.delete(x),contains:x=>classes.has(x)},
 addEventListener:(name,fn)=>events.set(name,fn),append(){},showModal(){this.open=true;},close(){this.open=false;}};}
async function harness(reduced=false){
 const nodes=new Map(),get=selector=>{if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);};
 const root=get('#app'),dialog=get('dialog');root.querySelector=get;dialog.querySelector=get;
 const events=new Map(),timers=new Map(),calls=[];let clock=0,nextTimer=0,frame,scene;
 const state={value:{seq:0,state:'idle',caption:'',blockedCount:0,allowedCount:0}};
 const setTimer=(fn,ms)=>{timers.set(++nextTimer,{fn,at:clock+ms});return nextTimer;};
 class Renderer{domElement={};setSize(){}setPixelRatio(){}render(value,camera){scene=value;value.updateMatrixWorld(true);camera.updateMatrixWorld(true);}}
 class Loader{async loadAsync(){return new THREE.Texture();}}
 const context={URL,URLSearchParams,Headers,Response,AbortController,FormData,Promise,console,
  require:name=>{if(name==='three/addons/geometries/RoundedBoxGeometry.js')return {RoundedBoxGeometry};assert.equal(name,'three');return {...THREE,WebGLRenderer:Renderer,TextureLoader:Loader};},
  location:{search:'',pathname:'/stage',origin:'http://localhost'},
  document:{querySelector:()=>root,fonts:{ready:Promise.resolve()},addEventListener:(name,fn)=>events.set(name,fn)},
  innerWidth:1920,innerHeight:1080,devicePixelRatio:1,matchMedia:()=>({matches:reduced}),HTMLInputElement:class {},
  performance:{now:()=>clock},requestAnimationFrame:fn=>{frame=fn;},addEventListener(){},
  setTimeout:setTimer,clearTimeout:id=>timers.delete(id),
  fetch:async(path,init)=>{calls.push({path,init});return Response.json(init.method==='POST'?{ok:true}:state.value);}};
 context.window=context;vm.runInNewContext(bundle.outputFiles[0].text,context);await flush();
 get('input').value='synthetic-stage';get('form').events.get('submit')({preventDefault(){}});
 const draw=ms=>{clock+=ms;frame(clock);};draw(0);
 return {get,calls,draw,scene:()=>scene,
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
