import {readFile,writeFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-polar-pressure-20261014',out='build/earth-polar-pressure';
const [spatialName,coupledName]=process.argv.slice(2);
assert(spatialName&&coupledName,'Supply the selected independent audit and coupling runs');
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const previousPath='docs/evidence/earth-conservative-accuracy-20261013/manifest.json';
const previousBytes=await readFile(previousPath);
assert.equal(hash(previousBytes),'9c2624a29cff97d7cd74dd118ac39cc4e71141852561ebaf2b00aa8150f64cd2');
const previous=JSON.parse(previousBytes);
for(const b of previous.bindings)assert.equal(hash(await readFile(b.path)),b.sha256,b.path);
let sourceBindings=0,inputBindings=0,outputBindings=0;const runs=[];
for(const name of (await readdir(out)).filter(n=>n.endsWith('-status.json')).sort()){
 const s=await read(`${out}/${name}`);
 assert(['passed','failed'].includes(s.state),'unfinished run '+name);
 assert(s.sourceUnchanged&&s.inputUnchanged,'changed run bindings '+name);
 for(const [path,digest] of Object.entries(s.sourceBefore)){
  assert.equal(hash(await readFile(`${folder}/source-archives/${digest}/${basename(path)}`)),digest,path);sourceBindings++;
 }
 for(const [path,digest] of Object.entries(s.inputBefore)){assert.equal(hash(await readFile(path)),digest,path);inputBindings++;}
 for(const [path,digest] of Object.entries(s.outputHashes||{})){assert.equal(hash(await readFile(path)),digest,path);outputBindings++;}
 if(s.resultSha256)assert.equal(hash(await readFile(`${out}/${s.name}.json`)),s.resultSha256,s.name);
 runs.push({name:s.name,state:s.state,code:s.code});
}
const spatial=await read(`${out}/${spatialName}.json`),coupled=await read(`${out}/${coupledName}.json`);
assert(spatial.spatialCandidateAccepted);
assert.equal(hash(await readFile(spatial.nativeGraphPath)),spatial.nativeGraphSha256);
const couplingStatus=await read(`${out}/${coupledName}-status.json`);
assert.equal(couplingStatus.inputBefore[spatial.nativeGraphPath],spatial.nativeGraphSha256);
const acceptance={sampledSpatialRefinement:true,manufacturedSharedFluxBudgets:coupled.cases.every(c=>c.localMax<5e-12&&Math.abs(c.waterDrift)<1e-12),sampledWaveNonRegression:coupled.waveNonRegression===true,fullPhysicalCoupling:false,nativeWindImport:false,climate:false,formalDefaultPromoted:false};
const verification={createdUTC:new Date().toISOString(),passed:true,meaning:'Evidence hashes verified; numerical acceptance is listed separately',previous:{path:previousPath,sha256:hash(previousBytes),bindings:previous.bindings.length},sourceBindings,inputBindings,outputBindings,runs,selected:{spatialName,coupledName},acceptance};
await writeFile(`${folder}/verification.json`,JSON.stringify(verification,null,2)+'\n',{flag:'wx'});
// Portable raw artifacts only; dependency/runtime directories are excluded.
await mkdir(`${folder}/raw`,{recursive:true});
for(const e of await readdir(out,{withFileTypes:true}))if(e.isFile())await copyFile(`${out}/${e.name}`,`${folder}/raw/${e.name}`,1);
async function walk(dir){const files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=`${dir}/${e.name}`;if(e.isDirectory())files.push(...await walk(p));else files.push(p);}return files;}
const bindings=[];
for(const path of (await walk(folder)).filter(p=>p!==`${folder}/manifest.json`).sort()){
 const b=await readFile(path);bindings.push({path,bytes:b.length,sha256:hash(b)});
}
const manifest={createdUTC:new Date().toISOString(),candidate:'c3-experimental-graph',previous:verification.previous,acceptance,bindings};
const value=JSON.stringify(manifest,null,2)+'\n';
await writeFile(`${folder}/manifest.json`,value,{flag:'wx'});
for(const b of bindings)assert.equal(hash(await readFile(b.path)),b.sha256,b.path);
console.log(JSON.stringify({sealed:true,bindings:bindings.length,sourceBindings,inputBindings,outputBindings,sha256:hash(Buffer.from(value)),acceptance}));
