import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,dirname} from 'node:path';
import assert from 'node:assert/strict';

// Follow the literal Julia include closure used by these experimental scripts.
// Other top-level evidence documents may legitimately be written after a run.
export async function verifySelectedSources(record,runner='docs/evidence/earth-native-graph-wind-20261014/run.mjs') {
 const visited=new Set();
 async function visit(file){
  const path=relative(process.cwd(),resolve(file)).replaceAll('\\','/');
  if(visited.has(path))return;visited.add(path);
  assert(record.sourceBefore[path],`unbound source: ${path}`);
  const bytes=await readFile(path),digest=createHash('sha256').update(bytes).digest('hex');
  assert.equal(digest,record.sourceBefore[path],`source differs: ${path}`);
  for(const match of bytes.toString('utf8').matchAll(/include\("([^"]+)"\)/g))await visit(resolve(dirname(path),match[1]));
 }
 await visit(record.script);await visit(runner);
 return visited.size;
}
