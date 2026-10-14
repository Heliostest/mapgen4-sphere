import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {verifyFrozenChain,previousManifestSHA256} from './verify-frozen-chain.mjs';
const old='docs/evidence/earth-speedy-moisture-monsoon-20261013',folder='docs/evidence/earth-speedy-transport-20261013';
const hash=b=>createHash('sha256').update(b).digest('hex');
const bytes=await readFile(`${old}/manifest.json`);
const chain=await verifyFrozenChain(`${old}/manifest.json`,previousManifestSHA256),m=chain.root;
const formal='scenes/earth-land-sea/earth-simulation.json';
assert.equal(hash(await readFile(formal)),m.formalSha256);
const result={createdUTC:new Date().toISOString(),passed:true,oldManifestSHA256:hash(bytes),oldBindingsVerified:m.bindings.length,
 frozenManifestsVerified:chain.manifests,recursiveBindingsVerified:chain.bindingsVerified,uniqueFrozenFilesVerified:chain.uniqueFilesVerified,
 formalDefaultUnchanged:true,formalSHA256:m.formalSha256};
await writeFile(`${folder}/preservation-verification.json`,JSON.stringify(result,null,2)+'\n');
console.log(result);
