import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,dirname,extname} from 'node:path';
import assert from 'node:assert/strict';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function verifySource(record,runner='docs/evidence/earth-rotating-graph-20261014/run.mjs',protocol='docs/evidence/earth-rotating-graph-20261014/protocol.md') {
 assert(record.state==='passed'&&record.code===0&&record.sourceUnchanged&&record.inputUnchanged,'unsuccessful run');
 const visited=new Set();
 async function visit(file){
  const p=relative(process.cwd(),resolve(file)).replaceAll('\\','/');if(visited.has(p))return;visited.add(p);
  assert(record.sourceBefore[p],`unbound source: ${p}`);
  const bytes=await readFile(p);assert.equal(hash(bytes),record.sourceBefore[p],`source differs: ${p}`);
  if(extname(p)==='.jl')for(const m of bytes.toString('utf8').matchAll(/^\s*include\("([^"]+)"\)/gm))await visit(resolve(dirname(p),m[1]));
 }
 await visit(record.script);await visit(runner);await visit(protocol);return visited.size;
}
