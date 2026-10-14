import {readFile,writeFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {verifySource} from './verify-source.mjs';
const folder='docs/evidence/earth-rotating-sigma-20261014',out='build/earth-rotating-sigma';
const hash=b=>createHash('sha256').update(b).digest('hex'),read=async p=>JSON.parse(await readFile(p,'utf8'));
try{await readFile(`${folder}/manifest.json`);throw new Error('C9 already sealed');}catch(e){if(e.code!=='ENOENT')throw e;}
async function walk(dir){const files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=`${dir}/${e.name}`;if(e.isDirectory())files.push(...await walk(p));else files.push(p);}return files;}
const previous={path:'docs/evidence/earth-pressure-work-20261014/manifest.json',sha256:'4f4a9d86f8c382c633f8ae7a50b2dfc2fcb9f1eff8b65675794d8a6a6dbcbf94'};
for(const [path,sha] of [[previous.path,previous.sha256],['docs/evidence/earth-compatible-momentum-20261014/manifest.json','c0d8e047bb577bb6b689a128639c8e4b9dcf6cf3fe6f4eee8ed74f589ceedfeb'],['docs/evidence/earth-covariant-momentum-20261014/manifest.json','fa83192f5dd1dd2627734a6eaff9a6a2d546181ae24ac5d07fe45d93f834633c'],['docs/evidence/earth-rotating-graph-20261014/manifest.json','bccc6cf74351355e7c3c799c4767684b2fa06a2de73b0a2d67ca057ed5e376e8'],['docs/evidence/earth-native-graph-wind-20261014/manifest.json','8c9869d799dc7b7da8bd955de8a9cacd1c843722de8926bb10ddc1bc94cd6536']]){
 assert.equal(hash(await readFile(path)),sha);const m=await read(path);
 assert.deepEqual((await walk(path.slice(0,-14))).sort(),[path,...m.bindings.map(b=>b.path)].sort());
 for(const b of m.bindings)assert.equal(hash(await readFile(b.path)),b.sha256,b.path);
}
const preservation=JSON.parse(execFileSync(process.execPath,['docs/evidence/earth-native-graph-wind-20261014/check-frozen.mjs'],{encoding:'utf8'}));
assert(preservation.passed&&preservation.formalDefaultUnchanged);
const selected=await read(`${folder}/selected-runs.json`),statuses=new Map(),runs=[];
for(const file of (await readdir(out)).filter(n=>n.endsWith('-status.json')).sort()){
 const s=await read(`${out}/${file}`);assert(['passed','failed'].includes(s.state)&&s.completedUTC,`unfinished ${s.name}`);
 assert(s.sourceUnchanged&&s.inputUnchanged,`changed sources/inputs: ${s.name}`);
 for(const [p,d] of Object.entries(s.sourceBefore))assert.equal(hash(await readFile(`${folder}/source-archives/${d}/${basename(p)}`)),d,p);
 for(const [p,d] of Object.entries(s.inputBefore))assert.equal(hash(await readFile(p)),d,p);
 for(const [p,d] of Object.entries(s.outputHashes))assert.equal(hash(await readFile(p)),d,p);
 statuses.set(s.name,s);runs.push({name:s.name,state:s.state,code:s.code});
}
let selectedAssertions=0;
for(const name of Object.values(selected).flat()){
 assert(statuses.has(name),`missing ${name}`);await verifySource(statuses.get(name));assert((await read(`${out}/${name}.json`)).passed);
 const log=await readFile(`${out}/${name}.log`,'utf8'),matches=[...log.matchAll(/^C9 .*\|\s+(\d+)\s+(\d+)\s+.+$/gm)];
 assert.equal(matches.length,1);assert.equal(matches[0][1],matches[0][2]);selectedAssertions+=Number(matches[0][1]);
}
const vector=await read(`${out}/${selected.vector}.json`);assert.equal(vector.rows.length,9);
for(const r of vector.rows){assert(Number.isFinite(r.error)&&r.error<1e-11);if(r.layers>1)assert(r.layerWork*r.verticalWork<0);}
const coupled=await read(`${out}/${selected.coupled}.json`);assert(coupled.referenceDiscrepancy<1e-10&&coupled.ratios.every(r=>r>3.5)&&coupled.bitwiseRestart&&coupled.rollback&&coupled.midpointEquation<3e-13);
assert(coupled.rest.length===12&&coupled.rest.every(r=>r.absolute<=r.allowance));
const rollback=await read(`${out}/${selected.rollback}.json`);assert(rollback.modes===6&&rollback.literalBitRollback&&rollback.genuineSolversInvoked);
const analytic=await read(`${out}/${selected.analytic}.json`);assert.equal(analytic.rows.length,36);
for(let i=0;i<12;i++){
 const [a,b,c]=[analytic.rows[i],analytic.rows[i+12],analytic.rows[i+24]];
 assert(a.forceRelative>b.forceRelative&&b.forceRelative>c.forceRelative&&c.forceRelative<.35);
}
assert(analytic.rows.every(r=>['forceRelative','polarForce','curlRelative','verticalRelative'].every(k=>Number.isFinite(r[k]))));
assert(analytic.covariance.length===2&&analytic.covariance.every(v=>v<2e-12));
assert.deepEqual(analytic.verticalRefinement.map(r=>r.layers),[4,8,16,32]);
for(let i=0;i<3;i++)assert(analytic.verticalRefinement[i].relative/analytic.verticalRefinement[i+1].relative>3.5);
assert(analytic.verticalRefinement[3].relative<.01);
const degree=await read(`${out}/${selected.gradient3}.json`);assert.equal(degree.rows.length,12);
for(let i=0;i<4;i++)assert(degree.rows[i].c9Force>degree.rows[i+4].c9Force&&degree.rows[i+4].c9Force>degree.rows[i+8].c9Force&&degree.rows[i+8].c9Force<.35);
assert(degree.rows.every(r=>['c8Force','c9Force','c8Polar','c9Polar','addedCurlForce'].every(k=>Number.isFinite(r[k]))));
for(const [i,name] of selected.native.entries()){
 const r=await read(`${out}/${name}.json`);assert.equal(r.dt,[1800,900,450,225][i]);assert.equal(r.duration,21600);assert.equal(r.c2,82671.64740772452);
 assert.deepEqual(r.omega,[0,0,7.292115e-5]);assert(r.importRoundtrip<3e-16&&r.sameDynamicsAcrossTracers&&r.coriolis&&r.vorticalMomentumTransport&&r.verticalHorizontalMomentumAdvection&&!r.prognosticVerticalVelocity&&!r.fullThermodynamics&&!r.climateAcceptance);
 assert.deepEqual(r.results.map(c=>c.case),i===0?['real','constant','sharp']:['real']);
 assert(Object.values(r.initialComponentRMS).every(v=>Number.isFinite(v)&&v>0));
 for(const c of r.results){
  assert(c.steps===21600/r.dt&&c.rejections===0&&c.dt===r.dt);
  assert(c.maxLocalRelative<5e-12&&c.maxEquationRelative<5e-12&&c.maxPressureResidual<=2e-14&&c.maxNeutralEnergyRelative<1e-10);
  assert(c.accumulatedEnergyDrift<1e-9&&c.pmin>0&&c.finalPressureRMSChangePa>1e-6&&c.layerShearChangeRelative>1e-6);
  assert(Math.abs(c.airDriftKgM2)<1e-8&&Math.abs(c.waterDriftMm)<1e-9&&Math.abs(c.dryDriftKgM2)<1e-8);
  assert(c.qmin>=c.initialQmin-1e-11&&c.qmax<=c.initialQmax+1e-11&&c.constantError<1e-12);
  if(i===0)assert(c.restartBitwiseEqual&&c.resumedSteps===4);
  const tracePath=`${out}/${name}-${c.case}-trace.json`,trace=await read(tracePath);
  assert.equal(statuses.get(name).outputHashes[tracePath],hash(await readFile(tracePath)));assert.equal(trace.length,c.steps);
  for(const [k,t] of trace.entries()){
   assert(t.step===k+1&&t.time===(k+1)*r.dt&&t.dt===r.dt);
   for(const key of ['firstIterations','lastIterations','pressureIterations','pressureBacktracks'])assert(Number.isInteger(t[key])&&t[key]>=0);
   assert(t.firstIterations<=400&&t.lastIterations<=400&&t.pressureIterations<=30&&t.pressureResidual>=0&&t.pressureResidual<=2e-14);
   for(const key of ['firstEquation','lastEquation','pressureEquation','localAirRelativeResidual','localWaterRelativeResidual','localDryRelativeResidual'])assert(t[key]>=0&&t[key]<5e-12);
   assert(t.firstEnergy>=0&&t.firstEnergy<1e-10&&t.lastEnergy>=0&&t.lastEnergy<1e-10&&Number.isFinite(t.completeEnergyAllowance)&&t.completeEnergyAbsolute>=0&&t.completeEnergyAbsolute<=t.completeEnergyAllowance);
  }
  assert.equal(Math.max(...trace.flatMap(t=>[t.firstIterations,t.lastIterations])),c.maxNeutralIterations);
  assert.equal(trace.reduce((s,t)=>s+t.firstIterations+t.lastIterations,0),c.totalNeutralIterations);
  assert.equal(Math.max(...trace.map(t=>t.pressureIterations)),c.maxPressureIterations);
  assert.equal(trace.reduce((s,t)=>s+t.pressureIterations,0),c.totalPressureIterations);
  assert.equal(trace.reduce((s,t)=>s+t.pressureBacktracks,0),c.pressureBacktracks);
 }
}
const temporal=await read(`${out}/${selected.temporal}.json`);assert.deepEqual(temporal.names,selected.native);assert.equal(temporal.formalOrder,2);
for(const name of selected.native)for(const suffix of ['.json','-real-final.bin']){
 const p=`${out}/${name}${suffix}`;assert.equal(statuses.get(selected.temporal).inputBefore[p],hash(await readFile(p)),p);
}
for(const key of ['pressurePa','velocityMps','humidityKgKg'])for(const set of ['adjacent','reference']){
 const [a,b,c]=temporal[set].map(r=>r[key]);assert(a>b&&b>c&&c>0);
}
const source=await read(`${out}/c9-source-v1.json`);assert(source.passed&&source.checks===7);
for(const [p,d] of Object.entries(source.sourceHashes))assert.equal(hash(await readFile(p)),d,p);
const project=await read(`${out}/project-checks.json`);assert(project.passed&&project.tests===278&&project.rows.every(r=>r.code===0));
for(const r of project.rows)assert.equal(hash(await readFile(r.log)),r.sha256,r.log);
const plot=await read(`${out}/plot-provenance.json`);assert(plot.passed);
for(const [p,d] of Object.entries({...plot.sourceHashes,...plot.inputHashes}))assert.equal(hash(await readFile(p)),d,p);
assert.equal(hash(await readFile(`${out}/convergence.png`)),plot.outputSHA256);
const review=await read(`${folder}/review-source-bindings.json`);assert(review.completed&&review.actionableFindings===0);
for(const key of ['sourceHashes','inputHashes','outputHashes','reviewArtifactHashes'])for(const [p,d] of Object.entries(review[key]??{}))assert.equal(hash(await readFile(p)),d,p);
for(const name of ['report.md','code-review.md','README.md','CURRENT-STATE.md'])assert((await readFile(`${folder}/${name}`,'utf8')).length>100);
await mkdir(`${folder}/raw`,{recursive:true});
for(const e of await readdir(out,{withFileTypes:true}))if(e.isFile())await copyFile(`${out}/${e.name}`,`${folder}/raw/${e.name}`,1);
const acceptance={actualPressureKineticMetric:true,energyNeutralAbsoluteVorticity:true,pairedLayerGradientVerticalWork:true,fullEdgeState:true,symmetricSecondOrderPressureVelocityODE:true,
 sharedAirWaterTransfers:true,lateFailureAtomicRollback:true,nativeSixHourTemporalRefinement:true,completeOriginalIterationRecords:true,literalBitRebuiltRestart:true,independentCodeReviewCompleted:true,
 sampledFullForceRefinement:true,uniformLayerVerticalRefinement:true,unequalLayerEnergyAlgebra:true,cartesianCovariance:true,degree3PairedPolarAudit:true,exactCurlGrad:false,prognosticVerticalVelocity:false,fullThermodynamics:false,exactPVAngularMomentum:false,longClimateValidation:false,formalDefaultPromoted:false};
await writeFile(`${folder}/verification.json`,JSON.stringify({passed:true,createdUTC:new Date().toISOString(),previous,preservation,selected,selectedAssertions,runs,project,acceptance},null,2)+'\n',{flag:'wx'});
const bindings=[];for(const path of (await walk(folder)).sort()){assert(!path.endsWith('/manifest.json'));const bytes=await readFile(path);bindings.push({path,bytes:bytes.length,sha256:hash(bytes)});}
const content=JSON.stringify({candidate:'c9-rotating-barotropic-sigma',createdUTC:new Date().toISOString(),previous,acceptance,bindings},null,2)+'\n';
await writeFile(`${folder}/manifest.json`,content,{flag:'wx'});console.log(JSON.stringify({sealed:true,sha256:hash(content),files:bindings.length+1,selectedAssertions,acceptance}));
