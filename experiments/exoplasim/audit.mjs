import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const name=process.env.PLAYWRIGHT_MODULE||'playwright';
const {chromium}=await import(name.includes(':')?pathToFileURL(name).href:name);
const browser=await chromium.launch({channel:'chrome',headless:true}),scenario=process.argv[2]||'original',days=Number(process.argv[3]||2),base=process.env.BASE_URL||'http://127.0.0.1:8017';
const page=await browser.newPage(),errors=[],fileAudit=[];
const script=await readFile('build/exoplasim/wasm-worker.js','utf8');
let setup='';
if(scenario==='sst-only'||scenario==='no-glacier-sst'){
 const source=resolve(process.env.EXOPLASIM_SOURCE||join(tmpdir(),'mapgen4-exoplasim-daface8'));
 const packaged=JSON.parse(await readFile(join(source,'public/gcm/t21/inputs.json'),'utf8'));
 setup=`request.files['N032_surf_0169.sra']=${JSON.stringify(packaged.files['N032_surf_0169.sra'])};`;
}
const instrument=`
  if(request.rank===0){const names=model.FS.readdir('/').filter(n=>n.endsWith('.sra')||n.endsWith('_namelist'));const files=Object.fromEntries(names.map(n=>[n,model.FS.readFile('/'+n,{encoding:'utf8'})]));console.info('EXO_AUDIT_FILES:'+JSON.stringify(files));}
`;
if(!script.includes('prepareFiles(request);'))throw new Error('Instrumentation anchor changed');
await page.route('**/wasm-worker.js',route=>route.fulfill({contentType:'text/javascript',headers:{'Cross-Origin-Embedder-Policy':'credentialless'},body:script.replace('prepareFiles(request);',`request.namelistEdits.plasim_namelist.SEED='14963991,2,3,4,5,6,7,8';${setup}prepareFiles(request);${instrument}`)}));
page.on('console',m=>{if(m.text().startsWith('EXO_AUDIT_FILES:'))fileAudit.push(JSON.parse(m.text().slice('EXO_AUDIT_FILES:'.length)));});
page.on('pageerror',e=>errors.push(e.message));
page.on('requestfailed',r=>errors.push(`${r.url()}: ${r.failure()?.errorText}`));
try{
 await page.goto(`${base}/build/exoplasim/audit.html?scenario=${encodeURIComponent(scenario)}&days=${days}`);const start=Date.now();let last=-1;
 while(true){const s=await page.evaluate(()=>{const s=window.exoAudit;return s?{status:s.status,day:s.day,error:s.error}:null;});if(s?.error||errors.length)throw new Error(JSON.stringify({s,errors}));if(s?.status==='complete')break;if(s&&Math.floor(s.day/30)!==last){last=Math.floor(s.day/30);console.log(JSON.stringify(s));}if(Date.now()-start>1800000)throw new Error('Audit timed out');await page.waitForTimeout(1000);}
 const result=await page.evaluate(()=>window.exoAudit);await mkdir('build/exoplasim/audit',{recursive:true});await writeFile(`build/exoplasim/audit/${scenario}-${days}.json`,JSON.stringify({...result,fileAudit,errors}));
 if(scenario==='production'){assert.equal(result.first.maskErrors,0);assert.equal(result.first.landGlacierFraction,0,'Disabled glacier run unexpectedly initializes land glaciers');assert.ok(result.nativeFields.dglac.every(x=>x===0),'Native restart contains unintended glacier mask');}
 console.log(JSON.stringify({scenario,first:{...result.first,land:undefined,skinK:undefined,airK:undefined,seaIce:undefined,iceM:undefined},last:result.samples.at(-1),nativeSummary:result.nativeSummary,files:fileAudit.map(x=>Object.keys(x))}));
}finally{await browser.close();}
