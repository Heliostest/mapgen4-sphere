import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.BASE_URL || 'http://localhost:8002';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1300,height:1000}});
const errors=[],checks=[]; const folder='build/validation/planet';
await mkdir(folder,{recursive:true});
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error' && !m.text().includes('404')) errors.push(m.text());});
await page.addInitScript(()=>{
    window.generations=0;const W=window.Worker;
    window.Worker=class extends W { constructor(...args) {super(...args);this.addEventListener('message',()=>window.generations++);} };
});
const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const input=async(id,value)=>{
    const selector=id.startsWith('slider-')?`#${id} input`:`#${id}`;
    await page.locator(selector).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event(el.type==='range'?'input':'change',{bubbles:true}));},value);
    await frames();
};
const numeric=async id=>parseFloat(await page.locator('#'+id).textContent());
const capture=async name=>{await frames();return page.locator('#mapgen4').screenshot({path:`${folder}/${name}.png`});};
async function comparePixels(a,b) {
    if(a.equals(b)) return {channels:0,max:0};
    return page.evaluate(async images=>{
        const pixels=[];
        for(const base64 of images) {
            const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))]));
            const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
            const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);
            pixels.push(ctx.getImageData(0,0,canvas.width,canvas.height).data);
        }
        let channels=0,max=0;
        for(let i=0;i<pixels[0].length;i++) {
            const delta=Math.abs(pixels[0][i]-pixels[1][i]);
            if(delta) channels++;max=Math.max(max,delta);
        }
        return {channels,max};
    },[a.toString('base64'),b.toString('base64')]);
}
try {
    await page.goto(base+'/embed.html');await page.waitForFunction(()=>window.generations>0);
    assert.equal(await page.locator('#planet-controls').count(),1,'Planet physics panel is missing');
    const baseline=await capture('original');
    // Optional pre-change baseline captured from this checkout before implementation.
    const old=await readFile('.superpowers/sdd/2026-10-08-planet-physics/baseline.png').catch(()=>null);
    if(old) assert.ok(old.equals(baseline),'Original canvas changed from pre-physics baseline');
    assert.equal(await page.locator('#planet-layer').inputValue(),'original');
    assert.equal(await page.locator('#planet-play').textContent(),'Play');
    assert.ok(Math.abs(await numeric('planet-gravity')-9.82)<.02);
    assert.ok(Math.abs(await numeric('planet-temperature')-254.6)<.2);
    assert.equal(await page.locator('[id^="slider-"] input').count(),33);
    checks.push('Original pixels, 33 existing controls (including sphere radius) and Earth diagnostics');

    const generations=await page.evaluate(()=>window.generations);
    await input('planet-radius',12742.0168);
    assert.ok(Math.abs(await numeric('planet-gravity')-19.64)<.03);
    assert.ok(Math.abs(await numeric('planet-mass')/5.972e24-8)<.01);
    assert.ok(Math.abs(await numeric('planet-temperature')-254.6)<.2);
    assert.ok(baseline.equals(await capture('physical-radius')));
    await input('slider-sphere_radius',1000);
    assert.ok(Math.abs(await numeric('planet-gravity')-19.64)<.03);
    await input('slider-sphere_radius',300);await input('planet-radius',6371.0084);
    await input('planet-relief',20);await input('planet-relief',10);
    assert.equal(await page.evaluate(()=>window.generations),generations);
    assert.ok(baseline.equals(await capture('restored-original')));
    checks.push('Physical radius changes SI gravity/mass, scene radius stays independent, neither regenerates terrain');

    await input('planet-density',0);
    assert.equal(await page.locator('#planet-density').getAttribute('aria-invalid'),'true');
    assert.ok(Math.abs(await numeric('planet-gravity')-9.82)<.02);
    await input('planet-density',5513.4);
    await page.locator('#planet-layer').selectOption('day-night');
    await input('planet-spin-phase',90);
    assert.ok(!baseline.equals(await capture('day-night')));
    await page.locator('#planet-layer').selectOption('insolation');await capture('insolation');
    assert.match(await page.locator('#planet-legend').textContent(),/W\/m²/);
    await page.locator('#planet-layer').selectOption('original');await input('planet-spin-phase',0);
    assert.ok(baseline.equals(await capture('layers-off')));
    checks.push('Invalid input rejected; day/night and insolation are optional and reversible');

    await page.locator('#planet-layer').selectOption('day-night');
    await page.locator('#planet-play').click();
    await page.waitForFunction(()=>Number(document.querySelector('#planet-time-days').value)>.001);
    await page.evaluate(()=>{
        Object.defineProperty(document,'hidden',{configurable:true,value:true});
        document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;
    });
    assert.equal(await page.locator('#planet-play').textContent(),'Play');
    const paused=await page.locator('#planet-time-days').inputValue();await page.waitForTimeout(250);
    assert.equal(await page.locator('#planet-time-days').inputValue(),paused);
    assert.equal(await page.evaluate(()=>window.generations),generations);
    checks.push('Playing advances SI time without generation; visibility loss pauses without catch-up');

    await page.locator('#planet-inspect').click();
    const canvas=await page.locator('#mapgen4').boundingBox();
    await page.mouse.click(canvas.x+canvas.width/2,canvas.y+canvas.height/2);
    assert.match(await page.locator('#planet-probe').textContent(),/W\/m²/);
    assert.ok(await page.locator('#button-reset').isDisabled());
    assert.equal(await page.evaluate(()=>window.generations),generations);
    await page.locator('#planet-inspect').click();
    await page.locator('#planet-camera').selectOption('space');
    await input('planet-spin-phase',55);await input('planet-tilt',35);
    await page.locator('#planet-play').click();await page.waitForTimeout(100);
    await page.mouse.click(canvas.x+canvas.width/2,canvas.y+canvas.height/2);
    await page.waitForFunction(()=>!document.querySelector('#button-reset').disabled);
    assert.equal(await page.locator('#planet-play').textContent(),'Play');
    await page.waitForFunction(n=>window.generations>n,generations);
    const painted=await capture('space-painted');
    const paintedGenerations=await page.evaluate(()=>window.generations);
    await input('planet-radius',10000);await input('planet-density',4000);
    await input('planet-relief',20);
    await input('slider-sphere_radius',1000);
    assert.ok(!painted.equals(await capture('painted-large-radius')));
    await input('slider-sphere_radius',300);
    await input('planet-relief',10);
    assert.ok(await page.locator('#button-reset').isEnabled());
    assert.ok(await page.locator('#slider-seed input').isDisabled());
    const paintedRadiusRoundTrip=await comparePixels(painted,await capture('paint-preserved'));
    // Same tolerance as the legacy runner: screenshot color conversion can
    // move a few channels by one level; geometry must not regenerate at all.
    assert.ok(paintedRadiusRoundTrip.max<=1 && paintedRadiusRoundTrip.channels<=8,JSON.stringify(paintedRadiusRoundTrip));
    assert.equal(await page.evaluate(()=>window.generations),paintedGenerations);
    checks.push('Inspection does not paint; painting pauses spin and survives physical radius, density, scene radius and relief changes');

    await page.locator('#button-reset').click();await page.waitForFunction(()=>document.querySelector('#button-reset').disabled);
    await page.waitForTimeout(150);
    await page.locator('#planet-earth').click();await frames();
    await page.locator('#planet-layer').selectOption('original');await page.locator('#planet-camera').selectOption('surface');
    assert.ok(baseline.equals(await capture('full-restoration')));
    checks.push('Terrain reset plus Earth/time reset restore the original canvas');

    await page.goto(base+'/tests/planet-controls.html');
    await page.waitForFunction(()=>/PASS|FAIL/.test(document.querySelector('pre').textContent));
    const controls=JSON.parse(await page.locator('pre').innerText());
    assert.equal(controls.status,'PASS',JSON.stringify(controls));
    checks.push('Pause button freezes the presented frame; resume advances from that time');

    const gpu={};
    for(const name of ['radial','outlines','silhouette','insolation']) {
        await page.goto(`${base}/tests/gpu-${name}.html`);
        await page.waitForFunction(()=>/PASS|FAIL/.test(document.querySelector('pre').textContent));
        const result=await page.locator('pre').innerText();assert.ok(!result.includes('FAIL'),result);
        gpu[name]=JSON.parse(result);
    }
    const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    mobile.on('pageerror',e=>errors.push(e.message));
    await mobile.addInitScript(()=>{
        window.terrainReady=false;const W=window.Worker;
        window.Worker=class extends W {constructor(...args){super(...args);this.addEventListener('message',()=>window.terrainReady=true);}};
    });
    await mobile.goto(base+'/embed.html');await mobile.waitForFunction(()=>window.terrainReady);
    await mobile.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    await mobile.locator('#planet-layer').selectOption('day-night');
    await mobile.locator('#planet-inspect').tap();
    const bounds=await mobile.locator('#mapgen4').boundingBox();
    assert.ok(bounds.y>=-1 && bounds.y+bounds.height<=844,'Physics controls scrolled the globe out of the mobile viewport');
    await mobile.touchscreen.tap(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
    await mobile.waitForFunction(()=>document.querySelector('#planet-probe').textContent.includes('W/m²'));
    assert.ok(await mobile.locator('#button-reset').isDisabled());
    await mobile.screenshot({path:`${folder}/mobile.png`});
    assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await mobile.close();checks.push('Touch inspection and portrait controls fit viewport');
    assert.deepEqual(errors,[]);
    const report={checks,errors,paintedRadiusRoundTrip,controls,gpu};await writeFile(`${folder}/report.json`,JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}
