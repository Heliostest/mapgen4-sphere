import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-conservative-accuracy-20261013',out='build/earth-conservative-accuracy';
const hash=b=>createHash('sha256').update(b).digest('hex');
const v=JSON.parse(await readFile(`${folder}/verification.json`,'utf8'));
const p=JSON.parse(await readFile(`${folder}/preservation-final.json`,'utf8'));
assert(v.passed&&p.passed&&!v.acceptance.climate);
async function walk(dir){const files=[];for(const e of await readdir(dir,{withFileTypes:true})){const path=`${dir}/${e.name}`;if(e.isDirectory())files.push(...await walk(path));else files.push(path);}return files;}
const files=[...await walk(folder),...await walk(out),'docs/superpowers/plans/2026-10-13-conservative-accuracy.md'].filter(p=>p!==`${folder}/manifest.json`).sort();
const bindings=[];
for(const path of files){const bytes=await readFile(path);bindings.push({path,bytes:bytes.length,sha256:hash(bytes)});}
const manifest={createdUTC:new Date().toISOString(),candidate:'c2',previousManifest:p.previous,c1Snapshot:{path:`${folder}/preservation-initial.json`,sha256:hash(await readFile(`${folder}/preservation-initial.json`))},acceptance:v.acceptance,bindings};
const value=JSON.stringify(manifest,null,2)+'\n';
await writeFile(`${folder}/manifest.json`,value,{flag:'wx'});
for(const b of bindings)assert.equal(hash(await readFile(b.path)),b.sha256,b.path);
console.log(JSON.stringify({sealed:true,bindings:bindings.length,sha256:hash(Buffer.from(value))}));
