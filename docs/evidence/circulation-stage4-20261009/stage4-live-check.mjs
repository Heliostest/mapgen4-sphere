import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const folder='build/validation/circulation-stage4-accepted';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:1300}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://localhost:8002/tests/live-planet.html');await page.waitForFunction(()=>document.querySelector('pre').textContent.includes('"status"'));
 const fixture=JSON.parse(await page.locator('pre').textContent());assert.equal(fixture.status,'PASS');
 await page.goto('http://localhost:8002/embed.html');await page.waitForFunction(()=>document.querySelector('#terrain-generation')?.dataset.pending==='false'&&Number(document.querySelector('#thermal-age')?.dataset.days)>0);
 const actual=await page.evaluate(()=>{const gl=document.querySelector('#mapgen4').getContext('webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');return {play:document.querySelector('#planet-play').textContent,layer:document.querySelector('#planet-layer').value,ageDays:Number(document.querySelector('#thermal-age').dataset.days),active:['water-enabled','environment-vegetation','environment-albedo','environment-terrain-water','environment-glaciers','environment-circulation'].map(id=>({id,on:document.querySelector('#'+id)?.checked})),renderer:gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)}});
 assert.equal(actual.play,'Pause');assert.equal(actual.layer,'surface');assert.ok(actual.ageDays>0);assert.ok(actual.active.every(v=>v.on));assert.deepEqual(errors,[]);
 await page.locator('#planet-play').evaluate(e=>e.click());await page.locator('#mapgen4').screenshot({path:folder+'/live-default.png'});
 const report={status:'PASS',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),fixture,actual,errors};await writeFile(folder+'/live-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:'PASS',checks:fixture.checks.length,actual},null,2));
}finally{await browser.close();}
