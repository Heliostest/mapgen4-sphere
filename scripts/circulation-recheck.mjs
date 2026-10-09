import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const folder=process.env.CIRCULATION_FOLDER||'build/validation/circulation-stage4';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1248,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
    await page.goto((process.env.BASE_URL||'http://localhost:8002')+'/tests/circulation-evidence.html?folder='+encodeURIComponent(folder));
    await page.waitForFunction(()=>/"status"|FAIL/.test(document.querySelector('pre').textContent));
    const result=JSON.parse(await page.locator('pre').textContent());assert.equal(result.status,'PASS');assert.deepEqual(errors,[]);
    for(const [id,name] of [['wind','wind-evolution'],['ocean','ocean-evolution'],['controlled','controlled-transport']])await page.locator('#'+id).screenshot({path:`${folder}/${name}.png`});
    const browserReport=JSON.parse(await readFile(`${folder}/report.json`,'utf8'));
    const report={...result,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),browserReport,errors,captures:['wind-evolution.png','ocean-evolution.png','controlled-transport.png']};
    await writeFile(`${folder}/recheck-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
