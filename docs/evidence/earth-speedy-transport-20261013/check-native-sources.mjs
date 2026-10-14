import {readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-speedy-transport-20261013';
const root='build/earth-speedyweather/depot/packages/SpeedyWeather/qRu16/src';
const manifest=`${folder}/native-source-baseline.json`;
const hash=b=>createHash('sha256').update(b).digest('hex');
async function walk(p){let files=[];for(const d of await readdir(p,{withFileTypes:true})){const path=`${p}/${d.name}`;files.push(...(d.isDirectory()?await walk(path):[path]));}return files.sort();}
const paths=await walk(root),bindings=[];
for(const path of paths){const bytes=await readFile(path);bindings.push({path,bytes:bytes.length,sha256:hash(bytes)});}
let exists=true;try{await stat(manifest);}catch(e){if(e.code==='ENOENT')exists=false;else throw e;}
if(!exists){await writeFile(manifest,JSON.stringify({createdUTC:new Date().toISOString(),note:'Source snapshot captured after the first five sensitivity runs, while two six-year runs were active; not a retroactive prelaunch hash for those runs.',bindings},null,2)+'\n');console.log({captured:bindings.length});}
else{
 const original=JSON.parse(await readFile(manifest,'utf8'));
 assert.deepEqual(bindings,original.bindings);
 const result={checkedUTC:new Date().toISOString(),passed:true,files:bindings.length,baselineSHA256:hash(await readFile(manifest))};
 await writeFile(`${folder}/native-source-verification.json`,JSON.stringify(result,null,2)+'\n');console.log(result);
}
