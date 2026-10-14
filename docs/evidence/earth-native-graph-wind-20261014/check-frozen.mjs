import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-native-graph-wind-20261014';
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
async function checkBindings(bindings){for(const b of bindings)assert.equal(hash(await readFile(b.path)),b.sha256,b.path);return bindings.length;}
const path='docs/evidence/earth-polar-pressure-20261014/manifest.json';
assert.equal(hash(await readFile(path)),'cb95e9a55efac60795367edebe119e601bc984d941c2f7b76f595f483070eb8e');
const c3=await read(path);const c3Count=await checkBindings(c3.bindings);
assert.equal(hash(await readFile(c3.previous.path)),c3.previous.sha256);
const c2=await read(c3.previous.path);const c2Count=await checkBindings(c2.bindings);
assert.equal(hash(await readFile(c2.c1Snapshot.path)),c2.c1Snapshot.sha256);
const c1=await read(c2.c1Snapshot.path);const c1Count=await checkBindings(c1.c1bindings);
async function walk(dir){let files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=`${dir}/${e.name}`;if(e.isDirectory())files.push(...await walk(p));else files.push(p);}return files;}
const c1Files=[...await walk('docs/evidence/earth-conservative-transport-20261013'),...await walk('build/earth-conservative-transport')].sort();
assert.deepEqual(c1Files,c1.c1bindings.map(b=>b.path).sort());
const native=await read('docs/evidence/earth-speedy-transport-20261013/native-source-baseline.json');
const nativeCount=await checkBindings(native.bindings);
assert.equal(hash(await readFile('scenes/earth-land-sea/earth-simulation.json')),'afb80a8ab730785eed0cb709a66d938ad20a9690b04ecfa1246d1deb393adca6');
const result={passed:true,c3ManifestSHA256:hash(await readFile(path)),c3Count,c2Count,c1Count,nativeCount,formalDefaultUnchanged:true};
if(process.argv[2])await writeFile(`${folder}/${process.argv[2]}.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result));
