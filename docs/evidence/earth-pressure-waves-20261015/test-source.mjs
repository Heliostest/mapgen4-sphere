import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {verifySource} from './verify-source.mjs';
const dir=await mkdtemp('build/c11-source-test-'),hash=b=>createHash('sha256').update(b).digest('hex');
let checks=0;
for(const language of ['jl','py']){
 const paths=[`${dir}/entry.${language}`,`${dir}/child.${language}`,`${dir}/runner.mjs`,`${dir}/protocol.md`];
 const contents=[language==='jl'?'include'+ '("child.jl")\n':'# bind: child.py\n','answer=42\n','// include'+ '("fake.jl")\n','Bound protocol\n'];
 for(let i=0;i<4;i++)await writeFile(paths[i],contents[i]);
 const record={script:paths[0],state:'passed',code:0,sourceUnchanged:true,inputUnchanged:true,sourceBefore:Object.fromEntries(paths.map((p,i)=>[p,hash(contents[i])]))};
 assert.equal(await verifySource(record,paths[2],paths[3]),4);checks++;
 for(let i=0;i<4;i++){
  await writeFile(paths[i],contents[i]+'changed\n');await assert.rejects(verifySource(record,paths[2],paths[3]),/source differs/);checks++;
  await writeFile(paths[i],contents[i]);
 }
 const missing=structuredClone(record);delete missing.sourceBefore[paths[1]];
 await assert.rejects(verifySource(missing,paths[2],paths[3]),/unbound source/);checks++;
 await assert.rejects(verifySource({...record,state:'failed'},paths[2],paths[3]),/unsuccessful run/);checks++;
}
const sourceHashes=Object.fromEntries(await Promise.all(['verify-source.mjs','test-source.mjs'].map(async n=>{const p=`docs/evidence/earth-pressure-waves-20261015/${n}`;return [p,hash(await readFile(p))]})));
await writeFile('build/earth-pressure-waves/c11-source-v1.json',JSON.stringify({passed:true,checks,sourceHashes},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,checks}));
