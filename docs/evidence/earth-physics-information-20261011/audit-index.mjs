import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dir='docs/evidence/earth-physics-information-20261011';
const physics=JSON.parse(await readFile(dir+'/physics-check.json','utf8'));
const staged=execFileSync('git',['diff','--cached','--name-only','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const paths=[...new Set([...staged,...physics.bindings.map(b=>b.path)])];
const entries=execFileSync('git',['ls-files','--stage','-z','--',...paths],{encoding:'utf8'}).split('\0').filter(Boolean);
const index=new Map(entries.map(line=>{const [meta,path]=line.split('\t');return [path,meta.split(' ')[1]];}));
const mismatch=[];
for(const path of paths){const bytes=await readFile(path),blob=createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');if(blob!==index.get(path))mismatch.push(path);}
assert.deepEqual(mismatch,[],'Index must preserve original evidence and validated production bytes');
console.log(JSON.stringify({verifiedIndexFiles:paths.length,bytePreservation:'pass'}));
