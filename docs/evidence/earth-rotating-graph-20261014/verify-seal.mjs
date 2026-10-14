import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-rotating-graph-20261014';
const [expectedSHA,ref]=process.argv.slice(2);
const hash=b=>createHash('sha256').update(b).digest('hex');
const bytes=await readFile(`${folder}/manifest.json`),manifest=JSON.parse(bytes);
if(expectedSHA)assert.equal(hash(bytes),expectedSHA);
async function walk(dir){const files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=`${dir}/${e.name}`;if(e.isDirectory())files.push(...await walk(p));else files.push(p);}return files;}
assert.deepEqual((await walk(folder)).sort(),[`${folder}/manifest.json`,...manifest.bindings.map(b=>b.path)].sort());
for(const b of [...manifest.bindings,{path:`${folder}/manifest.json`,sha256:hash(bytes)}]){
 assert.equal(hash(await readFile(b.path)),b.sha256,b.path);
 if(ref)assert.equal(hash(execFileSync('git',['show',`${ref}:${b.path}`],{maxBuffer:128*1024*1024})),b.sha256,`Git ${b.path}`);
}
assert.equal(hash(await readFile(manifest.previous.path)),manifest.previous.sha256);
console.log(JSON.stringify({passed:true,manifestSHA256:hash(bytes),files:manifest.bindings.length+1,ref:ref??null}));
