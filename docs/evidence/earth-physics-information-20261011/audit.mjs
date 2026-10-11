import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dir='docs/evidence/earth-physics-information-20261011',sha=x=>createHash('sha256').update(x).digest('hex');
const manifest=JSON.parse(await readFile(dir+'/manifest.json','utf8')),physics=JSON.parse(await readFile(dir+'/physics-check.json','utf8'));
for(const b of [...manifest.bindings,...physics.bindings])assert.equal(sha(await readFile(b.path)),b.sha256,b.path);
for(const file of ['environment.ts','thermal.ts','water.ts']){
 const symbol={ 'environment.ts':'DEFAULT_ENVIRONMENT','thermal.ts':'DEFAULT_THERMAL','water.ts':'DEFAULT_WATER'}[file];
 const current=await readFile(file,'utf8'),head=execFileSync('git',['show',`HEAD:${file}`],{encoding:'utf8'});
 const pattern=new RegExp(`export const ${symbol}[^;]+;`);assert.equal(current.match(pattern)?.[0],head.match(pattern)?.[0],symbol);
}
assert.equal(sha(await readFile('scenes/earth-land-sea/earth-simulation.json')),'afb80a8ab730785eed0cb709a66d938ad20a9690b04ecfa1246d1deb393adca6');
execFileSync('git',['diff','--check']);
console.log(JSON.stringify({verifiedBindings:manifest.bindings.length+physics.bindings.length,formalDefaultsUnchanged:true,formalEarthUnchanged:true,diffCheck:'pass'}));
