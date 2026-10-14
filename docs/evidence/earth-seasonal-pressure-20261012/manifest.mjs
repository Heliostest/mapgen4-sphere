import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-seasonal-pressure-20261012',out='build/earth-seasonal-pressure';
const sha=data=>createHash('sha256').update(data).digest('hex');
const c=JSON.parse(await fs.readFile(folder+'/comparison.json','utf8'));
const inputs=['scenes/earth-land-sea/earth-simulation.json','build/earth-lakes-freeze-temperate/lake-day0.json','docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json','docs/evidence/earth-seaice-causal-20261011/nsidc-same-grid.json'];
const sources=['circulation-scheme.ts','circulation.ts','climate.ts','environment.ts','runtime-state.ts','water.ts','thermal.ts','thermal-runtime.ts','refinement-surface.ts','terrain-water.ts','tests/circulation.test.ts','tests/moisture.test.ts','tests/simulation.test.ts'];
async function list(path){const files=[];for(const d of await fs.readdir(path,{withFileTypes:true})){if(d.name==='manifest.json')continue;const p=path+'/'+d.name;files.push(...(d.isDirectory()?await list(p):[p]));}return files;}
const snapshots=(await fs.readdir(out)).filter(f=>/^full-.*-day\d+\.json$/.test(f)).map(f=>out+'/'+f);
const previews=['before','balanced','boundary','initial'].map(l=>out+'/'+l+'-preview.html');
const files=[];
for(const file of [...inputs,...sources,...await list(folder),...snapshots,...previews]){const b=await fs.readFile(file);files.push({file,bytes:b.length,sha256:sha(b)});}
assert.equal(files.find(f=>f.file===inputs[0]).sha256,'afb80a8ab730785eed0cb709a66d938ad20a9690b04ecfa1246d1deb393adca6');
assert.equal(files.find(f=>f.file===inputs[1]).sha256,'24bfe8b9a4768000574aa3febf3ed2be692ed2a071346175a9f0463280c2854b');
assert.equal(new Set(c.full.map(j=>j.initialStockSha)).size,1);assert.equal(new Set(c.screening.map(j=>j.initialStockSha)).size,1);
const initial=[];
for(const j of c.full)initial.push(JSON.parse(await fs.readFile(out+'/full-'+j.label+'-day0.json','utf8')).runtime.state);
for(const s of initial.slice(1))for(const key of ['windEastMps','windNorthMps'])assert.deepEqual(s.water[key],initial[0].water[key],'Applied initial winds must match');
let fluxResidual=0,stockResidual=0;
for(const a of c.archives){
 const b=gunzipSync(await fs.readFile(folder+'/'+a.file));assert.equal(sha(b),a.rawSha256);
 assert.equal(sha(gunzipSync(await fs.readFile(folder+'/bundles/'+a.bundleSha256+'.mjs.gz'))),a.bundleSha256);
 const j=JSON.parse(b),v=j.vaporBudget;assert(j.strictContinuation);
 for(let k=0;k<v.initial.length;k++){
  stockResidual=Math.max(stockResidual,Math.abs(v.final[k]-v.initial[k]-v.evaporation[k]+v.precipitation[k]-v.netTransport[k]));
  for(let m=0;m<12;m++)fluxResidual=Math.max(fluxResidual,Math.abs(v.monthlyNetTransport[m][k]-v.monthlyAdvectiveNet[m][k]-v.monthlyDiffusiveNet[m][k]));
 }
}
assert(stockResidual<1e-8&&fluxResidual<1e-8);
const restore=JSON.parse(await fs.readFile(folder+'/serialized-restore.json','utf8'));assert(restore.length===3&&restore.every(j=>j.jsonRoundtripNextStepExact&&j.serializedSavedEndpointEqualsIntegratedLedgers));
for(const image of ['before','balanced','boundary']){
 const b=await fs.readFile(folder+'/'+image+'-asia.jpg');assert(b[0]===255&&b[1]===216,'Expected actual browser JPEG bytes');
}
const ui=JSON.parse(await fs.readFile(folder+'/webgl-verification.json','utf8'));
assert(ui.length===3&&ui.every(j=>j.errors.length===0&&j.view==='820,420'&&j.relief==='12'&&j.controls['planet-time-days']==='365.270833'&&j.controls['planet-camera']==='space'&&j.controls['planet-layer']==='surface'&&!j.controls['environment-weather']));
const testBytes=await fs.readFile(out+'/test-output.txt'),testText=testBytes[0]===255&&testBytes[1]===254?testBytes.toString('utf16le'):testBytes.toString('utf8');
const testCount=Number(testText.match(/tests\s+(\d+)/)?.[1]),passes=Number(testText.match(/pass\s+(\d+)/)?.[1]),failures=Number(testText.match(/fail\s+(\d+)/)?.[1]);
assert(testCount===278&&passes===testCount&&failures===0);
const testLog=await fs.readFile(out+'/test-output.txt');files.push({file:out+'/test-output.txt',bytes:testLog.length,sha256:sha(testLog)});
const verification={tests:testCount,failed:failures,typecheck:true,build:true,diffCheck:true,independentReadOnlyReview:'Ready for experimental delivery; no critical or important findings; minor face-attribution coverage addressed',fullAnnualArms:c.full.length,coarseAnnualArms:c.screening.length,dailyAuditsPerFullArm:366,serializedJsonNextStepExact:true,coarseHalfStepComparison:true,actualVaporStockResidualMaxMm:stockResidual,calendarAdvectiveDiffusiveFluxResidualMaxMm:fluxResidual,actualWebGLScreenshots:3};
await fs.writeFile(folder+'/manifest.json',JSON.stringify({date:'2026-10-12',formalDefaultUnchanged:true,regionalClimateAccepted:false,fullInitialStockSha256:c.full[0].initialStockSha,coarseInitialStockSha256:c.screening[0].initialStockSha,verification,files},null,2)+'\n');
console.log(JSON.stringify({files:files.length,verification}));
