import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

export const previousManifestSHA256='d2ebb76691bd0f6e386ce5a4ec56b55fe4892212a221d9a01aad193d05c18676';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

// Read-only traversal. Each child manifest is authenticated by its parent's
// frozen binding before any of the child's records are accepted.
export async function verifyFrozenChain(path,expectedSHA256){
 const manifests=[],visited=new Set(),uniqueFiles=new Set();
 let bindingsVerified=0;
 async function visit(path,expected){
  const bytes=await readFile(path);assert.equal(hash(bytes),expected,path);
  const manifest=JSON.parse(bytes);
  if(visited.has(path))return manifest;
  visited.add(path);assert(Array.isArray(manifest.bindings),path);
  for(const b of manifest.bindings){
   const content=await readFile(b.path);assert.equal(hash(content),b.sha256,b.path);
   if(b.bytes!==undefined)assert.equal(content.length,b.bytes,b.path);
   bindingsVerified++;uniqueFiles.add(b.path);
  }
  manifests.push({path,sha256:expected,bindings:manifest.bindings.length});
  for(const b of manifest.bindings.filter(b=>b.path.endsWith('/manifest.json')))await visit(b.path,b.sha256);
  return manifest;
 }
 const root=await visit(path,expectedSHA256);
 return {root,manifests,bindingsVerified,uniqueFilesVerified:uniqueFiles.size};
}
