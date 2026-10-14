import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {verifySource} from './verify-source.mjs';
const dir=await mkdtemp('build/c6-source-test-');
const paths=[`${dir}/entry.jl`,`${dir}/child.jl`,`${dir}/runner.mjs`,`${dir}/protocol.md`];
const contents=['include'+ '("child.jl")\n','answer=42\n','// '+ 'include'+ '("not-a-julia-input.jl")\n','Bound protocol\n'];
for(let i=0;i<4;i++)await writeFile(paths[i],contents[i]);
const hash=b=>createHash('sha256').update(b).digest('hex');
const record={script:paths[0],state:'passed',code:0,sourceUnchanged:true,inputUnchanged:true,sourceBefore:Object.fromEntries(paths.map((p,i)=>[p,hash(contents[i])]))};
assert.equal(await verifySource(record,paths[2],paths[3]),4);
for(let i=0;i<4;i++){
 await writeFile(paths[i],contents[i]+'changed\n');
 await assert.rejects(verifySource(record,paths[2],paths[3]),/source differs/);
 await writeFile(paths[i],contents[i]);
}
const missing=structuredClone(record);delete missing.sourceBefore[paths[1]];
await assert.rejects(verifySource(missing,paths[2],paths[3]),/unbound source/);
await assert.rejects(verifySource({...record,state:'failed'},paths[2],paths[3]),/unsuccessful run/);
const sourceHashes=Object.fromEntries(await Promise.all(['verify-source.mjs','test-source.mjs'].map(async n=>{const p=`docs/evidence/earth-covariant-momentum-20261014/${n}`;return [p,hash(await readFile(p))]})));
await writeFile('build/earth-covariant-momentum/c6-source-v1.json',JSON.stringify({passed:true,checks:7,sourceHashes},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,checks:7}));
