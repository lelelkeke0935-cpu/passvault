import { chromium } from '/Users/kyle/.local/node/lib/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true});
const errors=[];
for(const [name,width,height] of [['desktop',1920,1080],['phone',390,844],['panel-width',1280,900]]){
 const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5177/stage?mock&state=blocked');
 await page.locator('.loading').waitFor({state:'hidden'});await page.waitForTimeout(1800);
 await page.screenshot({path:new URL(`stage-${name}.png`,import.meta.url).pathname});
 console.log(name,await page.locator('.stage-heading').innerText(), 'horizontalOverflow',await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await page.close();
}
console.log('Runtime errors:',errors.length);await browser.close();if(errors.length)process.exitCode=1;
