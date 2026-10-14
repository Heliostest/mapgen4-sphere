import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const docs='docs/evidence/earth-speedy-transport-20261013',build='build/earth-speedy-transport';
const read=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
let checks=0;const check=(condition,message)=>{assert.ok(condition,message);checks++;};
const near=(a,b,message)=>check(Math.abs(a-b)<2e-11,message);
const results=[];
for(const name of ['thermal','all']){
 const path=`${build}/implicit-split-${name}-window.json`,d=read(path);
 const baseline=read(`${build}/implicit-instability-${name}-v2.json`);
 const status=read(`${docs}/implicit-split-${name}-window-native-status.json`);
 check(status.code===0&&status.sourceUnchanged&&status.inputsUnchanged,'Successful unchanged window');
 check(sha(d.input)===d.inputSHA,'Preserved actual checkpoint');
 check(d.failure===null&&d.nSteps===96&&d.rows.length===96,'All 96 steps completed');
 check(d.actualEnd===d.expectedEnd&&d.actualEnd===baseline.failure.record.time,'Matched former failure instant');
 check(Object.values(d.rawFullFieldTendencyErrors).every(x=>x===0),'Complete current dynamics RHS unchanged');
 let physicalIntegral=0,previous=Date.parse(d.start);
 for(const r of d.rows){
  check(Date.parse(r.time)-previous===1800000,'Native half-hour clock');previous=Date.parse(r.time);
  check(Number.isFinite(r.minTemperatureK)&&r.minTemperatureK>0,'Positive finite temperature');
  near(r.minTemperatureK,Math.min(...r.minByLayer),'Complete layer minima');
  near(r.maxTemperatureK,Math.max(...r.maxByLayer),'Complete layer maxima');
  check(r.nominalVerticalCourantBeforeStep<1,'Nominal Courant below 1');
  near(r.maxPressureAuxiliary,d.initial.maxPressureAuxiliary,'Auxiliary pressure retained');
  check(r.minHumidity>=0&&Number.isFinite(r.maxHumidity),'Native humidity diagnosis finite');
  physicalIntegral+=1800*r.netPhysicalWaterRateKgM2S;
  near(r.diagnosedRectangularResidualMm,r.waterMm-d.initial.waterMm-physicalIntegral-r.pressureWaterCorrectionMm,'Diagnosed rectangular water ledger');
  near(r.spectralCarrierRectangularResidualMm,r.spectralWaterMm-d.initial.spectralWaterMm-physicalIntegral-r.pressureWaterCorrectionMm,'Separate raw spectral rectangular ledger');
  near(r.spectralCarrierDiscreteResidualMm+r.fluxTimeStaggerMm,r.spectralCarrierRectangularResidualMm,'Stagger identity, identical raw inventory');
 }
 near(d.windowMinTemperatureK,Math.min(...d.rows.map(r=>r.minTemperatureK)),'Summary minimum');
 near(d.maxNominalVerticalCourant,Math.max(...d.rows.map(r=>r.nominalVerticalCourantBeforeStep)),'Summary Courant');
 near(d.maxAbsDiagnosedRectangularResidualMm,Math.max(...d.rows.map(r=>Math.abs(r.diagnosedRectangularResidualMm))),'Summary diagnosed residual');
 results.push({name,sourceSHA:status.sourceAfter[`${docs}/implicit-split-reference.jl`],
  minK:d.windowMinTemperatureK,maxK:d.windowMaxTemperatureK,maxNominalC:d.maxNominalVerticalCourant,
  maxDiagnosedRectangularMm:d.maxAbsDiagnosedRectangularResidualMm,
  maxRawSpectralDiscreteMm:d.maxAbsSpectralCarrierDiscreteResidualMm});
}
const startup=read(`${build}/implicit-split-v2-startup-probe.json`);
check(startup.rows.length===3,'Three native startup spans');
for(const r of startup.rows)check(r.maxDifferenceK===0,'V2 capture rule preserved on identical trajectory');
const result={passed:true,checks,results,note:'Raw spectral p*q ledger and clipped grid water are separate inventories. No claim of nonlinear wet-mass conservation or long-term stability.'};
writeFileSync(`${docs}/implicit-split-verification.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
