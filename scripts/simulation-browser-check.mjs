import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const folder='build/validation/simulation';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:1300}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
// Control only the browser scheduling clock, never the simulation or renderer.
await page.addInitScript(()=>{
    let now=0,id=0;const callbacks=new Map();
    Object.defineProperty(performance,'now',{value:()=>now});
    window.requestAnimationFrame=cb=>{callbacks.set(++id,cb);return id;};
    window.cancelAnimationFrame=id=>callbacks.delete(id);
    window.advanceFrames=(n,dt)=>{for(let i=0;i<n;i++){now+=dt;const batch=[...callbacks.values()];callbacks.clear();for(const cb of batch)cb(now);}};
    window.delaySavedTerrain=0;const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker {
        addEventListener(type,callback,...options){if(type!=='message')return super.addEventListener(type,callback,...options);
            return super.addEventListener(type,e=>{if(e.data.revision===0&&window.delaySavedTerrain)setTimeout(()=>callback(e),window.delaySavedTerrain);else callback(e);},...options);}
    };
});
const frames=(n=2,dt=16)=>page.evaluate(([n,dt])=>window.advanceFrames(n,dt),[n,dt]);
const click=async id=>{await page.locator('#'+id).evaluate(e=>e.click());await frames();};
const input=async(id,value)=>{await page.locator('#'+id).evaluate((e,v)=>{e.value=String(v);e.dispatchEvent(new Event(e.type==='range'?'input':'change',{bubbles:true}));},value);await frames();};
const ready=async()=>{await page.waitForFunction(()=>document.querySelector('#terrain-generation')?.dataset.pending==='false',{},{polling:50});await frames();};
const save=async(name,id='simulation-save')=>{
    const pending=page.waitForEvent('download');pending.catch(()=>{});await click(id);
    assert.doesNotMatch(await page.locator('#terrain-file-status').textContent(),/Save failed/);
    const file=await pending;await file.saveAs(`${folder}/${name}.json`);return JSON.parse(await readFile(`${folder}/${name}.json`,'utf8'));
};
const load=async d=>{await page.locator('#terrain-load').setInputFiles({name:'world.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(d))});await page.waitForFunction(()=>!/Reading|Preparing/.test(document.querySelector('#terrain-file-status').textContent),{},{polling:50});await frames();return page.locator('#terrain-file-status').textContent();};
const globe=async name=>{await frames();return page.locator('#mapgen4').screenshot({path:`${folder}/${name}.png`});};
const evolve=async()=>{await click('planet-play');await frames(120,50);await click('planet-play');await frames();};
try {
    await page.goto((process.env.BASE_URL||'http://localhost:8002')+'/embed.html?preview=simulation-save');await ready();
    await click('planet-generate-climate');await input('planet-speed',864000);
    await input('environment-current',.65);await click('environment-vegetation');await click('environment-vegetation');
    await evolve();const saved=await save('saved'),before=await globe('saved');
    assert.ok(saved.runtime.state.thermal.steps>100);assert.equal(saved.runtime.environmentConfig.oceanStrengthMps,.65);
    await evolve();const uninterrupted=await save('uninterrupted'),future=await globe('uninterrupted');
    await input('planet-radius',8100);await input('environment-current',0);
    assert.match(await load(saved),/Complete simulation restored/);await ready();
    assert.equal(await page.locator('#planet-play').textContent(),'Play');assert.equal(await page.locator('#planet-layer').inputValue(),'surface');
    assert.equal(await page.locator('#environment-current').inputValue(),'0.65');assert.ok(Math.abs(Number(await page.locator('#planet-radius').inputValue())-saved.terrain.settings.planet.radiusM/1000)<1e-9);
    assert.deepEqual(await save('restored'),saved);assert.ok(before.equals(await globe('restored')),'Saved surface pixels must match restored pixels');
    checks.push('Real download/upload restores all state, options, clock, comparison and exact globe pixels');
    await evolve();const resumed=await save('resumed');
    assert.deepEqual(resumed.runtime,uninterrupted.runtime);assert.deepEqual(resumed.terrain,uninterrupted.terrain);assert.ok(future.equals(await globe('resumed')));
    checks.push('Real browser uninterrupted and restored branches resume to identical model fields and globe pixels');
    await click('planet-compare-environment');await page.screenshot({path:`${folder}/comparison.png`});
    const csvWait=page.waitForEvent('download');await click('environment-export');const csvFile=await csvWait;const csv=await readFile(await csvFile.path(),'utf8');await writeFile(`${folder}/comparison.csv`,csv);assert.ok(csv.includes('0.65'));
    assert.ok(Math.abs(Number(await page.locator('#environment-energy').getAttribute('data-value')))<1e-4);
    await click('environment-close');checks.push('Comparison baseline, history and conservation diagnostics remain available after resume');
    for(const change of [d=>d.version=77,d=>d.runtime.state.water.snowKgM2=[1],d=>d.runtime.state.land[0]=1-d.runtime.state.land[0],d=>d.runtime.state.thermal.radiationJm2=null]) {
        const bad=structuredClone(saved);change(bad);assert.match(await load(bad),/Load failed/);assert.deepEqual(await save('after-invalid'),resumed);
    }
    checks.push('Malformed versions, dimensions, nonfinite data and mismatched actual terrain preserve the current world');
    await page.evaluate(()=>window.delaySavedTerrain=400);
    await page.locator('#terrain-load').setInputFiles({name:'delayed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
    await page.waitForFunction(()=>/Preparing/.test(document.querySelector('#terrain-file-status').textContent),{},{polling:20});await input('planet-radius',8000);
    await page.waitForFunction(()=>/canceled/.test(document.querySelector('#terrain-file-status').textContent),{},{polling:50});assert.equal(await page.locator('#planet-radius').inputValue(),'8000');
    await page.evaluate(()=>window.delaySavedTerrain=0);checks.push('Editing during asynchronous candidate generation cancels replacement');
    const legacy=await save('legacy','terrain-save');assert.match(await load(legacy),/Terrain document loaded/);await ready();
    assert.equal(await page.locator('#thermal-enabled').isChecked(),false);assert.equal(await page.locator('#water-enabled').isChecked(),false);
    const off=await save('off');assert.match(await load(off),/Complete simulation restored/);assert.deepEqual(await save('off-restored'),off);
    checks.push('Legacy terrain-only files retain climate-off semantics; complete off-state files roundtrip');
    await click('planet-generate-climate');await input('geomorph-diffusion',10000000);
    await click('geomorph-capture');await click('geomorph-step');await click('geomorph-apply');await ready();
    const box=await page.locator('#mapgen4').boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);await ready();
    const authored=await save('authored'),authoredPixels=await globe('authored');assert.ok(authored.terrain.offsets.some(v=>v!==0));assert.ok(authored.terrain.constraints.painted);
    await click('button-reset');await ready();assert.match(await load(authored),/Complete simulation restored/);
    assert.deepEqual(await save('authored-restored'),authored);assert.ok(authoredPixels.equals(await globe('authored-restored')));
    checks.push('Complete simulation preserves both applied erosion and subsequent painting, with exact restored state and pixels');
    await load(saved);await frames();await page.setViewportSize({width:390,height:844});await page.locator('#terrain-session').evaluate(e=>e.scrollIntoView());await frames();
    await page.screenshot({path:`${folder}/mobile.png`});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);const report={checks,errors,bytes:Buffer.byteLength(JSON.stringify(saved)),steps:saved.runtime.state.thermal.steps,resumedSteps:resumed.runtime.state.thermal.steps};
    await writeFile(`${folder}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}
