import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-speedy-budgets-sst-20261012',out='build/earth-speedy-budgets-sst';
const hash=b=>createHash('sha256').update(b).digest('hex');
const mfBytes=await readFile(`${folder}/manifest.json`),m=JSON.parse(mfBytes);
for(const b of m.bindings){const bytes=await readFile(b.path);assert.equal(bytes.length,b.bytes,b.path);assert.equal(hash(bytes),b.sha256,b.path);}
for(const a of m.archives){const bytes=await readFile(a.path);assert.equal(hash(bytes),a.sha256,a.path);assert.equal(hash(gunzipSync(bytes)),a.rawSha256,a.path);}
const restart=JSON.parse(await readFile(`${out}/restart-verification.json`,'utf8'));
assert.equal(restart.length,2);assert(restart.every(v=>v.exactNextStep&&v.mismatchPaths.length===0));
const viewer=JSON.parse(await readFile(`${out}/viewer-display-verification.json`,'utf8'));assert.equal(viewer.realMonthlyDataChecked,true);
const browser=JSON.parse(await readFile(`${folder}/browser-verification.json`,'utf8'));assert.equal(browser.passed,true);
const a=JSON.parse(await readFile(`${folder}/acceptance.json`,'utf8'));assert.equal(a.acceptance.formalDefaultUnchanged,true);
const probe=JSON.parse(await readFile(`${out}/probe-results.json`,'utf8'));
const probeStatus=JSON.parse(await readFile(`${folder}/resume-probe-native-status.json`,'utf8'));
assert.equal(probeStatus.code,0);assert(probeStatus.sourceUnchanged);
for(const [path,sha] of Object.entries(probeStatus.sourceAfter))assert.equal(hash(await readFile(path)),sha);
for(const r of probe.records){
 assert.equal(r.initialSHA,m.initialAtmLandSHA);
 assert.equal(r.airWaterLimitMm,Math.max(.05,.001*(Math.abs(r.evaporationMm)+r.precipitationMm)));
 assert.equal(r.airWaterPassed,Math.abs(r.airWaterExcludingModeCorrectionMm)<=r.airWaterLimitMm);
}
for(const c of a.cases.filter(v=>v.id!=='reference')){
 assert.equal(c.integration.calls,105169);assert.equal(c.integration.end,'2007-01-01T00:00:00');
 assert.equal(c.integration.initialAtmLandSHA,m.initialAtmLandSHA);
 assert(c.budget.massMode.maxPostDryRelative<=1e-6);assert(c.budget.statisticsYear.landWaterPassed);assert(c.budget.fullSpan.landWaterPassed);
 // Atmospheric water thresholds may fail: preserve and report, never rewrite acceptance.
 for(const b of [c.budget.statisticsYear,c.budget.fullSpan])assert.equal(b.airWaterPassed,Math.abs(b.airWaterExcludingCurrentModeResidualMm)<=b.airWaterLimitMm);
}
const result={createdUTC:new Date().toISOString(),status:'PASS',evidenceIntegrityPassed:true,manifestSHA256:hash(mfBytes),bindings:m.bindings.length,archives:m.archives.length,realIntegrationsVerified:true,exactNextStepVerified:true,initialStockVerified:true,formalDefaultsUnchanged:true,browserVerified:true,regionalClimateAccepted:false,atmosphericWater:a.cases.map(c=>({id:c.id,yearPassed:c.budget.statisticsYear.airWaterPassed,fullPassed:c.budget.fullSpan.airWaterPassed})),startupAtmosphericWater:probe.records.map(r=>({id:r.mode,remainingResidualMm:r.airWaterExcludingModeCorrectionMm,limitMm:r.airWaterLimitMm,passed:r.airWaterPassed})),note:'Evidence/implementation checks passed; startup atmospheric water, regional climate and full coupled Earth budgets are separate and remain unaccepted.'};
await writeFile(`${folder}/final-verification.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
