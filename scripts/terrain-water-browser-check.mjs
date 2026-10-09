import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const folder='build/validation/terrain-water';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:1300}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const click=async id=>{await page.locator('#'+id).evaluate(e=>e.click());await frames();};
const input=async(id,value)=>{await page.locator('#'+id).evaluate((e,v)=>{e.value=String(v);e.dispatchEvent(new Event(e.type==='range'?'input':'change',{bubbles:true}));},value);await frames();};
const save=async name=>{
    const pending=page.waitForEvent('download');pending.catch(()=>{});await click('simulation-save');assert.doesNotMatch(await page.locator('#terrain-file-status').textContent(),/Save failed/);
    const download=await pending;await download.saveAs(`${folder}/${name}.json`);return JSON.parse(await readFile(`${folder}/${name}.json`,'utf8'));
};
const capture=async name=>{await frames();return page.locator('#mapgen4').screenshot({path:`${folder}/${name}.png`});};
try {
    await page.goto((process.env.BASE_URL||'http://localhost:8002')+'/embed.html?preview=terrain-water');await page.waitForFunction(()=>document.querySelector('#terrain-generation')?.dataset.pending==='false');await frames();
    assert.deepEqual(errors,[]);const original=await capture('original');await click('planet-generate-climate');const artistSurface=await capture('artist-surface');assert.deepEqual(errors,[]);
    await click('environment-terrain-water');assert.equal(await page.locator('#environment-routing').getAttribute('data-active'),'true');
    const initial=await capture('initial');assert.ok(!initial.equals(artistSurface));
    await input('planet-speed',864000);await click('planet-play');await page.waitForFunction(()=>Number(document.querySelector('#thermal-age').dataset.days)>12,{},{timeout:60000});await click('planet-play');
    const saved=await save('evolved'),evolved=await capture('evolved');assert.ok(!evolved.equals(initial));
    const routing=saved.runtime.state.water.routing;assert.ok(routing.volumeM3.some(v=>v>0));assert.ok(routing.fluxM3S.some(v=>v>0));assert.ok(routing.volumeM3.every(v=>v>=0));
    const waterBudget=Number(await page.locator('#water-budget').getAttribute('data-value'));assert.ok(Number.isFinite(waterBudget)&&Math.abs(waterBudget)<1e-6);
    checks.push('Fine terrain stores, actual flux and natural-surface pixels evolve together while water stays nonnegative');
    await input('planet-layer','original');assert.ok(original.equals(await capture('original-returned')));await input('planet-layer','surface');
    await click('planet-inspect');const box=await page.locator('#mapgen4').boundingBox();let probe='';
    for(const [x,y] of [[.75,.45],[.7,.35],[.4,.4],[.5,.5]]){await page.mouse.click(box.x+box.width*x,box.y+box.height*y);await frames();probe=await page.locator('#planet-probe').textContent();if(probe.includes('terrain reservoir'))break;}
    assert.match(probe,/terrain reservoir: mean depth .* m \/ outflow .* m³\/s/);await click('planet-inspect');
    checks.push('Original artwork restores exactly and the same authored terrain remains pickable');
    await click('environment-terrain-water');await page.locator('#terrain-load').setInputFiles({name:'world.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
    await page.waitForFunction(()=>/restored|failed/.test(document.querySelector('#terrain-file-status').textContent));assert.match(await page.locator('#terrain-file-status').textContent(),/Complete simulation restored/);await frames();
    const restored=await save('restored');assert.deepEqual(restored.runtime,saved.runtime);assert.ok(evolved.equals(await capture('restored')));checks.push('Fine routing volumes, receivers and flux restore with exact surface pixels');
    const corrupt=structuredClone(saved),wetTriangle=corrupt.runtime.state.water.routing.volumeM3.findIndex(v=>v>0);corrupt.runtime.state.water.routing.volumeM3[wetTriangle]+=1e12;
    await page.locator('#terrain-load').setInputFiles({name:'bad-fine-store.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(corrupt))});
    await page.waitForFunction(()=>/Load failed/.test(document.querySelector('#terrain-file-status').textContent));assert.deepEqual((await save('after-corrupt')).runtime,saved.runtime);assert.ok(evolved.equals(await capture('after-corrupt')));
    checks.push('Inconsistent fine/coarse storage is rejected before replacing the active world');
    const routingText=await page.locator('#environment-routing').textContent();
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${folder}/mobile.png`});
    await page.setViewportSize({width:1528,height:1300});await page.goto((process.env.BASE_URL||'http://localhost:8002')+'/tests/terrain-water-render.html');
    await page.waitForFunction(()=>/PASS|FAIL/.test(document.querySelector('pre').textContent));const basin=JSON.parse(await page.locator('pre').textContent());assert.equal(basin.status,'PASS',basin.error);
    await page.screenshot({path:`${folder}/basin.png`,fullPage:true});checks.push('Actual renderer shows rising lake shorelines, saturated ground and a fully dry basin; mobile stays within viewport');
    assert.deepEqual(errors,[]);const report={checks,errors,probe,waterBudget,routing:routingText,steps:saved.runtime.state.thermal.steps,basin};
    await writeFile(`${folder}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {if(errors.length)console.log(JSON.stringify({errors}));await browser.close();}
