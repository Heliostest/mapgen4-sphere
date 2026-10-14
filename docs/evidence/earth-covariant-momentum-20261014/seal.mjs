import {readFile,writeFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {verifySource} from './verify-source.mjs';
const folder='docs/evidence/earth-covariant-momentum-20261014',out='build/earth-covariant-momentum';
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
try{await readFile(`${folder}/manifest.json`);throw new Error('C6 already sealed');}catch(e){if(e.code!=='ENOENT')throw e;}
const selected=await read(`${folder}/selected-runs.json`);
const previous={path:'docs/evidence/earth-rotating-graph-20261014/manifest.json',sha256:'bccc6cf74351355e7c3c799c4767684b2fa06a2de73b0a2d67ca057ed5e376e8'};
assert.equal(hash(await readFile(previous.path)),previous.sha256);
for(const b of (await read(previous.path)).bindings)assert.equal(hash(await readFile(b.path)),b.sha256,b.path);
const c4='docs/evidence/earth-native-graph-wind-20261014/manifest.json';
assert.equal(hash(await readFile(c4)),'8c9869d799dc7b7da8bd955de8a9cacd1c843722de8926bb10ddc1bc94cd6536');
for(const b of (await read(c4)).bindings)assert.equal(hash(await readFile(b.path)),b.sha256,b.path);
const preservation=JSON.parse(execFileSync(process.execPath,['docs/evidence/earth-native-graph-wind-20261014/check-frozen.mjs'],{encoding:'utf8'}));
assert(preservation.passed&&preservation.formalDefaultUnchanged);
const statuses=new Map(),runs=[];
for(const file of (await readdir(out)).filter(n=>n.endsWith('-status.json')).sort()){
 const s=await read(`${out}/${file}`);
 assert(['passed','failed'].includes(s.state)&&s.completedUTC,`unfinished run: ${s.name}`);
 assert(s.sourceUnchanged&&s.inputUnchanged,`changed source/input: ${s.name}`);
 for(const [p,d] of Object.entries(s.sourceBefore))assert.equal(hash(await readFile(`${folder}/source-archives/${d}/${basename(p)}`)),d,p);
 for(const [p,d] of Object.entries(s.inputBefore))assert.equal(hash(await readFile(p)),d,p);
 for(const [p,d] of Object.entries(s.outputHashes))assert.equal(hash(await readFile(p)),d,p);
 statuses.set(s.name,s);runs.push({name:s.name,state:s.state,code:s.code});
}
for(const name of [selected.kernel,selected.analytic,selected.advection,selected.covariance,selected.temporal,...selected.native]){
 const s=statuses.get(name);assert(s,`missing ${name}`);await verifySource(s);
 assert((await read(`${out}/${name}.json`)).passed,`numerical gate: ${name}`);
}
const kernel=await read(`${out}/${selected.kernel}.json`);assert(kernel.denseRelative<5e-12&&kernel.energyIdentity<5e-12);
const advection=await read(`${out}/${selected.advection}.json`);assert(advection.restartBitwise&&advection.rollback);
const analytic=await read(`${out}/${selected.analytic}.json`);assert.equal(analytic.rows.length,36);
for(let i=0;i<12;i++){
 const [a,b,c]=[analytic.rows[i],analytic.rows[i+12],analytic.rows[i+24]];
 assert(a.relativeRMS>b.relativeRMS&&b.relativeRMS>c.relativeRMS&&c.relativeRMS<.35);
 assert(a.polarRMS>b.polarRMS&&b.polarRMS>c.polarRMS);
}
const covariance=await read(`${out}/${selected.covariance}.json`);
assert(covariance.frameCovarianceRelative<5e-13&&!covariance.c5FeedbackImplemented&&covariance.feedback.length===2);
assert(covariance.feedback.every(r=>r.relativeEdgeFeedbackError>1e-4));
for(const [i,name] of selected.native.entries()){
 const r=await read(`${out}/${name}.json`);assert.equal(r.dt,[1800,900,450,225][i]);assert.equal(r.duration,21600);
 assert.deepEqual(r.results.map(c=>c.case),i===0?['real','constant','sharp']:['real']);
 assert(r.sameDynamicsAcrossTracers&&!r.c5Feedback&&!r.fullPhysicalCoupling&&!r.climateAcceptance);
 for(const c of r.results){
  assert(c.steps===21600/r.dt&&c.rejections===0&&c.dt===r.dt);
  assert(c.maxLocalRelative<5e-12&&c.maxMomentumRelative<5e-12&&c.maxEnergyRelative<5e-12);
  assert(c.maxEnergyIncrease<1e-11&&c.accumulatedEnergyIdentity<5e-12&&c.energyLossFraction>=-1e-11);
  assert(Math.abs(c.airDriftKgM2)<1e-8&&Math.abs(c.waterDriftMm)<1e-9&&Math.abs(c.dryDriftKgM2)<1e-8);
  assert(c.qmin>=c.initialQmin-1e-11&&c.qmax<=c.initialQmax+1e-11&&c.constantError<1e-12&&c.pmin>0);
  if(i===0)assert(c.restartBitwiseEqual&&c.resumedSteps===4);
 }
}
const temporal=await read(`${out}/${selected.temporal}.json`);assert.deepEqual(temporal.names,selected.native);assert.equal(temporal.formalOrder,1);
for(const name of selected.native)for(const suffix of ['.json','-real-final.bin']){
 const p=`${out}/${name}${suffix}`;assert.equal(statuses.get(selected.temporal).inputBefore[p],hash(await readFile(p)),`temporal input ${p}`);
}
for(const key of ['pressurePa','velocityMps','humidityKgKg'])for(const set of ['adjacent','reference']){
 const [a,b,c]=temporal[set].map(r=>r[key]);assert(a>b&&b>c&&c>0);
}
const sourceTest=await read(`${out}/c6-source-v1.json`);assert(sourceTest.passed&&sourceTest.checks===7);
for(const [p,d] of Object.entries(sourceTest.sourceHashes))assert.equal(hash(await readFile(p)),d,p);
const project=await read(`${out}/project-checks.json`);assert(project.passed&&project.tests===278&&project.rows.every(r=>r.code===0));
for(const r of project.rows)assert.equal(hash(await readFile(r.log)),r.sha256,r.log);
const plot=await read(`${out}/plot-provenance.json`);assert(plot.passed);
for(const [p,d] of Object.entries({...plot.sourceHashes,...plot.inputHashes}))assert.equal(hash(await readFile(p)),d,p);
assert.equal(hash(await readFile(`${out}/convergence.png`)),plot.outputSHA256);
const review=await read(`${folder}/review-source-bindings.json`);assert(review.completed&&review.actionableFindings===0);
for(const [p,d] of Object.entries(review.sourceHashes))assert.equal(hash(await readFile(p)),d,p);
for(const required of ['report.md','code-review.md','README.md','CURRENT-STATE.md','c5-review-addendum.md'])assert((await readFile(`${folder}/${required}`,'utf8')).length>100);
await mkdir(`${folder}/raw`,{recursive:true});
for(const e of await readdir(out,{withFileTypes:true}))if(e.isFile())await copyFile(`${out}/${e.name}`,`${folder}/raw/${e.name}`,1);
const acceptance={covariantSignedMomentum:true,dissipativeEnergyIdentity:true,sampledSpatialRefinement:true,frameCovariance:true,atomicNonlinearPressurelessAdvection:true,sharedHorizontalVerticalWaterMomentum:true,
 nativeSixHourTemporalRefinement:true,sharedBudgetsAndHumidityRange:true,rebuiltFourStepRestart:true,independentCodeReviewCompleted:true,c5IndependentReviewAddendum:true,
 c5EdgeFeedback:false,exactGlobalAngularMomentum:false,secondOrderMomentumAdvection:false,fullThermodynamics:false,fullPhysicalCoupling:false,longClimateValidation:false,formalDefaultPromoted:false};
await writeFile(`${folder}/verification.json`,JSON.stringify({passed:true,createdUTC:new Date().toISOString(),previous,preservation,selected,runs,project,acceptance},null,2)+'\n',{flag:'wx'});
async function walk(dir){const files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=`${dir}/${e.name}`;if(e.isDirectory())files.push(...await walk(p));else files.push(p);}return files;}
const bindings=[];
for(const path of (await walk(folder)).sort()){assert(!path.endsWith('/manifest.json'),'already sealed');const b=await readFile(path);bindings.push({path,bytes:b.length,sha256:hash(b)});}
const content=JSON.stringify({candidate:'c6-covariant-momentum',createdUTC:new Date().toISOString(),previous,acceptance,bindings},null,2)+'\n';
await writeFile(`${folder}/manifest.json`,content,{flag:'wx'});
console.log(JSON.stringify({sealed:true,sha256:hash(content),files:bindings.length+1,acceptance}));
