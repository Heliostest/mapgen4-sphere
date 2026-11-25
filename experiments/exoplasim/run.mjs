import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
// PLAYWRIGHT_MODULE may be an installed package or an absolute index.mjs path.
const moduleName=process.env.PLAYWRIGHT_MODULE||'playwright';
const {chromium}=await import(moduleName.includes(':')?pathToFileURL(moduleName).href:moduleName);
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(`${process.env.BASE_URL||'http://127.0.0.1:8017'}/build/exoplasim/runner.html`);
 const started=Date.now();let previous=-1;
 while(true){
  const status=await page.evaluate(()=>{const s=window.exoRun;return s?{status:s.status,day:s.day,error:s.error}:null;});
  if(status?.error||errors.length)throw new Error(JSON.stringify({status,errors}));
  if(status?.status==='complete')break;
  if(status&&Math.floor(status.day/15)!==previous){previous=Math.floor(status.day/15);console.log(JSON.stringify(status));}
  if(Date.now()-started>1800000)throw new Error('Reference exceeded 30 minutes');
  await page.waitForTimeout(1000);
 }
 const result=await page.evaluate(()=>window.exoRun.result);await writeFile('build/exoplasim/gcm.json',JSON.stringify(result));
 console.log(JSON.stringify({gcmDone:true,samples:result.samples,wallSeconds:result.wallSeconds}));
}finally{await browser.close();}
