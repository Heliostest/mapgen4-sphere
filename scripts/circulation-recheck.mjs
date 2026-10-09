import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const folder=process.env.CIRCULATION_FOLDER||'build/validation/circulation-stage4';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1248,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
    // Keep evidence capture on real browser frames. The deterministic fake-rAF
    // continuation harness can leave the zero-age layer visually stale.
    await page.setViewportSize({width:1440,height:1300});
    await page.goto((process.env.BASE_URL||'http://localhost:8002')+'/embed.html?mode=editor');
    await page.waitForFunction(()=>document.querySelector('#terrain-generation')?.dataset.pending==='false');
    const nativeFrames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const windCaptures=[];
    for(const [state,name] of [['initial','initial-wind'],['saved','evolved-wind']]){
        const document=JSON.parse(await readFile(`${folder}/${state}.json`,'utf8'));
        await page.locator('#terrain-load').setInputFiles({name:'world.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(document))});
        await page.waitForFunction(()=>!/Reading|Preparing/.test(document.querySelector('#terrain-file-status').textContent));
        assert.match(await page.locator('#terrain-file-status').textContent(),/Complete simulation restored/);
        assert.equal(await page.locator('#planet-play').textContent(),'Play');
        await page.locator('#planet-layer').selectOption('wind');await nativeFrames();
        await page.locator('#mapgen4').screenshot({path:`${folder}/${name}.png`});
        const pending=page.waitForEvent('download');await page.locator('#simulation-save').evaluate(e=>e.click());
        const download=await pending;await download.saveAs(`${folder}/${name}-native.json`);
        const captured=JSON.parse(await readFile(`${folder}/${name}-native.json`,'utf8'));
        assert.deepEqual(captured.runtime,document.runtime);
        assert.deepEqual(captured.terrain,document.terrain);
        assert.equal(captured.view.layer,'wind');
        windCaptures.push({state,name,nativeFrames:true,runtimeUnchanged:true,terrainAndCameraUnchanged:true});
    }
    await page.setViewportSize({width:1248,height:1000});
    await page.goto((process.env.BASE_URL||'http://localhost:8002')+'/tests/circulation-evidence.html?folder='+encodeURIComponent(folder));
    await page.waitForFunction(()=>/"status"|FAIL/.test(document.querySelector('pre').textContent));
    const result=JSON.parse(await page.locator('pre').textContent());assert.equal(result.status,'PASS');assert.deepEqual(errors,[]);
    for(const [id,name] of [['wind','wind-evolution'],['ocean','ocean-evolution'],['controlled','controlled-transport']])await page.locator('#'+id).screenshot({path:`${folder}/${name}.png`});
    const browserReport=JSON.parse(await readFile(`${folder}/report.json`,'utf8'));
    const report={...result,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),browserReport,windCaptures,errors,captures:['wind-evolution.png','ocean-evolution.png','controlled-transport.png']};
    await writeFile(`${folder}/recheck-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
