import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {verifyFrozenChain} from '../earth-speedy-transport-20261013/verify-frozen-chain.mjs';
const folder='docs/evidence/earth-conservative-accuracy-20261013';
const hash=b=>createHash('sha256').update(b).digest('hex');
const previous={path:'docs/evidence/earth-speedy-transport-20261013/manifest.json',sha256:'8b5c368764caa331c24867af9f191fbd2ba65cf6d401c14b2c52370adc1b9a78'};
const latest=await verifyFrozenChain(previous.path,previous.sha256);
const older=await verifyFrozenChain(latest.root.previousManifest.path,latest.root.previousManifest.sha256);
const native=JSON.parse(await readFile('docs/evidence/earth-speedy-transport-20261013/native-source-baseline.json','utf8'));
for(const b of native.bindings)assert.equal(hash(await readFile(b.path)),b.sha256,b.path);
const formal='scenes/earth-land-sea/earth-simulation.json';
assert.equal(hash(await readFile(formal)),'afb80a8ab730785eed0cb709a66d938ad20a9690b04ecfa1246d1deb393adca6');
const c1='docs/evidence/earth-conservative-transport-20261013';
assert.equal(hash(await readFile(`${c1}/conservative-core.jl`)),'3fb46467306d9deae796f771e3e87c60304380d870c8b449009981200069869d');
async function walk(dir){let files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=`${dir}/${e.name}`;if(e.isDirectory())files.push(...await walk(p));else files.push(p);}return files;}
const paths=[...await walk(c1),...await walk('build/earth-conservative-transport')].sort();
const c1bindings=[];
for(const path of paths){const b=await readFile(path);c1bindings.push({path,bytes:b.length,sha256:hash(b)});}
const name=process.argv[2];assert(/^[a-z0-9-]+$/.test(name));
if(name!=='preservation-initial'){
 const initial=JSON.parse(await readFile(`${folder}/preservation-initial.json`,'utf8'));
 assert.deepEqual(c1bindings,initial.c1bindings,'C1 evidence changed during C2');
}
const result={verifiedUTC:new Date().toISOString(),passed:true,previous,oldBindings:latest.bindingsVerified+older.bindingsVerified,nativeFiles:native.bindings.length,formalDefaultUnchanged:true,c1bindings,c1ManifestAbsentAtResume:true,note:'Prior chat stopped before creating C1 manifest. C1 files are frozen by this C2 snapshot; no C1 file is rewritten.'};
await writeFile(`${folder}/${name}.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,oldBindings:result.oldBindings,nativeFiles:result.nativeFiles,c1Bindings:c1bindings.length,formalDefaultUnchanged:true}));
