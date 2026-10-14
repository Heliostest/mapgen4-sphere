import {readFile,writeFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-native-graph-wind-20261014',out='build/earth-native-graph-wind';
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const selected=await read(`${folder}/selected-runs.json`);
const frozen=await read(`${folder}/preservation-final.json`);assert(frozen.passed);
const previous={path:'docs/evidence/earth-polar-pressure-20261014/manifest.json',sha256:'cb95e9a55efac60795367edebe119e601bc984d941c2f7b76f595f483070eb8e'};
assert.equal(hash(await readFile(previous.path)),previous.sha256);
for(const b of (await read(previous.path)).bindings)assert.equal(hash(await readFile(b.path)),b.sha256,b.path);
let sources=0,inputs=0,outputs=0;const runs=[];const statuses=new Map();
for(const file of (await readdir(out)).filter(n=>n.endsWith('-status.json')).sort()){
 const s=await read(`${out}/${file}`);assert(['passed','failed'].includes(s.state));
 assert(s.sourceUnchanged&&s.inputUnchanged,`run changed while executing: ${s.name}`);
 for(const [p,d] of Object.entries(s.sourceBefore)){assert.equal(hash(await readFile(`${folder}/source-archives/${d}/${basename(p)}`)),d,p);sources++;}
 for(const [p,d] of Object.entries(s.inputBefore)){assert.equal(hash(await readFile(p)),d,p);inputs++;}
 for(const [p,d] of Object.entries(s.outputHashes)){assert.equal(hash(await readFile(p)),d,p);outputs++;}
 runs.push({name:s.name,state:s.state,code:s.code});statuses.set(s.name,s);
}
for(const name of [selected.import,selected.covariance,selected.analytic,selected.rotation,selected.temporal,...selected.native]){
 assert.equal(statuses.get(name)?.state,'passed',name);assert.equal(statuses.get(name)?.code,0,name);
 assert((await read(`${out}/${name}.json`)).passed,name);
 const impl=`${folder}/graph-wind.jl`;
 assert.equal(statuses.get(name).sourceBefore[impl],hash(await readFile(impl)),`selected importer differs from current implementation: ${name}`);
}
const audit=await read('docs/evidence/earth-polar-pressure-20261014/raw/c3-spatial-near-audit-v1.json');
const graph='docs/evidence/earth-polar-pressure-20261014/raw/c3-spatial-near-audit-v1-native-graph.json';
assert.equal(hash(await readFile(graph)),audit.nativeGraphSha256);
const graphExport=await read(`${out}/${selected.graphs}.json`);assert.equal(statuses.get(selected.graphs)?.state,'passed');
for(const row of graphExport.rows){
 assert.equal(hash(await readFile(row.input)),row.inputSha256);
 assert.equal(hash(await readFile(row.output)),row.outputSha256);
 const oldPath=`build/earth-polar-pressure/${basename(row.input.replaceAll('\\','/'))}`;
 assert.equal(audit.graphInputSha256[oldPath],row.inputSha256);
}
const native=[];
for(const name of selected.native){
 const r=await read(`${out}/${name}.json`);native.push(r);
 assert.equal(statuses.get(name).inputBefore[graph],audit.nativeGraphSha256);
 assert.equal(r.importInfo.graphSHA256,audit.nativeGraphSha256);
 assert.equal(r.importInfo.inputSHA256,statuses.get(name).inputBefore['build/earth-conservative-transport/candidate-c1-native-1800-import.bin']);
 assert.equal(r.duration,86400);assert.equal(r.c2,82671.64740772452);
 for(const c of r.results){
  assert(c.accepted===86400/r.dt&&c.rejections===0&&c.dt===r.dt);
  assert(c.pressureTimeErrorPa<1e-6&&c.momentumTimeErrorMps<1e-7&&Math.abs(c.relativeEnergyError)<1e-9);
  assert(c.maxLocalRelative<5e-12&&Math.abs(c.airDriftKgM2)<1e-8&&Math.abs(c.waterDriftMm)<1e-9&&Math.abs(c.dryDriftKgM2)<1e-8);
  assert(c.qmin>=c.initialQmin-1e-11&&c.qmax<=c.initialQmax+1e-11&&c.constantError<1e-12&&c.verticalMax>0);
 }
}
assert.deepEqual(native.map(r=>r.dt),[1800,900,450,225]);
assert.deepEqual(native[0].results.map(r=>r.case),['real','constant','sharp']);
assert(native[0].results.every(r=>r.restartBitwiseEqual&&r.resumedSteps===4));
const temporal=await read(`${out}/${selected.temporal}.json`);
assert.deepEqual(temporal.names,selected.native);
for(const name of selected.native)for(const suffix of ['.json','-real-final.bin']){
 const path=`${out}/${name}${suffix}`;assert.equal(statuses.get(selected.temporal).inputBefore[path],hash(await readFile(path)));
}
const decreasing=a=>a.every((v,i)=>i===0||v<a[i-1]);
assert(decreasing(temporal.adjacentHumidityRMS)&&decreasing(temporal.referenceHumidityRMS));
const analytic=await read(`${out}/${selected.analytic}.json`),rotation=await read(`${out}/${selected.rotation}.json`);
assert.equal(analytic.rows.length,60);assert.equal(rotation.rows.length,6);
for(const axis of [1,2])for(const variable of [false,true])for(const kind of ['rotation','gradient1','gradient2','gradient3','mixed']){
 const rows=analytic.rows.filter(r=>r.axis===axis&&r.variable===variable&&r.kind===kind);
 assert.deepEqual(rows.map(r=>r.rings),[24,48,96]);
 assert(rows.every(r=>r.hodgeResidual<1e-10&&r.orthogonality<1e-10));
 if(kind==='rotation'&&!variable){assert(rows.every(r=>r.rms<1e-6&&r.polarMax<1e-6));}
 else assert(decreasing(rows.map(r=>r.rms))&&decreasing(rows.map(r=>r.polarMax)));
 if(kind.startsWith('gradient')&&!variable)assert(decreasing(rows.map(r=>r.gradientCycleLeakage))&&rows.at(-1).gradientCycleLeakage<.01);
}
for(const kind of ['axial','polar-crossing']){
 const rows=rotation.rows.filter(r=>r.case===kind);assert.deepEqual(rows.map(r=>r.rings),[24,48,96]);
 assert(decreasing(rows.map(r=>r.maximumPhaseL2))&&decreasing(rows.map(r=>r.maximumPhasePolar)));
 assert(rows.every(r=>r.phaseErrors.length===8&&r.localMax<5e-12&&Math.abs(r.waterDrift)<1e-11));
}
const project=await read(`${out}/project-checks.json`);assert(project.passed&&project.rows.every(r=>r.code===0));
const portableInputs=[];await mkdir(`${folder}/raw/inputs`,{recursive:true});
for(const path of ['build/earth-conservative-transport/candidate-c1-native-1800-import.bin','build/earth-conservative-transport/candidate-c1-native-1800.json','build/earth-speedy-transport/split-reference-seasonal-geometry.json']){
 const copy=`${folder}/raw/inputs/${basename(path)}`;await copyFile(path,copy,1);
 assert.equal(hash(await readFile(copy)),hash(await readFile(path)));
 portableInputs.push({path,copy,sha256:hash(await readFile(path))});
}
for(const e of await readdir(out,{withFileTypes:true}))if(e.isFile())await copyFile(`${out}/${e.name}`,`${folder}/raw/${e.name}`,1);
const acceptance={nativeGraphWindImport:true,explicitGaussianWeakDivergence:true,completeMappedGraphCycleRetained:true,sampledAnalyticVectorRefinement:true,nativeOneDayTemporalRefinement:true,sharedAirWaterDryBudgets:true,globalHumidityRange:true,rebuiltCoreFourStepRestart:true,sampledImportedWindRotationRefinement:true,nativeSpectralDivergenceExact:false,continuumVorticityExact:false,fullPhysicalCoupling:false,longClimateValidation:false,formalDefaultPromoted:false};
const verification={createdUTC:new Date().toISOString(),passed:true,previous,frozen,selected,bindings:{sources,inputs,outputs},runs,portableInputs,acceptance};
await writeFile(`${folder}/verification.json`,JSON.stringify(verification,null,2)+'\n',{flag:'wx'});
async function walk(dir){const files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=`${dir}/${e.name}`;if(e.isDirectory())files.push(...await walk(p));else files.push(p);}return files;}
const bindings=[];
for(const path of (await walk(folder)).filter(p=>p!==`${folder}/manifest.json`).sort()){
 const b=await readFile(path);bindings.push({path,bytes:b.length,sha256:hash(b)});
}
const content=JSON.stringify({createdUTC:new Date().toISOString(),candidate:'c4-native-graph-wind',previous,acceptance,bindings},null,2)+'\n';
await writeFile(`${folder}/manifest.json`,content,{flag:'wx'});
for(const b of bindings)assert.equal(hash(await readFile(b.path)),b.sha256,b.path);
console.log(JSON.stringify({sealed:true,sha256:hash(Buffer.from(content)),bindings:bindings.length,runs:runs.length,acceptance}));
