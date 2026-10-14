import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-speedy-transport-20261013';
const paths=['build/earth-speedy-moisture-monsoon/coupled-seasonal-statistics.json','build/earth-speedy-transport/baseline-sensitivity-v2-statistics.json'];
const bytes=await Promise.all(paths.map(p=>readFile(p))),[old,newer]=bytes.map(b=>JSON.parse(b));
assert.equal(newer.physicsFix,'baseline');assert.equal(newer.stage,'same-2006-state-one-year-sensitivity');
assert.equal(newer.calls,17520);assert.equal(newer.actualEnd,old.actualEnd);assert.equal(newer.monthly.length,12);
let valuesChecked=0,maxError=0,largest=null;
function compare(a,b,path){
 if(typeof a==='number'){assert(Number.isFinite(a)&&Number.isFinite(b));const error=Math.abs(a-b);valuesChecked++;if(error>maxError){maxError=error;largest=path;}assert(error<1e-9,`${path} error ${error}`);}
 else if(Array.isArray(a)){assert.equal(b.length,a.length,path);a.forEach((x,i)=>compare(x,b[i],`${path}/${i}`));}
 else if(a&&typeof a==='object'){assert.deepEqual(Object.keys(b).sort(),Object.keys(a).sort(),path);for(const k of Object.keys(a))compare(a[k],b[k],`${path}/${k}`);}
 else assert.equal(b,a,path);
}
compare(old.monthly,newer.monthly,'monthly');
const result={createdUTC:new Date().toISOString(),passed:true,valuesChecked,maxError,largest,sources:paths.map((path,i)=>({path,sha256:createHash('sha256').update(bytes[i]).digest('hex')})),note:'All stored monthly fields match the original continuous run, including rain and evap. A new Observer accumulates the same physical trajectory after restoring the frozen state and dry-mass target.'};
await writeFile(`${folder}/baseline-replay-verification.json`,JSON.stringify(result,null,2)+'\n');console.log(result);
