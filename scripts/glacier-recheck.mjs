import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const folder=process.env.STAGE3_FOLDER||'build/validation/glacier-stage3';await mkdir(folder,{recursive:true});
const base=process.env.BASE_URL||'http://localhost:8002',browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1388,height:1244}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const input=async(id,value)=>{await page.locator(id.startsWith('slider-')?`#${id} input`:`#${id}`).evaluate((e,v)=>{e.value=String(v);e.dispatchEvent(new Event(e.type==='range'?'input':'change',{bubbles:true}));},value);await frames();};
const click=async id=>{await page.locator('#'+id).evaluate(e=>e.click());await frames();};
const capture=async name=>{await frames();return page.locator('#mapgen4').screenshot({path:`${folder}/${name}.png`});};
const load=async data=>{await page.locator('#terrain-load').setInputFiles({name:'glacier.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await page.waitForFunction(()=>/restored|failed/.test(document.querySelector('#terrain-file-status').textContent));await frames();return page.locator('#terrain-file-status').textContent();};
const save=async name=>{const pending=page.waitForEvent('download');await click('simulation-save');assert.doesNotMatch(await page.locator('#terrain-file-status').textContent(),/Save failed/);await (await pending).saveAs(`${folder}/${name}.json`);return JSON.parse(await readFile(`${folder}/${name}.json`,'utf8'));};
const compare=async(name,title,items)=>{
    const board=await browser.newPage({viewport:{width:1248,height:760}});
    await board.setContent(`<style>body{background:#10202a;color:#e8eff1;font:16px system-ui;margin:24px}h1{font-size:22px}.row{display:flex;gap:16px}figure{margin:0;width:592px}img{width:592px;height:586px;object-fit:contain}figcaption{line-height:1.5}</style><h1>${title}</h1><div class="row">${items.map(([label,bytes])=>`<figure><img src="data:image/png;base64,${bytes.toString('base64')}"><figcaption>${label}</figcaption></figure>`).join('')}</div>`);
    await board.locator('img').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));await board.screenshot({path:`${folder}/${name}.png`,fullPage:true});await board.close();
};
try {
    await page.goto(base+'/tests/glacier-render.html');await page.waitForFunction(()=>/PASS|FAIL/.test(document.querySelector('pre').textContent),{},{timeout:90000});
    const controlled=JSON.parse(await page.locator('pre').textContent());
    for(const id of ['flow','pole','melt'])if(await page.locator(`#${id} figure`).count())await page.locator('#'+id).screenshot({path:`${folder}/controlled-${id}.png`});
    await writeFile(`${folder}/controlled-report.json`,JSON.stringify(controlled,null,2));assert.equal(controlled.status,'PASS',controlled.error);
    if(process.argv.includes('--controlled-only')){console.log(JSON.stringify(controlled,null,2));}else {
        const initial=JSON.parse(await readFile('build/validation/glacier/initial.json','utf8')),evolved=JSON.parse(await readFile('build/validation/glacier/evolved.json','utf8'));
        await page.goto(base+'/embed.html?mode=editor&preview=glacier-stage3-recheck');await page.waitForFunction(()=>document.querySelector('#terrain-generation')?.dataset.pending==='false');
        const captures={};
        for(const [label,data] of [['initial',initial],['evolved',evolved]]) {
            assert.match(await load(data),/Complete simulation restored/);await input('planet-layer','surface');await input('planet-camera','surface');await input('slider-zoom',.212);await input('slider-x',500);await input('slider-y',500);captures[label]=await capture(label);
            for(const [pole,y] of [['north',0],['south',1000]]){await input('slider-x',202.349);await input('slider-y',y);captures[label+'-'+pole]=await capture(label+'-'+pole);await input('slider-x',750);await capture(label+'-'+pole+'-rotated');}
        }
        await compare('natural-comparison','Same seed / same camera · generated initial vs evolved cold planet',[[`Initial: day 0 · Bond albedo 0.45 · generated ice needs no Play`,captures.initial],[`Evolved: day ${(evolved.runtime.state.water.elapsedS/86400).toFixed(3)} · visible snow retreat and downstream water`,captures.evolved]]);
        await compare('polar-comparison','Same evolved state / same camera scale · actual north and south poles',[[`North: snow / grounded land ice and pale sea ice`,captures['evolved-north']],[`South: same rendering; authored coastlines and seasonal state differ`,captures['evolved-south']]]);
        await input('slider-y',500);await input('slider-x',0);const meridian=await capture('meridian');await input('slider-x',1000);assert.ok(meridian.equals(await capture('meridian-wrapped')),'Longitude wrap changed the rendered globe');
        const after=await save('after-views');assert.deepEqual(after.runtime,evolved.runtime);
        const k=evolved.runtime.state.water.landIceKgM2.findIndex((v,i)=>v>5*917*evolved.runtime.state.land[i]);assert.ok(k>=0);
        const bad=structuredClone(evolved);bad.runtime.state.water.landIceKgM2[k]+=1000;assert.match(await load(bad),/Load failed.*water budget/i);assert.deepEqual((await save('after-invalid-water')).runtime,evolved.runtime);
        bad.runtime.state.water.initialTotalMm+=1000/evolved.runtime.grid.width/evolved.runtime.grid.height;assert.match(await load(bad),/Load failed.*enthalpy budget/i);assert.deepEqual((await save('after-invalid-energy')).runtime,evolved.runtime);
        await page.goto(base+'/embed.html?preview=glacier-stage3-live-recheck');
        await page.waitForFunction(()=>document.querySelector('#terrain-generation')?.dataset.pending==='false'&&document.querySelector('#planet-play')?.textContent==='Pause');await click('planet-play');
        const liveSystems={};for(const id of ['environment-terrain-water','environment-glaciers','environment-circulation','environment-weather'])liveSystems[id]=await page.locator('#'+id).isChecked();
        assert.ok(Object.values(liveSystems).every(Boolean));await capture('live-default');
        const w=evolved.runtime.state.water,first=initial.runtime.state.water;
        const state=evolved.runtime.state,last=state.localLand.length-96;
        const report={status:'PASS',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),controlled,seed:initial.terrain.parameters.elevation.seed,elapsedDays:w.elapsedS/86400,steps:state.thermal.steps,initialIceMm:first.landIceKgM2.reduce((a,b)=>a+b,0)/first.landIceKgM2.length,finalIceMm:w.landIceKgM2.reduce((a,b)=>a+b,0)/w.landIceKgM2.length,maxSpeedMyr:Math.max(...w.glacier.speedMps)*365.25*86400,maxErosionM:Math.max(...w.glacier.erodedM),polarInputs:{northLandFraction:state.localLand[0],southLandFraction:state.localLand[last],northHeightM:state.localHeight[0]*evolved.terrain.settings.planet.reliefM,southHeightM:state.localHeight[last]*evolved.terrain.settings.planet.reliefM,orbitPhaseRad:evolved.terrain.settings.orbit.orbitPhaseRad},viewsPreserveExactRuntime:true,meridianPixelsExact:true,corruptIceMassRejected:true,corruptFusionEnergyRejected:true,liveSystems,errors,captures:['natural-comparison.png','polar-comparison.png','controlled-flow.png','controlled-pole.png','controlled-melt.png','live-default.png'],observation:'Natural 40-day changes include snow melt and hydrology; micrometre-scale abrasion is not visually resolvable. Long flow is a separately labelled isothermal kernel fixture.'};
        assert.deepEqual(errors,[]);await writeFile(`${folder}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
    }
    assert.deepEqual(errors,[]);
} finally {await browser.close();}
