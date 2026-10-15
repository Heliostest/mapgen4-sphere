/** Freeze only a coherent, complete six-run cohort. Never overwrite evidence. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
const folder='docs/evidence/earth-monsoon-forcing-20261015',out='build/earth-monsoon-forcing';
const labels=['native','wind10','thermal','both10','windColumn','bothColumn'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const bundle=await readFile(`${out}/audit.mjs`),forcing=gunzipSync(await readFile(`${folder}/forcing.json.gz`));
const entries=[];
for(const k of labels){
 const bytes=await readFile(`${out}/${k}.json`),d=JSON.parse(bytes);
 assert(d.label===k&&d.records.length===5&&d.bundleSha256===sha(bundle)&&d.forcingSha256===sha(forcing));
 assert(d.records.at(-1).day*86400>=d.yearS&&d.maxVaporResidualMm<1e-7);
 entries.push([`${k}.json`,bytes],[`${k}-grid.json.gz`,await readFile(`${out}/${k}-grid.json.gz`)]);
}
entries.push(['audit.mjs.gz',gzipSync(bundle)]);
for(const [name,bytes] of entries){
 try{assert.deepEqual(await readFile(`${folder}/${name}`),bytes,'Refuse to replace frozen '+name);}
 catch(e){if(e.code!=='ENOENT')throw e;await writeFile(`${folder}/${name}`,bytes,{flag:'wx'});}
}
console.log('Archived six complete profiles and their exact executed bundle.');
