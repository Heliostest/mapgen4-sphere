import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-conservative-accuracy-20261013',out='build/earth-conservative-accuracy';
const hash=b=>createHash('sha256').update(b).digest('hex');
const runner=`${folder}/run-accuracy-v2.mjs`,probe=`${folder}/native-fct-v2.jl`;
const path=`${out}/c2-final-900-status.json`,before=hash(await readFile(path));
const duplicate=spawnSync(process.execPath,[runner,probe,'c2-final-900'],{encoding:'utf8',windowsHide:true});
assert.notEqual(duplicate.status,0);assert.equal(hash(await readFile(path)),before);
const results=[{case:'duplicate run',rejected:true,priorStatusUnchanged:true}];
for(const [label,env] of [['invalid-case',{ACCURACY_CASES:'typo'}],['zero-days',{ACCURACY_DAYS:'0'}]]){
 const name=`c2-harness-${label}`;
 const r=spawnSync(process.execPath,[runner,probe,name],{encoding:'utf8',windowsHide:true,env:{...process.env,...env}});
 assert.notEqual(r.status,0,label);
 const status=JSON.parse(await readFile(`${out}/${name}-status.json`,'utf8'));
 assert.equal(status.state,'failed');assert(status.sourceUnchanged&&status.inputUnchanged);
 results.push({case:label,rejected:true,status:name});
}
await writeFile(`${folder}/harness-tests.json`,JSON.stringify({passed:true,results},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,results}));
