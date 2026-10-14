import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-conservative-transport-20261013',out='build/earth-conservative-transport';
const hash=b=>createHash('sha256').update(b).digest('hex');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const coreSHA='3fb46467306d9deae796f771e3e87c60304380d870c8b449009981200069869d';
assert.equal(hash(await readFile(`${folder}/conservative-core.jl`)),coreSHA);
let archivedSourcesVerified=0,inputBindingsVerified=0;const archiveCache=new Set(),inputCache=new Map(),executions=[];
for(const file of (await readdir(out)).filter(p=>p.endsWith('-status.json')).sort()){
 const run=await json(`${out}/${file}`);
 assert(run.sourceUnchanged&&run.inputUnchanged,file);
 assert.deepEqual(run.sourceBefore,run.sourceAfter,file);assert.deepEqual(run.inputBefore,run.inputAfter,file);
 for(const [path,sha] of Object.entries(run.sourceBefore)){
  const archive=`${folder}/source-archives/${sha}/${basename(path)}`;
  if(!archiveCache.has(archive)){assert.equal(hash(await readFile(archive)),sha,archive);archiveCache.add(archive);}
  archivedSourcesVerified++;
 }
 for(const [path,sha] of Object.entries(run.inputBefore)){
  if(!inputCache.has(path))inputCache.set(path,hash(await readFile(path)));
  assert.equal(inputCache.get(path),sha,path);inputBindingsVerified++;
 }
 executions.push({name:run.name,code:run.code,sourceCount:Object.keys(run.sourceBefore).length,inputCount:Object.keys(run.inputBefore).length});
}
const required=['candidate-c1-core','candidate-c1-grid','candidate-c1-gradient-v2','candidate-c1-benchmark','candidate-c1-tilted','candidate-c1-mimetic','review-candidate-c1','candidate-c1-native-1800','candidate-c1-native-900','candidate-c1-native-450','candidate-c1-temporal-reference-v2'];
for(const name of required)assert.equal(executions.find(r=>r.name===name)?.code,0,name);
const native=[];
for(const dt of [1800,900,450]){
 const name=`candidate-c1-native-${dt}`,data=await json(`${out}/${name}.json`),status=await json(`${out}/${name}-status.json`);
 assert.equal(status.sourceBefore[`${folder}/conservative-core.jl`],coreSHA);
 assert.equal(Object.keys(status.inputBefore).filter(p=>p.endsWith('.nc')).length,6);
 assert.equal(data.days,3);assert.equal(data.nominalStepSeconds,dt);assert.equal(data.ncells,3168);assert.equal(data.nlayers,8);
 assert.equal(data.nativeImportUnchanged,true);assert.equal(data.physicsSources,false);assert.equal(data.climateAcceptance,false);assert.equal(data.fullPhysicalSphereAcceptance,false);
 assert.equal(data.operator,'variational');assert.equal(data.cases.length,dt===1800?3:1);
 for(const c of data.cases){
  assert.equal(c.accepted,259200/dt);assert.equal(c.rejections,0);assert.equal(c.minimumAcceptedDt,dt);
  assert(Math.abs(c.airDriftKgM2)<1e-8);assert(Math.abs(c.waterDriftMm)<1e-9);assert(Math.abs(c.dryDriftKgM2)<1e-8);
  assert(c.qminEveryStep>=0);assert(c.qmaxEveryStep<=c.initial.qmax+1e-12);assert(c.constantTracerMaxError<1e-12);
  assert.equal(c.restartBitwiseEqual,true);
  for(const key of ['localAirRelativeResidual','localWaterRelativeResidual','localDryRelativeResidual'])assert(c.maxResiduals[key]<5e-12,`${name}/${c.case}/${key}`);
  assert(c.maxResiduals.bottomResidual<1e-9);assert(c.maxResiduals.pressureResidual<1e-9);
  native.push({dt,case:c.case,airDriftKgM2:c.airDriftKgM2,waterDriftMm:c.waterDriftMm,dryDriftKgM2:c.dryDriftKgM2,accepted:c.accepted,rejections:c.rejections,restartBitwiseEqual:c.restartBitwiseEqual,constantTracerMaxError:c.constantTracerMaxError,localAirRelativeResidual:c.maxResiduals.localAirRelativeResidual,localWaterRelativeResidual:c.maxResiduals.localWaterRelativeResidual,localDryRelativeResidual:c.maxResiduals.localDryRelativeResidual});
 }
 if(dt===1800){const sharp=data.cases.find(v=>v.case==='sharp');assert(sharp.diagnosticSpectralProjection.projectedMinq<0);assert(sharp.diagnosticSpectralProjection.clipWaterAdditionMm>0);}
}
const analysis=await json(`${out}/candidate-c1-analysis.json`);
assert(analysis.initialImportIdentical&&analysis.pressurePathIndependentOfTracer);
// Preserve the original failed adjacent-step gate. A separate exact linear
// time oracle diagnoses it; that must never turn the original failure green.
assert.equal(executions.find(r=>r.name==='candidate-c1-analysis')?.code,1);
assert(analysis.pressureRefinementRatio<1&&analysis.humidityRefinementRatio>1);
const temporal=await json(`${out}/candidate-c1-temporal-reference-v2.json`);
assert(temporal.temporalErrorMonotone);assert.equal(temporal.adjacentStepDifferenceGatePassed,false);
assert(temporal.referenceMinimumPressurePa>0&&temporal.eigenResidual<1e-12&&temporal.orthogonalityResidual<1e-12);
for(const r of temporal.rows){assert(r.rmsDifferenceFromExactBackwardEulerPa<1e-6);assert(r.linearVelocityDifferenceFromExactBackwardEulerMps<1e-7);}
for(const [path,sha] of Object.entries(temporal.inputHashes))assert.equal(hash(await readFile(path)),sha,path);
const wave=await json(`${out}/candidate-c1-mimetic.json`),independent=await json(`${out}/scheme-variational-probe.json`);
for(let i=0;i<wave.rows.length;i++){
 if(i)assert(wave.rows[i].maxError<wave.rows[i-1].maxError);
 const expected=independent.cases.find(v=>v.nrings===wave.rows[i].rings).wave.maxRelativePressureError;
 assert(Math.abs(wave.rows[i].maxError-expected)<1e-8);
}
const preservation=await json(`${folder}/preservation-before-final.json`);assert(preservation.passed&&preservation.formalDefaultUnchanged);
const result={verifiedUTC:new Date().toISOString(),implementationAndConservationAcceptance:true,coreSHA,fullPhysicalSphereAcceptance:false,strongPointwisePolarAccuracy:false,nativeCoarsePressureTimeAccuracy:false,originalAdjacentStepDifferenceGate:false,pressureMomentumMatchesExactBackwardEuler:true,nativePrimitiveEquationCoupling:false,climateAcceptance:false,formalDefaultPromoted:false,native,archivedSourcesVerified,uniqueSourceArchives:archiveCache.size,inputBindingsVerified,uniqueInputs:inputCache.size,executions,pressureRefinementRatio:analysis.pressureRefinementRatio,humidityRefinementRatio:analysis.humidityRefinementRatio,pressureTemporalErrorsPa:temporal.rows.map(r=>r.rmsTemporalErrorPa),oldEvidenceBindingsVerified:preservation.bindingsVerified,nativeSourceFilesVerified:preservation.nativeSourceFilesVerified};
await writeFile(`${folder}/verification.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result));
