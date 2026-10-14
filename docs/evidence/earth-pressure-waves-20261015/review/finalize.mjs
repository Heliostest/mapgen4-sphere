import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const audit='build/c11-independent-review';
const read=async p=>JSON.parse(await readFile(p,'utf8')),sha=b=>createHash('sha256').update(b).digest('hex');
const before=await read(audit+'/frozen-before.json'),after=await read(audit+'/frozen-after.json');
for(const k of ['sourceHashes','inputHashes','outputHashes'])assert.deepEqual(before[k],after[k],k+' changed after freeze');
for(const name of ['numerical-v1','endpoints-v1','evidence-v1','tooling-v1']){const s=await read(`${audit}/${name}-status.json`);assert(s.passed&&s.code===0&&s.sourceUnchanged&&s.inputUnchanged&&s.experimentOutputUnchanged);}
const sourceHashes={...after.sourceHashes,'.gitattributes':sha(await readFile('.gitattributes'))};
const artifactPaths=(await readdir(audit)).filter(p=>!['review-source-bindings.json'].includes(p)).sort().map(p=>audit+'/'+p);
const reviewArtifactHashes=Object.fromEntries(await Promise.all(artifactPaths.map(async p=>[p,sha(await readFile(p))])));
const receipt={completed:true,actionableFindings:0,criticalFindings:0,importantFindings:0,minorFindings:0,reviewedBase:'9fcc89a92c8c8fe3aa41e019827af3a219244ecf',reviewedBranch:'codex/pressure-wave-validation',createdUTC:new Date().toISOString(),sourceHashes,inputHashes:after.inputHashes,outputHashes:after.outputHashes,reviewArtifactHashes,declinedToJudge:[{behavior:'Rotating/stratified/internal-gravity waves, arbitrary wavepacket group velocity, long-term climate and default promotion',reason:'Explicit protocol exclusions; no validation claim made.'},{behavior:'Cross-runtime/platform bitwise reproducibility',reason:'Runtime is identified by path/version rather than content hash, as disclosed.'}]};
await writeFile(audit+'/review-source-bindings.json',JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
const tree=[];for(const p of (await readdir(audit)).sort()){const b=await readFile(audit+'/'+p);tree.push({path:p,bytes:b.length,sha256:sha(b)});}
console.log(JSON.stringify({files:tree.length,treeHashAlgorithm:'sha256(JSON.stringify(sorted array of {path: relative filename, bytes, sha256}))',treeSHA256:sha(Buffer.from(JSON.stringify(tree))),reviewSHA256:sha(await readFile(audit+'/code-review.md')),receiptSHA256:sha(await readFile(audit+'/review-source-bindings.json')),sourceCount:Object.keys(sourceHashes).length,inputCount:Object.keys(receipt.inputHashes).length,outputCount:Object.keys(receipt.outputHashes).length,reviewArtifactCount:Object.keys(reviewArtifactHashes).length},null,2));
