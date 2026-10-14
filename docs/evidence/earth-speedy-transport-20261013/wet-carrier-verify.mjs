import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const docs='docs/evidence/earth-speedy-transport-20261013',build='build/earth-speedy-transport';
const read=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
let checks=0;const check=(x,n)=>{assert.ok(x,n);checks++;};
const near=(a,b,t,n)=>check(Math.abs(a-b)<t,n);
const raw=read(`${build}/wet-carrier-native-red.json`),clean=read(`${build}/wet-carrier-projected-native-red.json`);
const d=read(`${build}/wet-carrier-prototype-test.json`),memory=read(`${build}/wet-carrier-fields-verification.json`);
for(const [name,code]of [['native-red',1],['projected-native-red',1],['prototype-green',1],['prototype-green-v2',0],['fields-verify',0]]){
 const s=read(`${docs}/wet-carrier-${name}-native-status.json`);
 check(s.code===code&&s.sourceUnchanged&&s.inputsUnchanged,`${name} actual exit and preserved inputs`);
}
for(const native of [raw,clean]){
 check(native.rows.length===3,'three native updates');
 for(const r of native.rows){
  check(r.clipWaterMm===0&&r.rawMinQ>0,'native failure excludes clip');
  near(r.rawWaterResidualMm,r.rawWaterMm-native.initial.rawWaterMm,1e-13,'water inventory residual');
  near(r.airResidualKgM2,r.airKgM2-native.initial.airKgM2,1e-12,'air inventory residual');
  check(r.rawWaterResidualMm>1e-10&&r.airResidualKgM2>1e-9,'native RED remains failed');
 }
}
check(d.initialSHA===clean.initialSHA,'same projected initial state');
check(clean.projection.deferredHistoryFields.length===0,'verified import history');
check(!clean.projection.massConstraintApplied&&!clean.projection.clockLandOceanReset,'import-only state change');
check(clean.projection.rows.every(r=>r.validCoefficientsBitwiseUnchanged),'projection preserves valid coefficients');
check(d.conservedMechanism&&!d.compatibleWithNativePressure&&!d.positiveForSharpTracer&&!d.projectionConservesWater,'mechanism GREEN, coupling gates RED');
for(const [index,r]of d.rows.entries()){
 check(r.span===[900,1800,3600][index]&&r.counter===index,'native startup spans');
 check(r.scalarAuxiliaryExactlyZero,'legal scalar native state');
 check(r.nativeRawAir===clean.rows[index].airKgM2,'same native inverse inventory');
 near(r.native.waterKgM2,clean.rows[index].gridWaterMm,1e-12,'same native water');
 check(r.ownConstantQError<1e-14,'constant tracer with own air');
 check(r.usingNativePressureConstantQError>1e-12,'native-pressure bridge rejected');
 for(const name of ['real','uniform','sharp']){
  const s=r.stock[name],t=r.tendencies[name];
  near(s.airKgM2,d.initial[name].airKgM2,1e-9,'carrier air closed');
  near(s.waterMm,d.initial[name].waterMm,1e-10,'carrier water closed');
  check(Math.abs(t.airRateGlobalKgM2S)<1e-13&&Math.abs(t.waterRateGlobalKgM2S)<1e-13,'zero global flux rate');
  check(t.maxBottomClosurePaS<1e-12&&t.maxLayerContinuityError<1e-12,'layer continuity and boundary roundoff');
 }
 check(r.stock.real.minq>0&&r.stock.sharp.minq<0,'real positive, controlled sharp tracer fails');
 check(r.stock.sharp.negativeWaterMm>0,'negative carrier inventory reported');
 const p=r.scalarTruncatedProjection;
 check(p.truncate&&p.projectedMinq>0&&p.clipWaterAdditionMm===0,'legal copy-only positive real projection');
 check(Math.abs(p.waterProjectionErrorMm)>1e-10,'strict projection gate remains failed');
 near(r.staged.implicitPressureWaterEffectMm,r.staged.implicit.waterMm-r.staged.explicit.waterMm,1e-13,'implicit stage ledger');
 near(r.staged.horizontalDiffusionWaterEffectMm,r.staged.diffusion.waterMm-r.staged.implicit.waterMm,1e-13,'HD/truncation stage ledger');
 near(r.staged.diffusion.waterMm,r.native.waterKgM2,1e-12,'candidate agrees with completed native update');
}
check(memory.inputSHA===sha(memory.input),'saved two-memory fields hash');
check(memory.rows.length===6,'all three states and both memories');
for(const r of memory.rows){
 near(r.airKgM2,d.initial[r.name].airKgM2,1e-9,'independent air sum');
 near(r.waterMm,d.initial[r.name].waterMm,1e-10,'independent water sum');
 check(r.minM>0,'both mass memories positive');
 check(r.name==='sharp'?r.minq<0:r.minq>0,'both tracer memories explicitly classified');
}
const child=spawnSync(process.execPath,[`${docs}/wet-carrier-interface-red.mjs`],{encoding:'utf8',windowsHide:true});
writeFileSync(`${build}/wet-carrier-interface-red-final.log`,child.stdout+child.stderr);
writeFileSync(`${build}/wet-carrier-interface-red-status.json`,JSON.stringify({code:child.status,signal:child.signal,expectedCode:1},null,2)+'\n');
check(child.status===1,'actual interface acceptance process RED exit');
const gates=read(`${build}/wet-carrier-interface-red.json`);
check(gates.failed===9&&gates.passed===0&&gates.tests.every(t=>!t.passed),'nine retained coupling failures');
check(gates.inputSHA256===sha(gates.input),'coupling gate result binding');
const result={passed:true,checks,mechanismOnly:true,coupledFixAccepted:false,
 nativeProjectedWaterDriftMm:clean.rows.map(r=>r.rawWaterResidualMm),
 constantTracerNativePressureErrors:d.rows.map(r=>r.usingNativePressureConstantQError),
 maxCarrierNativePressureDifferencePa:Math.max(...d.rows.map(r=>r.maxCarrierNativePressureDifferencePa)),
 rejectedGates:gates.failed,verifiedBothRawMemories:true,
 note:'Successful verification of both mechanism conservation and explicit incompatibility; not a successful coupled moisture correction.'};
writeFileSync(`${docs}/wet-carrier-verification.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
