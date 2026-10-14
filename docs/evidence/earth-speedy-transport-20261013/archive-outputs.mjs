import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-speedy-transport-20261013',out='build/earth-speedy-transport';
const hash=b=>createHash('sha256').update(b).digest('hex');
await mkdir(`${folder}/raw`,{recursive:true});
let entries=[];
try {entries=JSON.parse(await readFile(`${folder}/raw-index.json`,'utf8')).entries;}catch(e){if(e.code!=='ENOENT')throw e;}
for(const prefix of process.argv.slice(2)){
 const status=JSON.parse(await readFile(`${folder}/${prefix}-native-status.json`,'utf8'));
 assert.equal(status.code,0,prefix);assert(status.sourceUnchanged,prefix);assert(status.inputsUnchanged,prefix);
 for(const suffix of ['statistics.json','geometry.json','initial-inventory.json','initial.jld2','statistics-start.jld2','final.jld2']){
  const source=`${out}/${prefix}-${suffix}`;
  try {await stat(source);}catch(e){if(e.code==='ENOENT'&&suffix==='statistics-start.jld2')continue;throw e;}
  const bytes=await readFile(source),path=`${folder}/raw/${prefix}-${suffix}.gz`,compressed=gzipSync(bytes,{level:6});
  assert.equal(hash(gunzipSync(compressed)),hash(bytes));
  await writeFile(path,compressed);
  entries=entries.filter(e=>e.source!==source);
  entries.push({source,rawBytes:bytes.length,rawSha256:hash(bytes),path,bytes:compressed.length,sha256:hash(compressed)});
 }
}
entries.sort((a,b)=>a.source.localeCompare(b.source));
await writeFile(`${folder}/raw-index.json`,JSON.stringify({createdUTC:new Date().toISOString(),entries},null,2)+'\n');
console.log({archives:entries.length,rawMiB:entries.reduce((s,e)=>s+e.rawBytes,0)/2**20,compressedMiB:entries.reduce((s,e)=>s+e.bytes,0)/2**20});
