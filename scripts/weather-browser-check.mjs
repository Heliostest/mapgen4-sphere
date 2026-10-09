import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createGzip} from 'node:zlib';
import {createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {once} from 'node:events';
import {initBoundary} from './render-boundary-probe.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const folder=process.env.WEATHER_FOLDER||'build/validation/weather';await mkdir(folder,{recursive:true});
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),pixelChecks=[],boundaryCaptures={};
const sourceFiles=['weather.ts','planet-controls.ts','water-panel.ts','thermal-runtime.ts','render.ts','planet-render.ts','scripts/weather-browser-check.mjs','scripts/render-boundary-probe.mjs','scripts/weather-recheck.mjs','tests/weather-evidence.ts','tests/weather-evidence.html','tests/weather-render.ts','tests/weather-render.html','build/_bundle.js','build/_worker.js'];
await writeFile(`${folder}/source-manifest.json`,JSON.stringify({sourceCommit,patch:execFileSync('git',['diff','HEAD'],{encoding:'utf8'}),sha256:Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')]))),boundaryProbe:process.env.WEATHER_BOUNDARY_PROBE==='1'},null,2));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:1300}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
    const present=requestAnimationFrame.bind(window);window.presentBrowserFrame=()=>new Promise(resolve=>present(()=>present(resolve)));
    let now=0,id=0;const callbacks=new Map();Object.defineProperty(performance,'now',{value:()=>now});
    window.requestAnimationFrame=cb=>{callbacks.set(++id,cb);return id;};window.cancelAnimationFrame=id=>callbacks.delete(id);
    window.advanceFrames=(n,dt)=>{for(let i=0;i<n;i++){now+=dt;const batch=[...callbacks.values()];callbacks.clear();for(const cb of batch)cb(now);}};
});
if(process.env.WEATHER_BOUNDARY_PROBE==='1')await page.addInitScript(initBoundary);
const frames=(n=2,dt=16)=>page.evaluate(([n,dt])=>window.advanceFrames(n,dt),[n,dt]);
const click=async id=>{await page.locator('#'+id).evaluate(e=>e.click());await frames();};
const input=async(id,value)=>{await page.locator('#'+id).evaluate((e,v)=>{e.value=String(v);e.dispatchEvent(new Event(e.type==='range'?'input':'change',{bubbles:true}));},value);await frames();};
const save=async name=>{const pending=page.waitForEvent('download');pending.catch(()=>{});await click('simulation-save');assert.doesNotMatch(await page.locator('#terrain-file-status').textContent(),/Save failed/);await (await pending).saveAs(`${folder}/${name}.json`);return JSON.parse(await readFile(`${folder}/${name}.json`,'utf8'));};
const load=async d=>{await page.locator('#terrain-load').setInputFiles({name:'world.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(d))});await page.waitForFunction(()=>!/Reading|Preparing/.test(document.querySelector('#terrain-file-status').textContent),{},{polling:50});await frames();return page.locator('#terrain-file-status').textContent();};
const globe=async name=>{await frames();await page.evaluate(()=>window.presentBrowserFrame());const png=await page.locator('#mapgen4').screenshot({path:`${folder}/${name}.png`});if(process.env.WEATHER_BOUNDARY_PROBE==='1'){boundaryCaptures[name]=await page.evaluate(name=>window.boundaryCapture(name),name);await writeFile(`${folder}/boundary-captures.json`,JSON.stringify(boundaryCaptures,null,2));}return png;};
async function exportBoundaries(label,names){
    const target=`${folder}/boundary-${label}-raw`;await mkdir(target,{recursive:true});const index=await page.evaluate(names=>window.boundaryExportIndex(names),names);index.fields=[];
    await writeFile(`${target}/index.json`,JSON.stringify(index,null,2));
    for(let id=0;id<index.fieldCount;id++){
        const file=`field-${id}.bin.gz`,out=createWriteStream(`${target}/${file}`),gzip=createGzip(),completion=pipeline(gzip,out);completion.catch(()=>{});
        const hash=createHash('sha256');let offset=0,chunk;
        try{do{chunk=await page.evaluate(([id,offset])=>window.boundaryExportChunk(id,offset),[id,offset]);if(gzip.errored||out.errored)throw gzip.errored||out.errored;if(gzip.destroyed||out.destroyed)throw new Error('Boundary export stream closed before completion');const bytes=Buffer.from(chunk.base64,'base64');hash.update(bytes);offset+=bytes.length;if(!gzip.write(bytes))await Promise.race([once(gzip,'drain'),completion]);}while(offset<chunk.byteLength);gzip.end();await completion;}
        catch(error){gzip.destroy(error);out.destroy(error);throw error;}
        index.fields.push({id,file,byteLength:offset,type:chunk.type,sha256:hash.digest('hex')});await writeFile(`${target}/index.json`,JSON.stringify(index,null,2));await page.evaluate(id=>window.boundaryExportRelease(id),id);
    }
}
const exactPixels=async(label,a,b,names)=>{
    const decoded=await page.evaluate(async images=>{
        const fields=[];let width,height;for(const data of images){const img=await createImageBitmap(new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],{type:'image/png'})),c=document.createElement('canvas');c.width=width=img.width;c.height=height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);fields.push(ctx.getImageData(0,0,width,height).data);img.close();}
        let channels=0,pixels=0,max=0;for(let i=0;i<fields[0].length;i+=4){let changed=false;for(let c=0;c<4;c++){const d=Math.abs(fields[0][i+c]-fields[1][i+c]);if(d){channels++;changed=true;max=Math.max(max,d);}}if(changed)pixels++;}return {width,height,pixels,channels,max};
    },[a.toString('base64'),b.toString('base64')]);
    pixelChecks.push({label,names,pngEqual:a.equals(b),decoded,sha256:[a,b].map(v=>createHash('sha256').update(v).digest('hex'))});await writeFile(`${folder}/pixel-checks.json`,JSON.stringify(pixelChecks,null,2));
    if(names&&process.env.WEATHER_BOUNDARY_PROBE==='1'){
        const boundary=await page.evaluate(names=>window.boundaryPair(names),names);await writeFile(`${folder}/boundary-${label}.json`,JSON.stringify(boundary,null,2));
        for(const key of ['u_elevation','u_depth'])assert.ok(boundary.outputs[key].stats.every(s=>s.nonzero>0&&s.min!==s.max),`${key}: seed-187 terrain boundary must have valid, nonconstant samples`);
        if(!a.equals(b))await exportBoundaries(label,names);
    }
    assert.ok(a.equals(b),`${label}: ${JSON.stringify(pixelChecks.at(-1))}`);
};
const evolve=async()=>{await click('planet-play');await frames(120,50);await click('planet-play');};
try {
    await page.goto((process.env.BASE_URL||'http://localhost:8002')+'/embed.html?mode=editor&preview=weather');await page.waitForFunction(()=>document.querySelector('#terrain-generation')?.dataset.pending==='false',{},{polling:50});await frames();
    const original=await globe('original');await click('planet-generate-climate');await click('environment-circulation');await input('planet-speed',864000);
    const initial=await save('initial'),clear=await globe('clear');await click('environment-weather');const cloudy=await globe('generated');
    assert.ok(!clear.equals(cloudy));assert.match(await page.locator('#environment-weather-state').textContent(),/Cloud cover \d+%/);assert.deepEqual((await save('generated')).runtime,initial.runtime);
    assert.match(await page.locator('#planet-legend').textContent(),/column water.*proxy/);assert.match(await page.locator('#water-snowfall').textContent(),/unavailable/i);
    await frames(100,50);await exactPixels('pause',cloudy,await globe('paused'));await click('environment-weather');await exactPixels('off',clear,await globe('off'));await click('environment-weather');
    checks.push('Moisture clouds are visible at generation; pause is exact and toggling off restores pixels without changing any physical state');
    await evolve();const saved=await save('saved'),pixels=await globe('evolved');assert.ok(saved.view.weather);assert.ok(saved.runtime.state.water.snowfallKgM2S);assert.ok(saved.runtime.state.water.precipitationKgM2S.some(v=>v>0));assert.ok(!cloudy.equals(pixels));
    const snowfall=saved.runtime.state.water.snowfallKgM2S.reduce((sum,v)=>sum+v,0)*86400/saved.runtime.state.water.snowfallKgM2S.length;assert.equal(Number(await page.locator('#water-snowfall').getAttribute('data-value')),snowfall);
    const diagnostics=await page.locator('#environment-weather-state').textContent(),budgets={water:Number(await page.locator('#water-budget').getAttribute('data-value')),energy:Number(await page.locator('#environment-energy').getAttribute('data-value'))};assert.ok(Math.abs(budgets.water)<1e-6);assert.ok(Math.abs(budgets.energy)<1e-4);
    await evolve();const uninterrupted=await save('uninterrupted'),future=await globe('uninterrupted');await click('environment-weather');assert.match(await load(saved),/Complete simulation restored/);assert.equal(await page.locator('#environment-weather').isChecked(),true);assert.deepEqual(await save('restored'),saved);await exactPixels('49-day-restore',pixels,await globe('restored'),['evolved','restored']);
    await evolve();const resumed=await save('resumed');assert.deepEqual(resumed,uninterrupted);await exactPixels('98-day-continuation',future,await globe('resumed'),['uninterrupted','resumed']);
    checks.push('Actual precipitation, wind and moisture evolve; full save/load reconstructs exact weather pixels and 98-day resumed fields with conserved budgets');
    for(const mutate of [d=>d.view.weather='yes',d=>d.runtime.state.water.snowfallKgM2S[0]=99]){const bad=structuredClone(saved);mutate(bad);assert.match(await load(bad),/Load failed/);assert.deepEqual(await save('after-invalid'),resumed);}
    // Capture diagnostic layers with native rAF: fake-rAF can present the
    // previous Surface frame on the first Wind draw (stage-four investigation).
    const native=await browser.newPage({viewport:{width:1440,height:1300}});native.on('pageerror',e=>errors.push(e.message));
    await native.goto((process.env.BASE_URL||'http://localhost:8002')+'/embed.html?mode=editor');await native.waitForFunction(()=>document.querySelector('#terrain-generation')?.dataset.pending==='false');
    await native.locator('#terrain-load').setInputFiles({name:'world.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(resumed))});await native.waitForFunction(()=>!/Reading|Preparing/.test(document.querySelector('#terrain-file-status').textContent));assert.match(await native.locator('#terrain-file-status').textContent(),/Complete simulation restored/);
    const nativeFrames=()=>native.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    for(const layer of ['temperature','wind','precipitation']){await native.locator('#planet-layer').selectOption(layer);await nativeFrames();const on=await native.locator('#mapgen4').screenshot({path:`${folder}/${layer}-cloud-on.png`});await native.locator('#environment-weather').evaluate(e=>e.click());await nativeFrames();await exactPixels(`${layer}-unpolluted`,on,await native.locator('#mapgen4').screenshot({path:`${folder}/${layer}-cloud-off.png`}));await native.locator('#environment-weather').evaluate(e=>e.click());}
    const nativeDownload=native.waitForEvent('download');await native.locator('#simulation-save').evaluate(e=>e.click());await (await nativeDownload).saveAs(`${folder}/diagnostic-native.json`);const nativeSaved=JSON.parse(await readFile(`${folder}/diagnostic-native.json`,'utf8'));assert.deepEqual(nativeSaved.runtime,resumed.runtime);assert.deepEqual(nativeSaved.terrain,resumed.terrain);await native.close();
    await input('planet-layer','original');await exactPixels('Original',original,await globe('original-restored'));await input('planet-layer','surface');
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${folder}/mobile.png`});
    const legacy=structuredClone(saved);delete legacy.view.weather;delete legacy.runtime.state.water.snowfallKgM2S;assert.match(await load(legacy),/Complete simulation restored/);assert.equal(await page.locator('#environment-weather').isChecked(),false);assert.match(await page.locator('#water-snowfall').textContent(),/unavailable/i);await click('environment-weather');assert.match(await page.locator('#environment-weather-state').textContent(),/Cloud cover \d+%/);
    checks.push('Invalid display options preserve the world; Original remains exact, mobile fits and old saves can display clouds without precipitation phase');
    await page.setViewportSize({width:1440,height:1300});await click('environment-glaciers');await click('environment-terrain-water');await click('planet-play');await frames(24,50);await click('planet-play');
    const coupled=await save('all-systems'),coupledPixels=await globe('all-systems');assert.ok(coupled.runtime.state.water.routing&&coupled.runtime.state.water.glacier&&coupled.runtime.state.circulation&&coupled.view.weather);
    const coupledBudgets={water:Number(await page.locator('#water-budget').getAttribute('data-value')),energy:Number(await page.locator('#environment-energy').getAttribute('data-value')),solid:Number(await page.locator('#environment-glacier').getAttribute('data-solid-residual'))};
    assert.ok(Math.abs(coupledBudgets.water)<1e-6,JSON.stringify(coupledBudgets));assert.ok(Math.abs(coupledBudgets.energy)<1e-4,JSON.stringify(coupledBudgets));assert.ok(Math.abs(coupledBudgets.solid)<1e-10);
    await click('planet-play');await frames(24,50);await click('planet-play');const coupledFuture=await save('all-systems-future'),coupledFuturePixels=await globe('all-systems-future');
    const coupledFutureBudgets={water:Number(await page.locator('#water-budget').getAttribute('data-value')),energy:Number(await page.locator('#environment-energy').getAttribute('data-value')),solid:Number(await page.locator('#environment-glacier').getAttribute('data-solid-residual'))};
    assert.ok(Math.abs(coupledFutureBudgets.water)<1e-6);assert.ok(Math.abs(coupledFutureBudgets.energy)<1e-4);assert.ok(Math.abs(coupledFutureBudgets.solid)<1e-10);
    await click('environment-circulation');assert.match(await load(coupled),/Complete simulation restored/);assert.deepEqual(await save('all-systems-restored'),coupled);await exactPixels('all-systems-restore',coupledPixels,await globe('all-systems-restored'),['all-systems','all-systems-restored']);
    await click('planet-play');await frames(24,50);await click('planet-play');assert.deepEqual(await save('all-systems-resumed'),coupledFuture);await exactPixels('all-systems-continuation',coupledFuturePixels,await globe('all-systems-resumed'),['all-systems-future','all-systems-resumed']);
    checks.push('Terrain routing, glaciers, evolving circulation and weather run together with closed budgets and an exact full-world/pixel restore');
    const fixture=await browser.newPage({viewport:{width:1440,height:1160}});fixture.on('pageerror',e=>errors.push(e.message));await fixture.goto((process.env.BASE_URL||'http://localhost:8002')+'/tests/weather-render.html');await fixture.waitForFunction(()=>/PASS|FAIL/.test(document.querySelector('pre').textContent),{},{timeout:60000});const gpu=JSON.parse(await fixture.locator('pre').textContent());await fixture.screenshot({path:`${folder}/controlled-gpu.png`,fullPage:true});assert.equal(gpu.status,'PASS',JSON.stringify(gpu));await fixture.close();
    checks.push('Production GPU fixture verifies dry restoration and moisture-derived clouds without rain, snow or time-driven glyphs');
    assert.deepEqual(errors,[]);const report={status:'PASS',sourceCommit,checks,errors,budgets,coupledBudgets,coupledFutureBudgets,diagnostics,snowfall,steps:[saved.runtime.state.thermal.steps,resumed.runtime.state.thermal.steps],pixelChecks,gpu};await writeFile(`${folder}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await writeFile(`${folder}/failure.json`,JSON.stringify({status:'FAIL',sourceCommit,error:error.stack,checks,errors,pixelChecks},null,2));throw error;
}finally{if(errors.length)console.log(JSON.stringify({errors}));await browser.close();}
