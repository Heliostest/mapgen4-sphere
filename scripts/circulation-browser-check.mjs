import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const folder=process.env.CIRCULATION_FOLDER||'build/validation/circulation';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:1300}}),errors=[],checks=[],pixelChecks=[];
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
    // Simulation callbacks use a controlled clock; compositor presentation does not.
    const present=requestAnimationFrame.bind(window);
    window.presentBrowserFrame=()=>new Promise(resolve=>present(()=>present(resolve)));
    let now=0,id=0;const callbacks=new Map();Object.defineProperty(performance,'now',{value:()=>now});
    window.requestAnimationFrame=cb=>{callbacks.set(++id,cb);return id;};window.cancelAnimationFrame=id=>callbacks.delete(id);
    window.advanceFrames=(n,dt)=>{for(let i=0;i<n;i++){now+=dt;const batch=[...callbacks.values()];callbacks.clear();for(const cb of batch)cb(now);}};
});
const frames=(n=2,dt=16)=>page.evaluate(([n,dt])=>window.advanceFrames(n,dt),[n,dt]);
const click=async id=>{await page.locator('#'+id).evaluate(e=>e.click());await frames();};
const input=async(id,value)=>{await page.locator('#'+id).evaluate((e,v)=>{e.value=String(v);e.dispatchEvent(new Event(e.type==='range'?'input':'change',{bubbles:true}));},value);await frames();};
const save=async name=>{const pending=page.waitForEvent('download');pending.catch(()=>{});await click('simulation-save');assert.doesNotMatch(await page.locator('#terrain-file-status').textContent(),/Save failed/);await (await pending).saveAs(`${folder}/${name}.json`);return JSON.parse(await readFile(`${folder}/${name}.json`,'utf8'));};
const load=async d=>{await page.locator('#terrain-load').setInputFiles({name:'world.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(d))});await page.waitForFunction(()=>!/Reading|Preparing/.test(document.querySelector('#terrain-file-status').textContent),{},{polling:50});await frames();return page.locator('#terrain-file-status').textContent();};
const present=()=>page.evaluate(()=>window.presentBrowserFrame());
const globe=async name=>{
    await frames();await present();
    return page.locator('#mapgen4').screenshot({path:`${folder}/${name}.png`});
};
// Retain both original PNGs, decoded statistics and scheduling state on failure.
// PNG byte equality remains the acceptance requirement; decoding is diagnostic.
const exactPixels=async(label,a,b)=>{
    const diff=await page.evaluate(async images=>{
        const pixels=[];let width=0,height=0;
        for(const data of images){const img=await createImageBitmap(new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],{type:'image/png'}));const c=document.createElement('canvas');c.width=width=img.width;c.height=height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);pixels.push(ctx.getImageData(0,0,width,height).data);img.close();}
        let channels=0,max=0;for(let i=0;i<pixels[0].length;i++){const d=Math.abs(pixels[0][i]-pixels[1][i]);if(d)channels++;max=Math.max(max,d);}
        return {width,height,channels,max};
    },[a.toString('base64'),b.toString('base64')]);
    pixelChecks.push({label,pngEqual:a.equals(b),sha256:[a,b].map(v=>createHash('sha256').update(v).digest('hex')),decoded:diff,ui:await page.evaluate(()=>({now:performance.now(),age:document.querySelector('#thermal-age').dataset.days,play:document.querySelector('#planet-play').textContent,layer:document.querySelector('#planet-layer').value,status:document.querySelector('#terrain-file-status').textContent}))});
    await writeFile(`${folder}/pixel-checks.json`,JSON.stringify(pixelChecks,null,2));
    assert.ok(a.equals(b),`${label}: ${JSON.stringify(pixelChecks.at(-1))}`);
};
const evolve=async()=>{await click('planet-play');await frames(120,50);await click('planet-play');};
try {
    await page.goto((process.env.BASE_URL||'http://localhost:8002')+'/embed.html?mode=editor&preview=circulation');await page.waitForFunction(()=>document.querySelector('#terrain-generation')?.dataset.pending==='false',{},{polling:50});await frames();
    const original=await globe('original');await click('planet-generate-climate');await click('environment-circulation');await input('planet-speed',864000);
    await click('environment-compare');await click('environment-capture');await click('environment-close');
    const initial=await save('initial');assert.ok(initial.runtime.state.circulation.ocean.circulationMps.every(v=>v===0));
    await evolve();const saved=await save('saved'),pixels=await globe('saved'),state=saved.runtime.state.circulation;
    assert.ok(state.atmosphere.eastMps.some(v=>Math.abs(v)>.01));assert.ok(state.ocean.circulationMps.some(v=>Math.abs(v)>.00001));
    assert.notDeepEqual(saved.runtime.state.water.windEastMps,initial.runtime.state.water.windEastMps);
    const diagnostics=await page.locator('#environment-wind-state').textContent(),budgets={water:Number(await page.locator('#water-budget').getAttribute('data-value')),energy:Number(await page.locator('#environment-energy').getAttribute('data-value'))};
    assert.ok(Math.abs(budgets.water)<1e-6);assert.ok(Math.abs(budgets.energy)<1e-4,JSON.stringify(budgets));
    checks.push('Actual wind perturbations and closed ocean-loop memory evolve for 49 days with finite conserved water and enthalpy');
    await evolve();const uninterrupted=await save('uninterrupted'),future=await globe('uninterrupted');
    await click('environment-circulation');assert.match(await load(saved),/Complete simulation restored/);assert.equal(await page.locator('#environment-circulation').isChecked(),true);
    assert.deepEqual((await save('restored')).runtime,saved.runtime);await exactPixels('49-day restore',pixels,await globe('restored'));
    await evolve();const resumed=await save('resumed');assert.deepEqual(resumed,uninterrupted);await exactPixels('98-day continuation',future,await globe('resumed'));
    checks.push('Downloaded and uploaded wind/ocean memory resumes to identical fields and globe pixels after 98 days');
    for(const mutate of [d=>d.runtime.state.circulation.ocean.circulationMps[0]=99,d=>d.runtime.state.circulation.atmosphere.eastMps.pop(),d=>delete d.runtime.state.circulation]) {
        const bad=structuredClone(saved);mutate(bad);assert.match(await load(bad),/Load failed/);assert.deepEqual((await save('after-invalid')).runtime,resumed.runtime);
    }
    await click('environment-compare');await input('environment-map','currents');await present();await page.screenshot({path:`${folder}/comparison.png`});await click('environment-close');
    await input('planet-layer','wind');await globe('wind');await input('planet-layer','original');await exactPixels('Original',original,await globe('original-restored'));
    checks.push('Invalid enabled circulation is rejected atomically; current comparison, wind map and Original remain available');
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await present();await page.screenshot({path:`${folder}/mobile.png`});
    await click('water-enabled');const dry=await save('thermal-only');assert.equal(dry.runtime.state.circulation,null);assert.match(await load(dry),/Complete simulation restored/);assert.deepEqual((await save('thermal-only-restored')).runtime,dry.runtime);
    checks.push('Mobile controls fit; disabling water removes active circulation while thermal-only save still restores');
    assert.deepEqual(errors,[]);const report={status:'PASS',sourceCommit,captureSynchronization:'two native presentation frames after controlled simulation callbacks; new wind evidence is captured separately with native rAF',checks,errors,budgets,diagnostics,steps:[saved.runtime.state.thermal.steps,resumed.runtime.state.thermal.steps],pixelChecks};await writeFile(`${folder}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(e){await writeFile(`${folder}/failure.json`,JSON.stringify({status:'FAIL',sourceCommit,error:e.stack,checks,errors,pixelChecks},null,2));throw e;
}finally{if(errors.length)console.log(JSON.stringify({errors}));await browser.close();}
