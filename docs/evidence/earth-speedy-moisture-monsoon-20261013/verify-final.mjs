import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-speedy-moisture-monsoon-20261013',out='build/earth-speedy-moisture-monsoon';
const hash=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p,'utf8'));
const mfBytes=await readFile(`${folder}/manifest.json`),m=JSON.parse(mfBytes);
for(const b of m.bindings){const bytes=await readFile(b.path);assert.equal(bytes.length,b.bytes,b.path);assert.equal(hash(bytes),b.sha256,b.path);}
for(const a of m.archives){const bytes=await readFile(a.path);assert.equal(hash(bytes),a.sha256,a.path);assert.equal(hash(gunzipSync(bytes)),a.rawSha256,a.path);}
const restart=await load(`${out}/restart-verification.json`);assert.equal(restart.length,2);assert(restart.every(v=>v.exactNextStep&&v.mismatchPaths.length===0));
const browser=await load(`${folder}/browser-verification.json`);assert(browser.passed);assert.equal(browser.displaySHA256,hash(await readFile(`${out}/comparison-display.json`)));assert.equal(browser.bundleSHA256,hash(await readFile(`${out}/preview.js`)));assert.equal(browser.observationSHA256,hash(await readFile(`${folder}/browser-observations.json`)));
const viewer=await load(`${out}/viewer-display-verification.json`);assert(viewer.realMonthlyDataChecked);assert.equal(viewer.exactValuesChecked,4*12*1152*27);assert.equal(viewer.inputSHA256,hash(await readFile(`${out}/comparison-display.json`)));
for(const b of viewer.sourceBindings)assert.equal(hash(await readFile(b.path)),b.sha256,b.path);
assert.equal(viewer.verifierSHA256,hash(await readFile(`${folder}/verify-display.mjs`)));assert.equal(viewer.sourceBindings.length,8);assert.equal(new Set(viewer.sourceBindings.map(b=>b.path)).size,8);
assert.deepEqual(viewer.sourceBindings.map(b=>b.path),[['build/earth-speedy-budgets-sst','seasonal'],[out,'moisture-seasonal'],[out,'coupled-slab'],[out,'coupled-seasonal']].flatMap(([base,id])=>[`${base}/${id}-statistics.json`,`${base}/${id}-geometry.json`]));
const a=await load(`${folder}/acceptance.json`);assert(a.acceptance.formalDefaultUnchanged);assert.equal(a.acceptance.regionalClimateAccepted,false);
assert.deepEqual(a.cases.map(c=>c.id),['before-seasonal','water-seasonal','coupled-slab','coupled-seasonal']);assert.equal(m.launches.length,3);
const startup=[];
const coupledAudit=await load(`${out}/audit-coupled-mass-fixed.json`);assert.deepEqual(coupledAudit.map(r=>r.mode),['slab','seasonal']);
for(const row of coupledAudit){
 for(const v of [row.finalStep.evaporationMm,row.finalStep.precipitationCounterMm,row.finalStep.residualWithCounterMm,...Object.values(row.stageResidualMm)])assert(typeof v==='number'&&Number.isFinite(v));
 assert.equal(row.initialSHA,m.initialAtmLandSHA);const final=row.finalStep,limit=Math.max(.05,.001*(Math.abs(final.evaporationMm)+final.precipitationCounterMm));
 assert(Math.abs(final.residualWithCounterMm)<=limit);assert(Object.hasOwn(row.stageResidualMm,'vertical_diffusion'));assert(Math.abs(row.stageResidualMm.vertical_diffusion)<1e-10);assert(Math.abs(row.stageResidualMm.large_scale_condensation)<1e-10);
 const worst=row.steps.reduce((x,y)=>Math.abs(x.residualWithCounterMm)>Math.abs(y.residualWithCounterMm)?x:y);
 startup.push({mode:row.mode,residualMm:final.residualWithCounterMm,limitMm:limit,passed:true,maximumIntermediateResidualMm:worst.residualWithCounterMm,maximumIntermediateTime:worst.time,intermediateStepsAllPass:row.steps.every(s=>Math.abs(s.residualWithCounterMm)<=Math.max(.05,.001*(Math.abs(s.evaporationMm)+s.precipitationCounterMm)))});
}
for(const c of a.cases.slice(1)){
 assert.equal(c.source.calls,105169);assert.equal(c.source.end,'2007-01-01T00:00:00');assert.equal(c.source.initialSHA,m.initialAtmLandSHA);
 assert(Number.isFinite(c.massMode.maxPostDryRelative));assert(c.massMode.maxPostDryRelative<=1e-6);assert(c.budget.year.landWaterPassed);assert(c.budget.full.landWaterPassed);
 for(const b of [c.budget.year,c.budget.full]){assert.equal(b.airWaterLimitMm,Math.max(.05,.001*(Math.abs(b.terms.evaporationMm)+b.terms.precipitationMm)));assert.equal(b.airWaterPassed,Math.abs(b.airWaterExcludingModeResidualMm)<=b.airWaterLimitMm);}
 assert.equal(c.regions.length,11);assert(c.regions.every(r=>r.monthlyMm.every(Number.isFinite)));assert(c.remapping.every(r=>Math.abs(r.errorMm)<1e-9*Math.max(1,r.nativeLandRainGlobalMm)));
}
const result={createdUTC:new Date().toISOString(),status:'PASS',evidenceIntegrityPassed:true,manifestSHA256:hash(mfBytes),bindings:m.bindings.length,archives:m.archives.length,realIntegrationsVerified:3,physicalNextStepExact:true,diagnosticRestartVerified:false,formalDefaultsUnchanged:true,browserVerified:true,regionalClimateAccepted:false,startupAtmosphericWater:startup,
 atmosphericWater:a.cases.map(c=>({id:c.id,yearResidualMm:c.budget.year.airWaterExcludingModeResidualMm,yearPassed:c.budget.year.airWaterPassed,fullResidualMm:c.budget.full.airWaterExcludingModeResidualMm,fullPassed:c.budget.full.airWaterPassed})),
 monsoonScreens:a.diagnosis.map(c=>({id:c.id,regions:c.regions.filter(r=>r.seasonalScreen).map(r=>({name:r.name,...r.seasonalScreen}))})),note:'PASS verifies evidence and implementation checks; each physical/climate gate is reported separately.'};
await writeFile(`${folder}/final-verification.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
