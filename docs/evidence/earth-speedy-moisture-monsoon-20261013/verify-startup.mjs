import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const folder='docs/evidence/earth-speedy-moisture-monsoon-20261013',out='build/earth-speedy-moisture-monsoon';
const read=async n=>JSON.parse(await readFile(`${out}/${n}.json`));
const stages=await Promise.all(['audit-native','audit-fixed','audit-fixed-mass-fixed'].map(read));
const rows=stages.map(cases=>cases.map(c=>{
 const s=c.finalStep,threshold=Math.max(.05,.001*(Math.abs(s.evaporationMm)+s.precipitationCounterMm));
 const worst=c.steps.reduce((a,b)=>Math.abs(a.residualWithCounterMm)>Math.abs(b.residualWithCounterMm)?a:b);
 return {mode:c.mode,condensation:c.implementation,preserveWater:c.waterPreservingDryMass??false,initialSHA:c.initialSHA,residualMm:s.residualWithCounterMm,thresholdMm:threshold,passed:Math.abs(s.residualWithCounterMm)<=threshold,
  pressureWaterChangeMm:s.pressureWaterCorrectionMm,largeScaleWaterLeakMm:c.stageResidualMm.large_scale_condensation,
  maximumIntermediateResidualMm:worst.residualWithCounterMm,maximumIntermediateTime:worst.time,intermediateStepsAllPass:c.steps.every(v=>Math.abs(v.residualWithCounterMm)<=Math.max(.05,.001*(Math.abs(v.evaporationMm)+v.precipitationCounterMm))),
  dryMassRelative:c.final.dryKgM2/c.initial.dryKgM2-1};
}));
for(let k=0;k<2;k++){
 assert.equal(rows[0][k].passed,false);assert.equal(rows[1][k].passed,false);assert.equal(rows[2][k].passed,true);
 assert.equal(rows[2][k].initialSHA,rows[0][k].initialSHA);
 assert(Math.abs(rows[2][k].pressureWaterChangeMm)<1e-9);
 assert(Math.abs(rows[2][k].largeScaleWaterLeakMm)<1e-9);
 assert(Math.abs(rows[2][k].dryMassRelative)<1e-12);
}
await writeFile(`${folder}/startup-verification.json`,JSON.stringify({rows,scope:'Three-day endpoint criterion. Intermediate leapfrog stock/flux mismatch is retained and does not pass at every subdaily instant.'},null,2)+'\n');
console.log(JSON.stringify(rows,null,2));
