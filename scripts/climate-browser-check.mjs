import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const folder='build/validation/climate';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1300,height:1000}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const input=async(id,value)=>{await page.locator(id.startsWith('slider-')?`#${id} input`:`#${id}`).evaluate((e,v)=>{e.value=String(v);e.dispatchEvent(new Event(e.type==='range'?'input':'change',{bubbles:true}));},value);await frames();};
const capture=async name=>{await frames();return page.locator('#mapgen4').screenshot({path:`${folder}/${name}.png`});};
const compare=async(a,b)=>page.evaluate(async images=>{
    const pixels=[];for(const b of images){const image=await createImageBitmap(new Blob([Uint8Array.from(atob(b),c=>c.charCodeAt(0))]));const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);pixels.push(ctx.getImageData(0,0,c.width,c.height).data);}
    let max=0,channels=0;for(let i=0;i<pixels[0].length;i++){const d=Math.abs(pixels[0][i]-pixels[1][i]);if(d)channels++;max=Math.max(max,d);}return {max,channels};
},[a.toString('base64'),b.toString('base64')]);
const zero=async()=>{
    assert.equal(await page.locator('#planet-play').textContent(),'Play');assert.equal(Number(await page.locator('#planet-time-days').inputValue()),0);
    assert.equal(Number(await page.locator('#thermal-age').getAttribute('data-days')),0);assert.equal(Number(await page.locator('#water-age').getAttribute('data-days')),0);
};
try {
    await page.goto((process.env.BASE_URL||'http://localhost:8002')+'/embed.html');await page.waitForFunction(()=>document.querySelector('#terrain-generation')?.dataset.pending==='false');
    const original=await capture('original');await page.locator('#planet-generate-climate').click();await frames();await zero();
    const range=await page.locator('#thermal-range').evaluate(e=>Number(e.dataset.max)-Number(e.dataset.min));assert.ok(range>15);
    assert.ok(Number(await page.locator('#water-rain').getAttribute('data-value'))>0);
    assert.match(await page.locator('#thermal-status').textContent(),/Generated reference/);assert.match(await page.locator('#water-status').textContent(),/initial flux estimates/);
    const initial=await capture('initial-temperature');assert.ok(!original.equals(initial));
    checks.push('Generate climate produces structured temperature and nonzero rain at day0/age0 while paused, without warmup');
    await input('planet-orbit-phase',90);const summer=await capture('summer');await input('planet-orbit-phase',270);const winter=await capture('winter');
    assert.ok(!summer.equals(winter));await zero();
    await input('planet-tilt',0);const noTilt=await capture('no-tilt');await input('planet-orbit-phase',90);assert.ok(noTilt.equals(await capture('no-tilt-season')));
    await input('planet-tilt',23.43928);await input('planet-relief',.001);const low=await capture('low-relief');await input('planet-relief',10);assert.ok(!low.equals(await capture('high-relief')));await zero();
    checks.push('Manual season, tilt and physical height regenerate climate immediately without advancing time; zero tilt removes seasonal contrast');
    await page.locator('#planet-layer').selectOption('wind');const wind=await capture('wind');assert.match(await page.locator('#planet-legend').textContent(),/arrows.*m\/s/);
    await page.locator('#planet-inspect').click();const box=await page.locator('#mapgen4').boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
    const before=await page.locator('#planet-probe').textContent();assert.match(before,/estimated wind E.*N.*m\/s/);
    await page.locator('#planet-retrograde').evaluate(e=>e.closest('details').open=true);
    await page.locator('#planet-retrograde').check();const reverse=await capture('retrograde-wind');assert.ok(!wind.equals(reverse));
    const after=await page.locator('#planet-probe').textContent();const e=s=>Number(s.match(/estimated wind E ([\d.-]+)/)[1]);assert.equal(e(before),-e(after));
    await page.locator('#planet-inspect').click();await page.locator('#planet-retrograde').uncheck();
    await page.locator('#planet-layer').selectOption('precipitation');const rain=await capture('initial-rain');
    await page.locator('#planet-layer').selectOption('soil-moisture');assert.ok(!rain.equals(await capture('initial-soil')));await zero();
    await page.locator('#geomorph-panel').evaluate(e=>e.open=true);await page.locator('#geomorph-capture').click();assert.match(await page.locator('#geomorph-source').textContent(),/generated initial discharge estimate/);
    checks.push('Estimated vector wind arrows/probes respond to retrograde; rain/soil and erosion capture are available before Play with honest initial-estimate labels');
    await page.locator('#planet-layer').selectOption('temperature');await page.locator('#planet-speed').selectOption('864000');await page.locator('#planet-play').click();
    await page.waitForFunction(()=>Number(document.querySelector('#thermal-age').dataset.days)>3);await page.locator('#planet-play').click();await frames();
    const age=await page.locator('#thermal-age').getAttribute('data-days');assert.match(await page.locator('#water-status').textContent(),/latest simulated step/);
    assert.ok(Math.abs(Number(await page.locator('#water-budget').getAttribute('data-value')))<1e-6);
    const evolved=await capture('evolved');await input('slider-sphere_radius',600);await input('slider-sphere_radius',300);
    assert.equal(await page.locator('#thermal-age').getAttribute('data-days'),age);
    const displayDiff=await compare(evolved,await capture('view-roundtrip'));assert.ok(displayDiff.max<=1&&displayDiff.channels<=32,JSON.stringify(displayDiff));
    await page.locator('#planet-generate-climate').click();assert.equal(Number(await page.locator('#thermal-age').getAttribute('data-days')),0);assert.ok(Number(await page.locator('#planet-time-days').inputValue())>0);
    checks.push('Play evolves generated fields with a closed water budget; view changes preserve history, regeneration resets age at the selected date');
    await page.locator('#planet-layer').selectOption('original');assert.ok(original.equals(await capture('original-restored')));
    await page.setViewportSize({width:390,height:844});await page.locator('#planet-generate-climate').click();await page.locator('#planet-layer').selectOption('wind');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${folder}/mobile.png`});
    checks.push('Original artwork is preserved and generated climate/wind controls fit mobile');
    assert.deepEqual(errors,[]);const report={checks,errors,initialRangeK:range,displayDiff};await writeFile(`${folder}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
