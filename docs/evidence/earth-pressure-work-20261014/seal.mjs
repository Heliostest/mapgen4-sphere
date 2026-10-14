import {readFile,writeFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {verifySource} from './verify-source.mjs';
const folder='docs/evidence/earth-pressure-work-20261014',out='build/earth-pressure-work';
const hash=b=>createHash('sha256').update(b).digest('hex'),read=async p=>JSON.parse(await readFile(p,'utf8'));
try{await readFile(`${folder}/manifest.json`);throw new Error('C8 already sealed');}catch(e){if(e.code!=='ENOENT')throw e;}
async function walk(dir){const files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=`${dir}/${e.name}`;if(e.isDirectory())files.push(...await walk(p));else files.push(p);}return files;}
const previous={path:'docs/evidence/earth-compatible-momentum-20261014/manifest.json',sha256:'c0d8e047bb577bb6b689a128639c8e4b9dcf6cf3fe6f4eee8ed74f589ceedfeb'};
for(const [path,sha] of [[previous.path,previous.sha256],['docs/evidence/earth-covariant-momentum-20261014/manifest.json','fa83192f5dd1dd2627734a6eaff9a6a2d546181ae24ac5d07fe45d93f834633c'],['docs/evidence/earth-rotating-graph-20261014/manifest.json','bccc6cf74351355e7c3c799c4767684b2fa06a2de73b0a2d67ca057ed5e376e8'],['docs/evidence/earth-native-graph-wind-20261014/manifest.json','8c9869d799dc7b7da8bd955de8a9cacd1c843722de8926bb10ddc1bc94cd6536']]){
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
for(const name of Object.values(selected).flat()){
 assert(statuses.has(name),`missing ${name}`);await verifySource(statuses.get(name));assert((await read(`${out}/${name}.json`)).passed);
}
const e=await read(`${out}/${selected.energy}.json`);assert.equal(e.scalar.length,18);assert(e.chainResiduals.every(v=>v<5e-14));
const x=await read(`${out}/${selected.extremes}.json`);assert.equal(x.rows.length,5);assert(Number.isFinite(x.tinyPressureEnergy)&&x.tinyPressureEnergy>0);
assert(x.rows.every(r=>Number.isFinite(r.value)&&Number.isFinite(r.derivative)));
const b=await read(`${out}/${selected.boundary}.json`);assert.equal(b.rows.length,16);assert(b.rows.every(r=>r.valueError<2e-14&&r.derivativeRelative<2e-12));
const water=await read(`${out}/${selected.water}.json`);assert(water.modes===3&&water.literalBitRollback);
const step=await read(`${out}/${selected.step}.json`);assert(step.bitwiseRestart&&step.rollback&&step.jacobianError<2e-9&&step.referenceDifference<1e-10&&step.ratios.every(r=>r>3.5));
assert(step.rest.length===12&&step.rest.every(r=>r.absolute<=r.allowance));
const analytic=await read(`${out}/${selected.analytic}.json`);assert.equal(analytic.rows.length,36);
for(let i=0;i<12;i++){
 const [a,b,c]=[analytic.rows[i],analytic.rows[i+12],analytic.rows[i+24]];
 for(const key of ['pressureRelative','potentialRelative'])assert(a[key]>b[key]&&b[key]>c[key]&&c[key]<.35);
}
assert(analytic.rows.every(r=>Number.isFinite(r.forceRelative)&&Number.isFinite(r.polarForce)));
for(const [i,name] of selected.native.entries()){
 const r=await read(`${out}/${name}.json`);assert.equal(r.dt,[1800,900,450,225][i]);assert.equal(r.duration,21600);assert.equal(r.c2,82671.64740772452);
 assert(r.importRoundtrip<3e-16&&r.sameDynamicsAcrossTracers&&!r.coriolis&&!r.vorticalMomentumTransport&&!r.fullThermodynamics&&!r.climateAcceptance);
 assert.deepEqual(r.results.map(c=>c.case),i===0?['real','constant','sharp']:['real']);
 for(const c of r.results){
  assert(c.steps===21600/r.dt&&c.rejections===0&&c.dt===r.dt);
  assert(c.maxLocalRelative<5e-12&&c.maxEquationRelative<5e-12&&c.maxNonlinearResidual<=2e-14);
  assert(c.accumulatedEnergyDrift<1e-9&&c.maxEnergyExchangeFraction>1e-6&&c.pmin>0&&c.finalPressureRMSChangePa>1e-6);
  assert(Math.abs(c.airDriftKgM2)<1e-8&&Math.abs(c.waterDriftMm)<1e-9&&Math.abs(c.dryDriftKgM2)<1e-8);
  assert(c.qmin>=c.initialQmin-1e-11&&c.qmax<=c.initialQmax+1e-11&&c.constantError<1e-12);
  if(i===0)assert(c.restartBitwiseEqual&&c.resumedSteps===4);
 }
}
const temporal=await read(`${out}/${selected.temporal}.json`);assert.deepEqual(temporal.names,selected.native);assert.equal(temporal.formalOrder,2);
assert.equal(selected.iterations.length,selected.native.length);
for(const [i,name] of selected.iterations.entries()){
 const trace=await read(`${out}/${name}.json`),native=await read(`${out}/${selected.native[i]}.json`);
 assert(trace.nativeName===selected.native[i]&&trace.dt===native.dt&&trace.duration===21600&&trace.steps===21600/native.dt);
 assert(trace.literalBitFinalPressureVelocity&&trace.aggregatesExactlyMatch&&trace.trace.length===trace.steps);
 assert.deepEqual(trace.matchedCases,native.results.map(r=>r.case));
 assert.deepEqual(statuses.get(name).extra,[selected.native[i]]);
 for(const [k,r] of trace.trace.entries()){
  assert(r.step===k+1&&r.time===(k+1)*native.dt&&Number.isInteger(r.iterations)&&r.iterations>=0&&r.iterations<=30);
  assert(r.backtracks===0&&r.residual>=0&&r.residual<=2e-14&&r.equationP>=0&&r.equationP<5e-12&&r.equationV>=0&&r.equationV<5e-12);
  assert(Number.isFinite(r.energyAbsolute)&&Number.isFinite(r.energyAllowance)&&r.energyAbsolute>=0&&r.energyAbsolute<=r.energyAllowance);
 }
 for(const row of native.results){
  assert.equal(trace.trace.reduce((s,r)=>s+r.iterations,0),row.totalIterations);
  assert.equal(Math.max(...trace.trace.map(r=>r.iterations)),row.maxIterations);
  assert.equal(trace.trace.reduce((s,r)=>s+r.backtracks,0),row.backtracks);
  assert.equal(Math.max(...trace.trace.map(r=>r.residual)),row.maxNonlinearResidual);
  assert.equal(Math.max(...trace.trace.map(r=>Math.max(r.equationP,r.equationV))),row.maxEquationRelative);
 }
 for(const suffix of ['.json',...native.results.map(r=>`-${r.case}-final.bin`)]){
  const p=`${out}/${selected.native[i]}${suffix}`;assert.equal(statuses.get(name).inputBefore[p],hash(await readFile(p)),p);
 }
}
for(const name of selected.native)for(const suffix of ['.json','-real-final.bin']){
 const p=`${out}/${name}${suffix}`;assert.equal(statuses.get(selected.temporal).inputBefore[p],hash(await readFile(p)),p);
}
for(const key of ['pressurePa','velocityMps','humidityKgKg'])for(const set of ['adjacent','reference']){
 const [a,b,c]=temporal[set].map(r=>r[key]);assert(a>b&&b>c&&c>0);
}
const source=await read(`${out}/c8-source-v1.json`);assert(source.passed&&source.checks===7);
for(const [p,d] of Object.entries(source.sourceHashes))assert.equal(hash(await readFile(p)),d,p);
const project=await read(`${out}/project-checks.json`);assert(project.passed&&project.tests===278&&project.rows.every(r=>r.code===0));
for(const r of project.rows)assert.equal(hash(await readFile(r.log)),r.sha256,r.log);
const plot=await read(`${out}/plot-provenance.json`);assert(plot.passed);
for(const [p,d] of Object.entries({...plot.sourceHashes,...plot.inputHashes}))assert.equal(hash(await readFile(p)),d,p);
assert.equal(hash(await readFile(`${out}/convergence.png`)),plot.outputSHA256);
const review=await read(`${folder}/review-source-bindings.json`);assert(review.completed&&review.actionableFindings===0);
for(const [p,d] of Object.entries(review.sourceHashes))assert.equal(hash(await readFile(p)),d,p);
for(const name of ['report.md','code-review.md','README.md','CURRENT-STATE.md'])assert((await readFile(`${folder}/${name}`,'utf8')).length>100);
await mkdir(`${folder}/raw`,{recursive:true});
for(const e of await readdir(out,{withFileTypes:true}))if(e.isFile())await copyFile(`${out}/${e.name}`,`${folder}/raw/${e.name}`,1);
const acceptance={pressureDependentKineticMetric:true,barotropicDiscreteEnergyChainRule:true,fullEdgeImportWithoutProjection:true,symmetricSecondOrderPressureVelocityODE:true,sharedAirWaterTransfers:true,
 positivePressureExtremesRegression:true,branchBoundaryAccuracyRegression:true,lateBudgetAtomicRollback:true,nativeSixHourTemporalRefinement:true,completeNonlinearIterationReplay:true,literalBitRebuiltRestart:true,independentCodeReviewCompleted:true,
 scalarAndWeakSpatialRefinement:true,forceRefinementObserved:analytic.forceRefinementObserved,coriolisIncluded:false,vorticalMomentumTransport:false,verticalMomentumAdvection:false,fullThermodynamics:false,longClimateValidation:false,formalDefaultPromoted:false};
await writeFile(`${folder}/verification.json`,JSON.stringify({passed:true,createdUTC:new Date().toISOString(),previous,preservation,selected,runs,project,acceptance},null,2)+'\n',{flag:'wx'});
const bindings=[];for(const path of (await walk(folder)).sort()){assert(!path.endsWith('/manifest.json'));const bytes=await readFile(path);bindings.push({path,bytes:bytes.length,sha256:hash(bytes)});}
const content=JSON.stringify({candidate:'c8-barotropic-pressure-work',createdUTC:new Date().toISOString(),previous,acceptance,bindings},null,2)+'\n';
await writeFile(`${folder}/manifest.json`,content,{flag:'wx'});console.log(JSON.stringify({sealed:true,sha256:hash(content),files:bindings.length+1,acceptance}));
