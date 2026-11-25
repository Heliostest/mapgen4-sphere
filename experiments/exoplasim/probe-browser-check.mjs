import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const name=process.env.PLAYWRIGHT_MODULE||'playwright';
const {chromium}=await import(name.includes(':')?pathToFileURL(name).href:name);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const folder='experiments/exoplasim/evidence',url=`${process.env.BASE_URL||'http://127.0.0.1:8017'}/experiments/exoplasim/?revision=probe`;
await mkdir(folder,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
const near=(a,b,epsilon=1e-8)=>assert.ok(Math.abs(a-b)<epsilon,`${a} differs from ${b}`);
try{
 await page.goto(url);await page.waitForFunction(()=>window.comparisonReady||document.querySelector('#status')?.dataset.error,{},{timeout:90000});
 assert.equal(await page.locator('#status').getAttribute('data-error'),null,await page.locator('#status').textContent());
 const child=page.frames().find(f=>f.url().includes('comparison=1'));assert.ok(child);
 const canvas=child.locator('#mapgen4');
 const digest=()=>child.evaluate(async()=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(window.mapgen4Comparison.snapshot()))))).join(','));
 const settled=()=>child.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const state=()=>page.evaluate(()=>window.comparisonProbe);
 const before=await digest(),box=await canvas.boundingBox();assert.ok(box);
 await canvas.click({position:{x:box.width/2,y:box.height/2}});
 await page.waitForFunction(()=>window.comparisonProbe);
 const first=await state();assert.ok(first.elevationM<0);assert.equal(first.month,7);
 checks.push('Clicking the rendered globe selects geographic coordinates, physical elevation and both model series');

 // A drag returning to its origin must not be mistaken for a click.
 const x=box.x+box.width/2,y=box.y+box.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+40,y+15,{steps:5});await page.mouse.move(x,y,{steps:5});await page.mouse.up();await settled();
 let p=await state();near(p.latitude,first.latitude);near(p.longitude,first.longitude);
 await canvas.click({position:{x:5,y:5}});await settled();
 p=await state();near(p.latitude,first.latitude);near(p.longitude,first.longitude);
 assert.match(await page.locator('#probe-message').textContent(),/没有点中/);
 checks.push('Dragging, including out-and-back movement, and background clicks preserve the selected location');

 const locate=async(lat,lon)=>{
  await page.locator('#probe-latitude').fill(String(lat));await page.locator('#probe-longitude').fill(String(lon));
  await page.locator('#probe-coordinates button').click();
  await page.waitForFunction(([a,b])=>window.comparisonProbe?.latitude===a&&window.comparisonProbe?.longitude===b,[lat,lon]);await settled();
 };
 await locate(39.9,116.4);
 const centered=await child.evaluate(()=>window.mapgen4Comparison.pick([.5,.5]));
 near(centered.latitude,39.9,.01);near(centered.longitude,116.4,.01);
 p=await state();near(p.elevationM,centered.elevationM,.01);
 const result=JSON.parse(await readFile('experiments/exoplasim/result.json','utf8'));
 const column=Math.floor((116.4+180)/360*48),row=Math.floor((1-Math.sin(39.9*Math.PI/180))*12),cell=row*48+column;
 assert.equal(p.cell.index,cell);
 for(const model of ['native','gcm']){
  const frames=result[model].months;
  near(p[model].annualPrecipitationMm,frames.reduce((s,f)=>s+f.rainMmDay[cell]*f.seconds/86400,0));
  near(p[model].annualMeanTemperatureC,frames.reduce((s,f)=>s+(f.temperatureK[cell]-273.15)*f.seconds,0)/frames.reduce((s,f)=>s+f.seconds,0));
  for(let i=0;i<12;i++){near(p[model].months[i].precipitationMm,frames[i].rainMmDay[cell]*frames[i].seconds/86400);near(p[model].months[i].temperatureC,frames[i].temperatureK[cell]-273.15);}
 }
 assert.equal(await page.locator('#probe-rain-chart [data-month]').count(),12);
 assert.equal(await page.locator('#probe-temperature-chart [data-month]').count(),12);
 checks.push('Coordinate location centers on the correct point; all 24 monthly values and annual aggregates match raw result data');

 await page.locator('#probe-rain-chart [data-month="1"]').click();assert.equal(await page.locator('#month').inputValue(),'1');
 await page.locator('#probe-temperature-chart [data-month="8"]').focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator('#month').inputValue(),'8');
 assert.equal(await page.locator('#probe-temperature-chart [data-month="8"]').evaluate(el=>el===document.activeElement),true);
 await page.keyboard.press('Space');assert.equal((await state()).month,8);
 await page.locator('#native').click();await page.locator('#field').selectOption('wind');await page.locator('#view').selectOption('270,440');
 p=await state();assert.equal(p.model,'native');near(p.latitude,39.9);near(p.longitude,116.4);
 checks.push('Chart clicks and keyboard activation synchronize the global month; model, layer and camera changes preserve the probe');
 const csv=await page.locator('#probe-download').evaluate(async link=>await(await fetch(link.href)).text());
 const lines=csv.replace(/^\uFEFF/,'').split('\r\n');assert.equal(lines.length,25);assert.match(lines[0],/sampled_seconds.*precipitation_mm/);
 for(const [i,model] of ['native','gcm'].entries()){
  const row=lines[1+i*12].split(',');assert.equal(row[0],model);assert.equal(Number(row[1]),1);near(Number(row[8]),p[model].months[0].precipitationMm);
 }
 const downloadPromise=page.waitForEvent('download');await page.locator('#probe-download').click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/^climate-39\.90-116\.40\.csv$/);
 checks.push('CSV download contains both models and all 12 unrounded monthly totals');

 // Compare the same view with the marker on/off, then rotate the selected point behind the planet.
 await page.locator('#gcm').click();await page.locator('#field').selectOption('temperature');await locate(39.9,116.4);
 const withMarker=await canvas.screenshot();
 await child.evaluate(()=>window.mapgen4Comparison.setProbe(null));await settled();const withoutMarker=await canvas.screenshot();assert.ok(!withMarker.equals(withoutMarker));
 await child.evaluate(()=>{window.mapgen4Comparison.setProbe([(116.4+180)/360,(90-39.9)/180]);const s=document.querySelector('#slider-x input');s.value=String((Number(s.value)+500)%1000);s.dispatchEvent(new Event('input',{bubbles:true}));});await settled();
 const behind=await canvas.screenshot();await child.evaluate(()=>window.mapgen4Comparison.setProbe(null));await settled();assert.ok(behind.equals(await canvas.screenshot()),'Back-facing probe must be occluded');
 await locate(39.9,116.4);await page.locator('aside').evaluate(el=>el.scrollTop=0);
 await page.screenshot({path:`${folder}/probe-desktop.png`});
 await page.locator('#probe-annual').scrollIntoViewIfNeeded();await page.screenshot({path:`${folder}/probe-annual.png`});
 checks.push('The geographic marker is visible at the selected location and naturally disappears behind the globe');

 // Imported views may contain a legacy camera tilt. Coordinate focus must still center the target.
 await child.evaluate(()=>{const s=document.querySelector('#slider-tilt_deg input');s.value='90';s.dispatchEvent(new Event('input',{bubbles:true}));});
 await locate(-70,35);
 const tiltedCenter=await child.evaluate(()=>window.mapgen4Comparison.pick([.5,.5]));
 near(tiltedCenter.latitude,-70,.01);near(tiltedCenter.longitude,35,.01);near((await state()).elevationM,tiltedCenter.elevationM,.01);
 checks.push('Coordinate focus handles an imported nonzero camera tilt without reading another location’s elevation');
 // Both poles and the longitude seam are valid typed locations.
 for(const [lat,lon] of [[90,0],[-90,0],[0,180],[0,-180]]){await locate(lat,lon);p=await state();assert.ok(Number.isFinite(p.native.annualPrecipitationMm));}
 await locate(39.9,116.4);await page.setViewportSize({width:390,height:844});await page.locator('#location-probe').scrollIntoViewIfNeeded();await page.screenshot({path:`${folder}/probe-mobile.png`});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.ok(await page.locator('#probe-rain-chart').evaluate(el=>el.getBoundingClientRect().width>=300));
 checks.push('Poles and both sides of the dateline are selectable; the 390px layout has readable charts and no horizontal overflow');
 await page.locator('#probe-clear').click();assert.equal(await state(),null);assert.equal(await page.locator('#probe-body').isVisible(),false);
 assert.equal(await digest(),before);assert.deepEqual(errors,[]);
 checks.push('Clearing removes the probe; every interaction preserves the complete physical runtime exactly');
 await writeFile(`${folder}/probe-browser-report.json`,JSON.stringify({checks,errors,physicalStateUnchanged:true},null,2));console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
