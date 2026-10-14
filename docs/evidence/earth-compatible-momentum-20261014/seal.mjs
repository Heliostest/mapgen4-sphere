import {readFile,writeFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {verifySource} from './verify-source.mjs';
const folder='docs/evidence/earth-compatible-momentum-20261014',out='build/earth-compatible-momentum';
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
try{await readFile(`${folder}/manifest.json`);throw new Error('C7 already sealed');}catch(e){if(e.code!=='ENOENT')throw e;}
async function walk(dir){const files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=`${dir}/${e.name}`;if(e.isDirectory())files.push(...await walk(p));else files.push(p);}return files;}
const previous={path:'docs/evidence/earth-covariant-momentum-20261014/manifest.json',sha256:'fa83192f5dd1dd2627734a6eaff9a6a2d546181ae24ac5d07fe45d93f834633c'};
for(const [path,sha] of [[previous.path,previous.sha256],['docs/evidence/earth-rotating-graph-20261014/manifest.json','bccc6cf74351355e7c3c799c4767684b2fa06a2de73b0a2d67ca057ed5e376e8'],['docs/evidence/earth-native-graph-wind-20261014/manifest.json','8c9869d799dc7b7da8bd955de8a9cacd1c843722de8926bb10ddc1bc94cd6536']]){
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
const transport=await read(`${out}/${selected.transport}.json`);
assert(transport.denseRelative<5e-12&&transport.kernelRelative<5e-12&&transport.energyRelative<5e-12);
const coupled=await read(`${out}/${selected.coupled}.json`);
assert(coupled.bitwiseRestart&&coupled.zeroMatchesC5&&coupled.rollback&&coupled.ratios.every(r=>r>1.7)&&coupled.maxEnergyBalance<5e-12&&coupled.referenceDifference<1e-10);
const rest=await read(`${out}/${selected.nearRest}.json`);assert(rest.rows.length===15&&rest.rows.every(r=>r.passed));
const analytic=await read(`${out}/${selected.analytic}.json`);assert.equal(analytic.rows.length,36);
for(let i=0;i<12;i++){
 const [a,b,c]=[analytic.rows[i],analytic.rows[i+12],analytic.rows[i+24]];
 assert(a.relativeRMS>b.relativeRMS&&b.relativeRMS>c.relativeRMS&&c.relativeRMS<.35);
 assert(a.polarRMS>b.polarRMS&&b.polarRMS>c.polarRMS);
}
const covariance=await read(`${out}/${selected.covariance}.json`);assert(covariance.covarianceRelative<5e-12&&covariance.orientationRelative<5e-12);
for(const [i,name] of selected.native.entries()){
 const r=await read(`${out}/${name}.json`);assert.equal(r.dt,[1800,900,450,225][i]);assert.equal(r.duration,21600);assert.equal(r.strength,1);
 assert.equal(r.c2,82671.64740772452);assert.deepEqual(r.omega,[0,0,7.292115e-5]);
 assert.deepEqual(r.results.map(c=>c.case),i===0?['real','constant','sharp']:['real']);
 assert(r.sameDynamicsAcrossTracers&&!r.fullPhysicalMomentum&&!r.fullThermodynamics&&!r.climateAcceptance);
 for(const c of r.results){
  assert(c.steps===21600/r.dt&&c.rejections===0&&c.dt===r.dt);
  assert(c.maxLocalRelative<5e-12&&c.maxTransportEquation<5e-12&&c.maxTransportEnergy<5e-12);
  assert(c.accumulatedEnergyBalance<1e-9&&c.maxEnergyIncrease<1e-11&&c.energyLossFraction>0);
  assert(c.positivityChecks>=c.steps&&c.minimumCertifiedRatio>0&&c.pmin>0);
  assert(Math.abs(c.airDriftKgM2)<1e-8&&Math.abs(c.waterDriftMm)<1e-9&&Math.abs(c.dryDriftKgM2)<1e-8);
  assert(c.qmin>=c.initialQmin-1e-11&&c.qmax<=c.initialQmax+1e-11&&c.constantError<1e-12);
  if(i===0)assert(c.restartBitwiseEqual&&c.resumedSteps===4);
 }
 if(i===0)assert(r.baselineEffect.pressureRMSPa>1e-6&&r.baselineEffect.relativeEdgeMomentum>1e-8);
}
const temporal=await read(`${out}/${selected.temporal}.json`);assert.deepEqual(temporal.names,selected.native);assert.equal(temporal.formalOrder,1);
for(const name of selected.native)for(const suffix of ['.json','-real-final.bin']){
 const p=`${out}/${name}${suffix}`;assert.equal(statuses.get(selected.temporal).inputBefore[p],hash(await readFile(p)),p);
}
for(const key of ['pressurePa','momentumMps','humidityKgKg'])for(const set of ['adjacent','reference']){
 const [a,b,c]=temporal[set].map(r=>r[key]);assert(a>b&&b>c&&c>0);
}
const source=await read(`${out}/c7-source-v1.json`);assert(source.passed&&source.checks===7);
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
const acceptance={incrementalAdjointCoupling:true,transportSubstepPreservesUnresolvedEdgeComponent:true,referenceEnergyIdentity:true,sharedAirWaterMomentumTransfers:true,firstOrderSplitNonlinearCoupling:true,
 sampledSpatialRefinement:true,independentFullNonlinearTimeComparison:true,nativeSixHourTemporalRefinement:true,zeroMatchesFrozenC5:true,nearRestRegression:true,
 literalBitRebuiltRestart:true,independentCodeReviewCompleted:true,fullPhysicalMomentum:false,exactAngularMomentumOrPV:false,fullThermodynamics:false,longClimateValidation:false,formalDefaultPromoted:false};
await writeFile(`${folder}/verification.json`,JSON.stringify({passed:true,createdUTC:new Date().toISOString(),previous,preservation,selected,runs,project,acceptance},null,2)+'\n',{flag:'wx'});
const bindings=[];for(const path of (await walk(folder)).sort()){assert(!path.endsWith('/manifest.json'));const b=await readFile(path);bindings.push({path,bytes:b.length,sha256:hash(b)});}
const content=JSON.stringify({candidate:'c7-compatible-momentum',createdUTC:new Date().toISOString(),previous,acceptance,bindings},null,2)+'\n';
await writeFile(`${folder}/manifest.json`,content,{flag:'wx'});
console.log(JSON.stringify({sealed:true,sha256:hash(content),files:bindings.length+1,acceptance}));
