// Optional browser regression runner. Uses installed Chrome and Playwright.
// PLAYWRIGHT_MODULE may point to a shared Playwright index.mjs (file URL).
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.BASE_URL || 'http://localhost:8000';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const errors=[], results=[];
const snapshots=new Map();
await mkdir('build/validation',{recursive:true});
const page=await browser.newPage({viewport:{width:1300,height:1000}});
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error' && !message.text().includes('404')) errors.push(message.text());});
await page.addInitScript(()=>{
    window.generationCount=0; window.generationTimes=[];
    const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker {
        constructor(...args) {
            super(...args);
            this.addEventListener('message',event=>{
                window.generationCount++;
                window.generationTimes.push(event.data.elapsed);
            });
        }
    };
});
const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const snapshot=async(name)=>{
    await frames();
    const buffer=await page.locator('#mapgen4').screenshot({path:`build/validation/${name}.png`});
    const hash=createHash('sha256').update(buffer).digest('hex');
    snapshots.set(hash,buffer);
    return hash;
};
async function equivalent(actual,expected) {
    if(actual===expected) return;
    const diff=await page.evaluate(async images=>{
        const pixels=[];
        for(const base64 of images) {
            const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
            const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
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
    },[snapshots.get(actual).toString('base64'),snapshots.get(expected).toString('base64')]);
    // GPU/color conversion can differ by one 8-bit level at a few pixels.
    // The core suite separately requires bit-exact geometry/elevation data.
    assert.ok(diff.max<=1 && diff.channels<=8,`pixel mismatch: ${JSON.stringify(diff)}`);
}
const generation=()=>page.evaluate(()=>window.generationCount);
async function waitGeneration(previous) {
    await page.waitForFunction(previous=>window.generationCount>previous,previous);
    await frames();
}
async function parameters(values, regenerate=false) {
    const previous=await generation();
    await page.evaluate(values=>{
        for (const [key,value] of Object.entries(values)) {
            const input=document.querySelector(`#slider-${key} input`);
            input.value=String(value); input.dispatchEvent(new Event('input'));
        }
    },values);
    if(regenerate) await waitGeneration(previous); else await frames();
}
async function reset() {
    const previous=await generation();
    await page.locator('#button-reset').click(); await waitGeneration(previous);
    assert.ok(await page.locator('#button-reset').isDisabled());
}
async function paint(u=.5,v=.5,steps=8) {
    const bounds=await page.locator('#mapgen4').boundingBox();
    const previous=await generation();
    await page.mouse.move(bounds.x+bounds.width*u,bounds.y+bounds.height*v);
    await page.mouse.down();
    for(let i=0;i<steps;i++) {
        await page.mouse.move(bounds.x+bounds.width*u+i,bounds.y+bounds.height*v);
        await page.waitForTimeout(70);
    }
    await page.mouse.up(); await waitGeneration(previous);
    await page.waitForTimeout(250); // drain the coalesced regeneration request
    await frames();
}
try {
    await page.goto(base+'/embed.html?mode=editor');
    await waitGeneration(0);
    assert.equal(await page.locator('[id^="slider-"] input').count(),33);
    const initial=await snapshot('sphere-default');
    assert.ok(await page.locator('#button-reset').isDisabled());
    const version=await page.evaluate(()=>fetch('build/version.json').then(r=>r.json()));
    assert.equal(version.implementation,'sphere-original-renderer');
    results.push('Fresh build and unchanged original parameter controls');

    // Empty space must neither modify terrain nor disable seed/reset.
    const bounds=await page.locator('#mapgen4').boundingBox();
    await page.mouse.click(bounds.x+8,bounds.y+8);
    await frames();
    assert.ok(await page.locator('#button-reset').isDisabled());
    await equivalent(await snapshot('sphere-empty-click'),initial);
    results.push('Empty-space clicks do not paint');

    for(const tool of ['mountain','valley','ocean','shallow']) {
        await page.locator(`#${tool}`).click(); await page.locator('#large').click();
        await paint();
        assert.ok(await page.locator('#button-reset').isEnabled());
        assert.ok(await page.locator('#slider-seed input').isDisabled());
        assert.notEqual(await snapshot(`sphere-${tool}`),initial);
        await reset();
        await equivalent(await snapshot(`sphere-reset-${tool}`),initial);
    }
    results.push('All four terrain brushes alter output; Reset restores equivalent pixels (8 channels at 1/255 tolerance)');

    await page.mouse.move(bounds.x+bounds.width*.5,bounds.y+bounds.height*.5);
    await page.mouse.down({button:'right'});
    await page.mouse.move(bounds.x+bounds.width*.72,bounds.y+bounds.height*.6,{steps:8});
    await page.mouse.up({button:'right'});await frames();
    assert.ok(await page.locator('#button-reset').isDisabled());
    assert.notEqual(await page.locator('#slider-x input').inputValue(),'500');
    assert.notEqual(await snapshot('sphere-rotated'),initial);
    const oldZoom=Number(await page.locator('#slider-zoom input').inputValue());
    await page.mouse.wheel(0,-280);await frames();
    assert.ok(Number(await page.locator('#slider-zoom input').inputValue())>oldZoom);
    await snapshot('sphere-zoomed');
    results.push('Right-drag rotates without painting; wheel zooms and synchronizes sliders');

    await parameters({x:0,y:500,zoom:100/350});
    await page.locator('#mountain').click();
    await paint(); await snapshot('sphere-seam-painted'); await reset();
    for(const [name,y] of [['north',0],['south',1000]]) {
        await parameters({x:500,y});
        await paint(); await snapshot(`sphere-${name}-painted`); await reset();
    }
    results.push('Paint and reset on the date line and both poles');

    await parameters({x:500,y:500,zoom:100/350});
    await paint();
    await snapshot('sphere-mountains-original-style');
    await parameters({biome_colors:0});
    const neutral=await snapshot('sphere-neutral');
    await parameters({biome_colors:1,outline_strength:0,outline_coast:0,outline_water:0});
    const plain=await snapshot('sphere-no-outlines');
    await parameters({outline_strength:15,outline_water:13,outline_coast:1});
    const outlined=await snapshot('sphere-coast-outline');
    assert.notEqual(plain,outlined); assert.notEqual(neutral,outlined);
    await parameters({light_angle_deg:240});
    assert.notEqual(await snapshot('sphere-light-rotated'),outlined);
    results.push('Original biome, outline, river-bank and light controls change the render');
    await reset();
    await parameters({outline_coast:0,light_angle_deg:80});
    const beforeSeed=await snapshot('sphere-before-seed-change');
    await parameters({seed:188},true);
    assert.notEqual(await snapshot('sphere-seed188'),initial);
    await parameters({seed:187},true);
    await equivalent(await snapshot('sphere-seed187'),beforeSeed);
    results.push('Seed changes regenerate deterministically');

    // Navigation toggle is the one-finger touch path; same pointer handlers.
    await page.locator('#button-navigate').click();
    await page.mouse.move(bounds.x+430,bounds.y+430);await page.mouse.down();
    await page.mouse.move(bounds.x+520,bounds.y+470,{steps:6});await page.mouse.up();
    assert.ok(await page.locator('#button-reset').isDisabled());
    assert.notEqual(await page.locator('#slider-x input').inputValue(),'500');
    results.push('Drag-mode toggle rotates without editing');
    const timings=await page.evaluate(()=>window.generationTimes);

    await page.goto(base+'/build/reference/embed.html');
    await waitGeneration(0); await snapshot('original-default');
    await page.locator('#large').click();await paint();await snapshot('original-mountain-brush');
    const mobileContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
    const mobile=await mobileContext.newPage();
    mobile.on('pageerror',error=>errors.push(error.message));
    await mobile.goto(base+'/embed.html?mode=editor');
    await mobile.waitForSelector('#slider-zoom input');
    await mobile.waitForTimeout(700);
    await mobile.locator('#button-navigate').tap();
    const touchBounds=await mobile.locator('#mapgen4').boundingBox();
    const cx=touchBounds.x+touchBounds.width/2,cy=touchBounds.y+touchBounds.height/2;
    const cdp=await mobileContext.newCDPSession(mobile);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx+60,y:cy+20}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.notEqual(await mobile.locator('#slider-x input').inputValue(),'500');
    assert.ok(await mobile.locator('#button-reset').isDisabled());
    await mobile.locator('#button-navigate').tap();
    await mobile.touchscreen.tap(cx,cy);
    await mobile.waitForFunction(()=>!document.querySelector('#button-reset').disabled);
    await mobile.waitForTimeout(300);
    await mobile.screenshot({path:'build/validation/sphere-mobile.png'});
    await mobileContext.close();
    results.push('Emulated touch: one-finger rotation mode, painting, and portrait layout');
    assert.deepEqual(errors,[]);
    const report={results,errors,generations:timings.length,workerMilliseconds:{min:Math.min(...timings),max:Math.max(...timings),median:timings.slice().sort((a,b)=>a-b)[Math.floor(timings.length/2)]}};
    await writeFile('build/validation/browser-report.json',JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
} finally { await browser.close(); }
