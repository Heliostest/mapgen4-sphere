import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const folder='build/validation/application';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1300,height:1000}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
await page.addInitScript(()=>{
    window.replies=[];window.sent=[];window.delayTerrain=0;window.delayFile=0;
    const hash=(buffer,length=buffer.byteLength)=>{let n=2166136261;for(const b of new Uint8Array(buffer,0,length))n=Math.imul(n^b,16777619);return n>>>0;};
    const W=window.Worker;
    window.Worker=class extends W {
        postMessage(data,...args){if(data.revision)window.sent.push(data.revision);super.postMessage(data,...args);}
        addEventListener(type,callback,...args){
            if(type!=='message')return super.addEventListener(type,callback,...args);
            return super.addEventListener(type,e=>{
                const delay=window.delayTerrain;
                const deliver=()=>{
                    const d=e.data,record={revision:d.revision,physical:hash(d.terrain_elevation_buffer),base:hash(d.base_triangle_elevation_buffer),geometry:hash(d.a_quad_em_buffer),rivers:hash(d.a_river_xyww_buffer,d.numRiverTriangles*21*4),indices:hash(d.quad_elements_buffer),count:d.numRiverTriangles};
                    callback(e);record.accepted=Number(document.querySelector('#terrain-generation').dataset.accepted);window.replies.push(record);
                };
                if(delay)setTimeout(deliver,delay);else deliver();
            },...args);
        }
    };
    const fileText=File.prototype.text;
    File.prototype.text=async function(){const delay=window.delayFile;const text=await fileText.call(this);if(delay)await new Promise(r=>setTimeout(r,delay));return text;};
});
const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const ready=async()=>{await page.waitForFunction(()=>document.querySelector('#terrain-generation')?.dataset.pending==='false'&&window.replies.length>0);await frames();};
const input=async(id,value)=>{await page.locator(id.startsWith('slider-')?`#${id} input`:`#${id}`).evaluate((e,v)=>{e.value=String(v);e.dispatchEvent(new Event(e.type==='range'?'input':'change',{bubbles:true}));},value);await frames();};
const hashes=()=>page.evaluate(()=>{const r=window.replies.at(-1);return {physical:r.physical,base:r.base,geometry:r.geometry,rivers:r.rivers,indices:r.indices,count:r.count};});
const capture=async name=>{await frames();return page.locator('#mapgen4').screenshot({path:`${folder}/${name}.png`});};
const save=async name=>{
    const wait=page.waitForEvent('download');await page.locator('#terrain-save').click();const download=await wait;
    await download.saveAs(`${folder}/${name}.json`);return JSON.parse(await readFile(`${folder}/${name}.json`,'utf8'));
};
const load=async data=>{
    await page.locator('#terrain-load').setInputFiles({name:'terrain.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
    await page.waitForFunction(()=>!/Reading/.test(document.querySelector('#terrain-file-status').textContent));
};
const evolve=async()=>{await page.locator('#geomorph-capture').click();await page.locator('#geomorph-step').click();await frames();};
try {
    await page.goto((process.env.BASE_URL||'http://localhost:8002')+'/embed.html');await ready();
    assert.equal(await page.locator('#geomorph-apply').count(),1);await page.locator('#geomorph-panel').evaluate(e=>e.open=true);
    const originalHash=await hashes(),original=await capture('original'),originalDoc=await save('original');
    await page.locator('#planet-layer').selectOption('soil-moisture');await page.locator('#planet-layer').selectOption('original');
    await input('geomorph-diffusion',10000000);await evolve();
    await page.locator('#geomorph-preview').uncheck();assert.ok(await page.locator('#geomorph-apply').isDisabled());
    await page.locator('#geomorph-preview').check();assert.ok(await page.locator('#geomorph-apply').isEnabled());
    await page.locator('#geomorph-apply').click();await ready();
    const firstHash=await hashes(),first=await save('first-application');
    assert.notDeepEqual(firstHash,originalHash);assert.ok(first.offsets.some(x=>x!==0));
    assert.equal(await page.locator('#water-age').getAttribute('data-days'),'0');
    assert.equal(await page.locator('#geomorph-age').getAttribute('data-years'),'0');
    assert.ok(await page.locator('#slider-seed input').isDisabled());assert.ok(await page.locator('#button-reset').isEnabled());
    await page.locator('#terrain-undo-apply').click();await ready();assert.deepEqual(await hashes(),originalHash);
    assert.ok(original.equals(await capture('undo-original')));
    checks.push('Applying rebuilds actual terrain/rivers, resets environment and clears preview; undo restores exact original buffers and pixels');
    await evolve();await page.locator('#geomorph-apply').click();await ready();
    const firstAgain=await save('first-again');assert.deepEqual(firstAgain.offsets,first.offsets);
    await evolve();await page.locator('#geomorph-apply').click();await ready();
    const second=await save('second-application');assert.notDeepEqual(second.offsets,first.offsets);
    const box=await page.locator('#mapgen4').boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);await ready();
    const painted=await save('painted');assert.equal(painted.constraints.painted,true);
    await page.locator('#terrain-undo-apply').click();await ready();
    const undone=await save('undo-preserves-paint');assert.deepEqual(undone.constraints,painted.constraints);assert.deepEqual(undone.offsets,first.offsets);
    assert.ok(await page.locator('#terrain-undo-apply').isDisabled());
    checks.push('Repeated application has independent offsets; undo after painting preserves the newer brush constraints');
    await input('planet-radius',8000);await input('planet-time-days',123.5);await page.locator('#planet-camera').selectOption('space');
    await input('slider-x',650);await input('slider-sphere_radius',410);await frames();
    const saved=await save('portable'),savedHash=await hashes(),savedPixels=await capture('portable');
    await page.locator('#button-reset').click();await ready();
    assert.equal((await save('reset')).offsets,null);assert.ok(await page.locator('#slider-seed input').isEnabled());
    await input('planet-radius',9000);await input('slider-x',500);
    await input('thermal-emissivity',.5);await input('water-wind',-50);await input('thermal-capacity',-1);await input('water-mixing',-1);
    await load(saved);await ready();
    assert.deepEqual(await hashes(),savedHash);assert.ok(savedPixels.equals(await capture('loaded')));
    assert.equal(await page.locator('#planet-radius').inputValue(),'8000');assert.equal(await page.locator('#planet-camera').inputValue(),'space');
    assert.ok(!(await page.locator('#thermal-enabled').isChecked()));assert.ok(!(await page.locator('#water-enabled').isChecked()));
    assert.equal(await page.locator('#thermal-emissivity').inputValue(),'0.61');assert.equal(await page.locator('#water-wind').inputValue(),'10');
    assert.equal(await page.locator('#thermal-capacity').getAttribute('aria-invalid'),null);assert.equal(await page.locator('#water-mixing').getAttribute('aria-invalid'),null);
    assert.equal(await page.locator('#planet-play').textContent(),'Play');
    assert.deepEqual(await save('round-trip'),saved);assert.ok(await page.locator('#terrain-undo-apply').isDisabled());
    checks.push('Portable document restores exact geometry, river buffers and rendered pixels plus authored constraints, planet/time/camera; Reset clears the layer');
    for(const malformed of [{...saved,version:99},{...saved,mesh:{...saved.mesh,fingerprint:'wrong'}},{...saved,offsets:[NaN]}]) {
        await load(malformed);assert.match(await page.locator('#terrain-file-status').textContent(),/Load failed/);assert.deepEqual(await hashes(),savedHash);
    }
    await page.locator('#terrain-load').setInputFiles({name:'large.json',mimeType:'application/json',buffer:Buffer.alloc(32*1024*1024+1,32)});
    assert.match(await page.locator('#terrain-file-status').textContent(),/exceeds/);assert.deepEqual(await save('after-invalid'),saved);
    await page.evaluate(()=>window.delayFile=500);
    await page.locator('#terrain-load').setInputFiles({name:'old.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(originalDoc))});
    await input('slider-hill_height',.04);await ready();const edited=await hashes();
    await page.waitForFunction(()=>/canceled/.test(document.querySelector('#terrain-file-status').textContent));assert.deepEqual(await hashes(),edited);
    await page.evaluate(()=>window.delayFile=0);
    await page.evaluate(()=>window.delayFile=300);
    await page.locator('#terrain-load').setInputFiles({name:'older.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(originalDoc))});
    await page.evaluate(()=>window.delayFile=0);await load(saved);await ready();await page.waitForTimeout(350);
    assert.deepEqual(await hashes(),savedHash);assert.deepEqual(await save('newer-file-wins'),saved);
    checks.push('Malformed, incompatible and oversized files are nonmutating; a delayed file read is canceled after a newer terrain edit');
    await page.evaluate(()=>window.delayTerrain=300);const before=await page.locator('#terrain-generation').getAttribute('data-accepted');
    await page.evaluate(()=>{
        for(const value of [.01,.02,.03,.045]){const e=document.querySelector('#slider-hill_height input');e.value=String(value);e.dispatchEvent(new Event('input',{bubbles:true}));}
    });
    assert.ok(await page.locator('#terrain-save').isDisabled());assert.ok(await page.locator('#geomorph-capture').isDisabled());
    await ready();const replies=await page.evaluate(n=>window.replies.filter(r=>r.revision>Number(n)),before);
    assert.equal(replies.length,2);assert.equal(replies[0].accepted,Number(before));assert.equal(replies[1].accepted,replies[1].revision);
    const latest=await save('coalesced');assert.equal(latest.parameters.elevation.hill_height,.045);
    const finalHash=await hashes();await load(latest);await ready();assert.deepEqual(await hashes(),finalHash);
    await page.locator('#planet-layer').selectOption('erosion');await evolve();
    await page.evaluate(()=>{document.querySelector('#geomorph-apply').click();document.querySelector('#button-reset').click();});await ready();
    assert.equal((await save('apply-reset')).offsets,null);assert.ok(await page.locator('#slider-seed input').isEnabled());
    await input('slider-hill_height',.02);await load(saved);await ready();assert.deepEqual(await hashes(),savedHash);
    assert.deepEqual(await save('load-supersedes-worker'),saved);await page.evaluate(()=>window.delayTerrain=0);
    checks.push('Delayed real worker replies coalesce edits, never publish obsolete revisions, recycle detached buffers and handle immediate Apply→Reset and edit→Load');
    await page.setViewportSize({width:390,height:844});await page.locator('#terrain-session').scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const mobileBox=await page.locator('#mapgen4').boundingBox();assert.ok(mobileBox.y>=-1&&mobileBox.y+mobileBox.height<=844);
    await page.screenshot({path:`${folder}/mobile.png`});checks.push('Document controls fit mobile width while the globe stays visible');
    assert.deepEqual(errors,[]);const report={checks,errors,originalHash,firstHash,savedHash};await writeFile(`${folder}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}
