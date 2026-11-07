// Run on a machine permitted to launch Chromium. All inputs below are synthetic.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=await import('/Users/kyle/.local/node/lib/node_modules/playwright/index.mjs'));}
const base=process.env.PANEL_TEST_URL||'http://127.0.0.1:5177';
const out=new URL('./screenshots/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const failures=[];
async function screen(path,name,width,height,ready){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
 const page=await context.newPage();page.on('pageerror',error=>failures.push(error.message));
 await page.goto(base+path);
 if(ready)await page.locator(ready).waitFor();
 if(path.startsWith('/stage')){await page.locator('.loading').waitFor({state:'hidden'});await page.waitForTimeout(1800);}
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Horizontal overflow: ${name}`);
 await page.screenshot({path:new URL(name+'.png',out).pathname,fullPage:!path.startsWith('/stage')});
 await context.close();
}
try{
 for(const [w,h] of [[1920,1080],[1280,900],[390,844]])await screen('/stage?mock&state=blocked',`stage-blocked-${w}`,w,h,'.stage-heading');
 for(const [w,h] of [[1280,900],[390,844]]){
  await screen('/?mock&state=blocked',`panel-grants-evidence-${w}`,w,h,'.item-row');
  await screen('/m/grants/demo-grant?mock&state=blocked',`single-grant-${w}`,w,h,'.allow-button');
 }
 for(const state of ['idle','blocked','allowed','locked'])await screen(`/m/remote?mock&state=${state}`,`remote-${state}-390`,390,844,'.phone-card h1');
 const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
 await page.goto(base+'/m/grants/demo-grant?mock&state=blocked');await page.getByRole('button',{name:'授權這一次',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.phone-card')?.textContent.includes('已授權'));assert.equal(await page.getByRole('button',{name:'授權這一次',exact:true}).count(),0);
 await page.goto(base+'/m/grants/demo-grant?mock&state=blocked');await page.getByRole('button',{name:'拒絕',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.phone-card')?.textContent.includes('已拒絕'));
 await page.goto(base+'/?mock&state=idle');await page.locator('.item-row').first().waitFor();await page.locator('#upload').setInputFiles({name:'synthetic.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic fixture')});await page.waitForFunction(()=>document.querySelector('.upload-status')?.textContent.includes('已加密'));assert.equal(await page.getByText('synthetic.txt',{exact:true}).count(),1);
 await page.goto(base+'/stage?mock&state=blocked');await page.locator('.loading').waitFor({state:'hidden'});await page.waitForTimeout(8500);assert.equal(await page.locator('.stage-heading').innerText(),'已擋下');
 await page.goto(base+'/stage?mock&state=masked');await page.locator('.loading').waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('.key-card')?.classList.contains('masked'));await page.screenshot({path:new URL('stage-masked-390.png',out).pathname});
 await context.close();
 assert.equal(failures.length,0,'Runtime exceptions occurred');console.log('Browser checks passed. Screenshots use synthetic data only.');
}finally{await browser.close();}
