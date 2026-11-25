import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const name=process.env.PLAYWRIGHT_MODULE||'playwright';
const {chromium}=await import(name.includes(':')?pathToFileURL(name).href:name);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const folder='experiments/exoplasim/evidence',url=`${process.env.BASE_URL||'http://127.0.0.1:8017'}/experiments/exoplasim/`;
await mkdir(folder,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(url);await page.waitForFunction(()=>window.comparisonReady||document.querySelector('#status')?.dataset.error,{},{timeout:90000});
 assert.equal(await page.locator('#status').getAttribute('data-error'),null,await page.locator('#status').textContent());
 const child=page.frames().find(f=>f.url().includes('comparison=1'));assert.ok(child);
 const digest=()=>child.evaluate(async()=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(window.mapgen4Comparison.snapshot()))))).join(','));
 const before=await digest(),canvas=child.locator('#mapgen4');
 const capture=async name=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:`${folder}/${name}.png`});return canvas.screenshot();};
 for(const field of ['temperature','precipitation','wind']){
  await page.locator('#field').selectOption(field);await page.locator('#gcm').click();const gcm=await capture(`gcm-july-${field}`);
  await page.locator('#native').click();const native=await capture(`native-july-${field}`);
  assert.ok(!gcm.equals(native),`Models must visibly differ: ${field}`);
  checks.push(`Actual ${field} data visibly changes the existing globe on model switch`);
 }
 await page.locator('#gcm').click();await page.locator('#field').selectOption('temperature');await page.locator('#month').selectOption('1');const january=await capture('gcm-january-temperature');
 await page.locator('#month').selectOption('7');const july=await canvas.screenshot();assert.ok(!january.equals(july));
 assert.equal(await digest(),before);checks.push('Month/model/field switches preserve the complete physical runtime exactly');
 await page.locator('#view').selectOption('270,440');await capture('gcm-july-americas');
 await page.setViewportSize({width:390,height:844});await capture('mobile');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks.push('390px layout has no horizontal overflow');
 const bad=await browser.newPage();await bad.route('**/experiments/exoplasim/result.json',route=>route.fulfill({json:{format:'wrong',version:1}}));await bad.goto(url);await bad.waitForSelector('#status[data-error=true]');assert.match(await bad.locator('#status').textContent(),/来源不匹配/);await bad.close();checks.push('Malformed comparison data is rejected before display');
 const staleData=JSON.parse(await readFile('experiments/exoplasim/result.json','utf8'));staleData.gcm.config.glaciers={enabled:false,minDepthM:2,initialHeightM:0};
 const stale=await browser.newPage();await stale.route('**/experiments/exoplasim/result.json',route=>route.fulfill({json:staleData}));await stale.goto(url);await stale.waitForSelector('#status[data-error=true]');assert.match(await stale.locator('#status').textContent(),/错误的冰川初始化/);await stale.close();checks.push('Old runs with unintended native glacier seeding are rejected');
 assert.deepEqual(errors,[]);await writeFile(`${folder}/browser-report.json`,JSON.stringify({checks,errors,physicalStateUnchanged:true},null,2));console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
