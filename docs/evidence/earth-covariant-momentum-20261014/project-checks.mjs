import {spawnSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const out='build/earth-covariant-momentum',rows=[];
for(const [label,script] of [['test','scripts/test.mjs'],['typecheck','node_modules/typescript/bin/tsc'],['build','scripts/build.mjs']]){
 const args=[script,...(label==='typecheck'?['--noEmit']:[])];
 const r=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
 const output=(r.stdout??'')+(r.stderr??'');const log=`${out}/project-final-${label}.log`;
 await writeFile(log,output,{flag:'wx'});
 rows.push({label,command:[process.execPath,...args],code:r.status,log,sha256:createHash('sha256').update(output).digest('hex')});
 assert.equal(r.status,0,`${label}: ${r.error??output.slice(-2000)}`);
 if(label==='test')assert(/tests 278/.test(output)&&/pass 278/.test(output)&&/fail 0/.test(output));
}
await writeFile(`${out}/project-checks.json`,JSON.stringify({passed:true,tests:278,rows},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,tests:278,rows:rows.map(r=>({label:r.label,code:r.code}))}));
