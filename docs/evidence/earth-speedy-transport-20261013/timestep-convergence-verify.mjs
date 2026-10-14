import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const dir='build/earth-speedy-transport',docs='docs/evidence/earth-speedy-transport-20261013';
const load=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const near=(a,b,tol=1e-11)=>assert.ok(Math.abs(a-b)<=tol,`${a} differs from ${b}`);
const status=await load(`${docs}/timestep-convergence-native-status.json`);
assert.equal(status.code,0);assert.equal(status.sourceUnchanged,true);assert.equal(status.inputsUnchanged,true);
const summary=await load(`${dir}/timestep-convergence-summary.json`);
const cases=[];let checks=3;
for(const dt of [1800,900,450]){
 const r=await load(`${dir}/timestep-convergence-${dt}s.json`);
 assert.equal(r.physicsFix,'all-corrections');assert.equal(r.mode,'seasonal');
 assert.equal(r.nSteps,3*86400/dt+1);assert.equal(r.steps.length,r.nSteps);
 assert.ok(Object.values(r.initialFields).every(f=>f.exact));checks+=5;
 let elapsed=0;
 for(let i=0;i<r.steps.length;i++){
  const step=r.steps[i];assert.equal(step.counter,i);assert.equal(step.step,i+1);
  near(step.dt,i<2?dt/2:dt);elapsed+=step.dt;near(step.elapsedSeconds,elapsed);
  near(step.nativeAtmosphericStepSeconds,i===0?dt/2:i===1?dt:2*dt);
  near(step.rectangularResidual-step.timeStaggerContribution,step.discreteFluxResidual);
  assert.ok(step.minTemperatureK>0);checks+=7;
 }
 assert.equal(elapsed,3*86400);assert.equal(r.steps.at(-1).time,'2001-01-04T00:00:00');checks+=2;
 for(const [key,field] of [['rectangular','rectangularResidual'],['discrete','discreteFluxResidual'],['timeStagger','timeStaggerContribution']]){
  const peak=r.steps.reduce((a,b)=>Math.abs(b[field])>Math.abs(a[field])?b:a);
  near(r[key].maxAbsMm,Math.abs(peak[field]));assert.equal(r[key].timeAtMax,peak.time);
  near(r[key].finalMm,r.steps.at(-1)[field]);
  assert.equal(r[key].stepsOverOriginalPointZeroFive,r.steps.filter(s=>Math.abs(s[field])>.05).length);checks+=4;
 }
 const common=r.steps.filter(s=>s.elapsedSeconds%1800===0);
 assert.equal(common.length,144);checks++;
 const failed=r.steps.filter(s=>Math.abs(s.discreteFluxResidual)>.05);
 cases.push({nominalDtSeconds:dt,nSteps:r.nSteps,initialSHA:r.initialSHA,
  rectangular:r.rectangular,discrete:r.discrete,
  commonThirtyMinuteMaxDiscreteMm:Math.max(...common.map(s=>Math.abs(s.discreteFluxResidual))),
  commonThirtyMinuteMaxRectangularMm:Math.max(...common.map(s=>Math.abs(s.rectangularResidual))),
  failureFirstTime:failed[0]?.time??null,failureLastTime:failed.at(-1)?.time??null,
  finalWaterMm:r.final.waterKgM2,finalWaterCorrectionMm:r.steps.at(-1).pressureWaterCorrectionMm,
  minTemperatureK:Math.min(...r.steps.map(s=>s.minTemperatureK)),
  maxTemperatureK:Math.max(...r.steps.map(s=>s.maxTemperatureK))});
}
assert.equal(new Set(cases.map(c=>c.initialSHA)).size,1);checks++;
const maxDiscreteReductionRatios=cases.slice(0,-1).map((c,i)=>c.discrete.maxAbsMm/cases[i+1].discrete.maxAbsMm);
maxDiscreteReductionRatios.forEach((x,i)=>near(x,summary.maxDiscreteReductionRatios[i]));checks+=2;
const bindings=[];
const rootAuditPath=`${dir}/audit-all-corrections.json`;
const rootAudit=(await load(rootAuditPath)).find(r=>r.mode==='seasonal');
const thirty=await load(`${dir}/timestep-convergence-1800s.json`);
assert.equal(rootAudit.initialSHA,thirty.initialSHA);
const maxRootAuditDifference=Math.max(...rootAudit.steps.map((r,i)=>Math.abs(r.discreteFluxResidual-thirty.steps[i].discreteFluxResidual)));
assert.equal(maxRootAuditDifference,0);checks+=2;
for(const p of [`${docs}/timestep-convergence.jl`,`${docs}/timestep-convergence-native.log`,`${docs}/timestep-convergence-native-status.json`,
 `${dir}/timestep-convergence-summary.json`,rootAuditPath,...[1800,900,450].map(dt=>`${dir}/timestep-convergence-${dt}s.json`)]){
 const bytes=await readFile(p);bindings.push({path:p,bytes:bytes.length,sha256:sha(bytes)});
}
const result={passed:true,checks,cases,maxDiscreteReductionRatios,
 rootAuditComparison:{path:rootAuditPath,maxDiscreteDifferenceMm:maxRootAuditDifference,initialSHAMatches:true},
 observedOrders:maxDiscreteReductionRatios.map(r=>Math.log2(r)),
 monotoneAllStepMaximum:cases.slice(0,-1).every((c,i)=>c.discrete.maxAbsMm>cases[i+1].discrete.maxAbsMm),
 monotoneCommonTimeMaximum:cases.slice(0,-1).every((c,i)=>c.commonThirtyMinuteMaxDiscreteMm>cases[i+1].commonThirtyMinuteMaxDiscreteMm),
 bindings};
await writeFile(`${docs}/timestep-convergence-verification.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
