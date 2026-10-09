import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const folder=process.env.CIRCULATION_FOLDER||'build/validation/circulation-stage4';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
    await page.goto((process.env.BASE_URL||'http://localhost:8002')+'/tests/gpu-wind.html');
    await page.waitForFunction(()=>/"status"/.test(document.querySelector('pre').textContent));
    const report=JSON.parse(await page.locator('pre').textContent());await writeFile(`${folder}/gpu-wind-report.json`,JSON.stringify(report,null,2));
    assert.equal(report.status,'PASS');assert.deepEqual(errors,[]);console.log(JSON.stringify({status:report.status,checks:report.checks,failedChecks:report.failedChecks,errors},null,2));
}finally{await browser.close();}
