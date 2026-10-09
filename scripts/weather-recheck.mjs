import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const folder=process.env.WEATHER_FOLDER||'build/validation/weather',base=process.env.BASE_URL||'http://localhost:8002';
await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']}),errors=[],captures=[];
const page=await browser.newPage({viewport:{width:1440,height:1300}});page.on('pageerror',e=>errors.push(e.message));
const nativeFrames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const read=name=>readFile(`${folder}/${name}.json`,'utf8').then(JSON.parse);
async function load(document){await page.locator('#terrain-load').setInputFiles({name:'world.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(document))});await page.waitForFunction(()=>!/Reading|Preparing/.test(window.document.querySelector('#terrain-file-status').textContent));assert.match(await page.locator('#terrain-file-status').textContent(),/Complete simulation restored/);assert.equal(await page.locator('#planet-play').textContent(),'Play');await nativeFrames();}
async function capture(document,name,{layer='surface',weather=true,pose=null}={}){
    await load(document);await page.locator('#planet-layer').selectOption(layer);
    if((await page.locator('#environment-weather').isChecked())!==weather)await page.locator('#environment-weather').evaluate(e=>e.click());
    if(pose){await page.locator('#planet-camera').selectOption('surface');for(const [key,value] of Object.entries(pose))await page.locator(`#slider-${key} input`).evaluate((e,v)=>{e.value=String(v);e.dispatchEvent(new Event('input',{bubbles:true}));},value);}
    await nativeFrames();const png=await page.locator('#mapgen4').screenshot({path:`${folder}/${name}.png`});
    const pending=page.waitForEvent('download');await page.locator('#simulation-save').evaluate(e=>e.click());await (await pending).saveAs(`${folder}/${name}-native.json`);
    const captured=await read(`${name}-native`);assert.deepEqual(captured.runtime,document.runtime);
    if(!pose)assert.deepEqual(captured.terrain,document.terrain);
    else{const expected=structuredClone(document.terrain);expected.settings.camera='surface';Object.assign(expected.parameters.render,pose);assert.deepEqual(captured.terrain,expected);}
    assert.equal(captured.view.layer,layer);assert.equal(captured.view.weather,weather);
    const state=document.runtime.state,ageS=state.thermal.steps*state.stepS;
    captures.push({name,ageDays:ageS/86400,timeS:state.epochS+ageS,layer,weather,pose,runtimeUnchanged:true,terrainAndCameraVerified:true,sha256:createHash('sha256').update(png).digest('hex')});return png;
}
try{
    await page.goto(base+'/embed.html?mode=editor');await page.waitForFunction(()=>document.querySelector('#terrain-generation')?.dataset.pending==='false');
    const initial=await read('initial'),saved=await read('saved'),coupled=await read('all-systems');
    for(const [document,prefix] of [[initial,'zero'],[saved,'day49']])for(const weather of [false,true])await capture(document,`${prefix}-${weather?'cloud':'clear'}`,{weather});
    const before=await capture(coupled,'coupled-before'),after=await capture(coupled,'coupled-reloaded');
    const restoreEqual=before.equals(after),runPixels=await readFile(`${folder}/all-systems.png`),runToNativeEqual=runPixels.equals(before);await writeFile(`${folder}/native-restore.json`,JSON.stringify({pngEqual:restoreEqual,runToNativeEqual,captures:captures.slice(-2)},null,2));
    // A failed native pair is retained and reported, never silently retried.
    assert.ok(restoreEqual,'Native all-systems restore PNG differs; original pair retained');
    assert.ok(runToNativeEqual,'Run-to-native restore PNG differs; original pair retained');
    for(const [name,pose] of [['north-a',{x:0,y:0,tilt_deg:0}],['north-b',{x:250,y:0,tilt_deg:0}],['south-a',{x:0,y:1000,tilt_deg:0}],['south-b',{x:250,y:1000,tilt_deg:0}],['seam-a',{x:0,y:500,tilt_deg:0}],['seam-b',{x:998,y:500,tilt_deg:0}]])await capture(saved,name,{pose});
    await capture(saved,'precipitation',{layer:'precipitation'});assert.match(await page.locator('#planet-legend').textContent(),/Latest simulated-step rate/);
    await page.locator('#planet-inspect').evaluate(e=>e.click());const bounds=await page.locator('#mapgen4').boundingBox();await page.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await nativeFrames();
    assert.match(await page.locator('#planet-probe').textContent(),/total precipitation.*latest simulated-step rate/);assert.match(await page.locator('#planet-probe').textContent(),/current column at day.*precipitation latest step/);
    await page.screenshot({path:`${folder}/precipitation-readout.png`,fullPage:true});
    await capture(saved,'mobile-cloud');await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await nativeFrames();await page.screenshot({path:`${folder}/mobile-native.png`});await page.setViewportSize({width:1440,height:1300});
    await page.goto(base+'/embed.html');await page.waitForFunction(()=>document.querySelector('#terrain-generation')?.dataset.pending==='false');await page.waitForFunction(()=>document.querySelector('#planet-play').textContent==='Pause');
    const frameIntervals=await page.evaluate(()=>new Promise(resolve=>{const samples=[];let previous;function tick(now){if(previous!==undefined)samples.push(now-previous);previous=now;if(samples.length<120)requestAnimationFrame(tick);else resolve(samples);}requestAnimationFrame(tick);}));frameIntervals.sort((a,b)=>a-b);
    const liveFrameTiming={samples:frameIntervals.length,medianMs:frameIntervals[60],p95Ms:frameIntervals[114],note:'Native browser frame intervals while default all-systems Live planet plays; not GPU-only timings'};
    await page.locator('#planet-play').click();await nativeFrames();
    const pending=page.waitForEvent('download');await page.locator('#simulation-save').evaluate(e=>e.click());await (await pending).saveAs(`${folder}/live-default-native.json`);const live=await read('live-default-native');assert.ok(live.runtime.enabled&&live.runtime.waterEnabled&&live.view.weather&&live.view.layer==='surface');assert.ok(['terrainWater','glaciers','dynamicCirculation','vegetation','iceAlbedo'].every(k=>live.runtime.environmentConfig[k]));await page.screenshot({path:`${folder}/live-default.png`});
    await page.goto(base+'/tests/live-planet.html');await page.waitForFunction(()=>/PASS|FAIL/.test(document.querySelector('pre').textContent));const liveFixture=JSON.parse(await page.locator('pre').textContent());assert.equal(liveFixture.status,'PASS');
    await page.goto(base+'/tests/weather-evidence.html?folder='+encodeURIComponent(folder));await page.waitForFunction(()=>/"status"|FAIL/.test(document.querySelector('pre').textContent));const evidence=JSON.parse(await page.locator('pre').textContent());assert.equal(evidence.status,'PASS');
    await page.setViewportSize({width:1248,height:1100});for(const id of ['cloud-evolution','cloud-fields','coupled-restore','poles-seam','precipitation-evidence','controlled-moisture'])await page.locator('#'+id).screenshot({path:`${folder}/${id}.png`});
    assert.deepEqual(errors,[]);const report={status:'PASS',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scriptSha256:createHash('sha256').update(await readFile('scripts/weather-recheck.mjs')).digest('hex'),nativeRAF:true,captures,liveFixture,liveFrameTiming,evidence,errors};await writeFile(`${folder}/recheck-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await writeFile(`${folder}/native-failure.json`,JSON.stringify({status:'FAIL',error:error.stack,captures,errors},null,2));throw error;
}finally{await browser.close();}
