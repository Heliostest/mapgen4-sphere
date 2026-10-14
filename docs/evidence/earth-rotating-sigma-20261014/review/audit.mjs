import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative,basename} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root='docs/evidence/earth-rotating-sigma-20261014',out='build/earth-rotating-sigma';
const hash=b=>createHash('sha256').update(b).digest('hex');
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const selected=await json(`${root}/selected-runs.json`);const allStatuses=(await readdir(out)).filter(n=>n.endsWith('-status.json'));
const preservation=JSON.parse(execFileSync(process.execPath,['docs/evidence/earth-native-graph-wind-20261014/check-frozen.mjs'],{encoding:'utf8'}));
assert(preservation.passed&&preservation.formalDefaultUnchanged);
const frozen=[];
for(const [name,digest] of [
 ['earth-native-graph-wind-20261014','8c9869d799dc7b7da8bd955de8a9cacd1c843722de8926bb10ddc1bc94cd6536'],
 ['earth-rotating-graph-20261014','bccc6cf74351355e7c3c799c4767684b2fa06a2de73b0a2d67ca057ed5e376e8'],
 ['earth-covariant-momentum-20261014','fa83192f5dd1dd2627734a6eaff9a6a2d546181ae24ac5d07fe45d93f834633c'],
 ['earth-compatible-momentum-20261014','c0d8e047bb577bb6b689a128639c8e4b9dcf6cf3fe6f4eee8ed74f589ceedfeb'],
 ['earth-pressure-work-20261014','4f4a9d86f8c382c633f8ae7a50b2dfc2fcb9f1eff8b65675794d8a6a6dbcbf94']]){
 const path=`docs/evidence/${name}/manifest.json`;const bytes=await readFile(path);assert.equal(hash(bytes),digest);
 const manifest=JSON.parse(bytes);for(const b of manifest.bindings)assert.equal(hash(await readFile(b.path)),b.sha256);
 frozen.push({path,sha256:digest,bindings:manifest.bindings.length});
}
let boundSources=0,boundInputs=0,boundOutputs=0;const records=[];
for(const file of allStatuses){
 const r=await json(`${out}/${file}`);
 assert(['passed','failed'].includes(r.state));assert(r.completedUTC&&r.sourceUnchanged&&r.inputUnchanged);
 assert.deepEqual(r.sourceBefore,r.sourceAfter);assert.deepEqual(r.inputBefore,r.inputAfter);
 for(const [p,d] of Object.entries(r.sourceBefore)){assert.equal(hash(await readFile(`${root}/source-archives/${d}/${basename(p)}`)),d);boundSources++;}
 for(const [p,d] of Object.entries(r.inputBefore)){assert.equal(hash(await readFile(p)),d);boundInputs++;}
 for(const [p,d] of Object.entries(r.outputHashes)){assert.equal(hash(await readFile(p)),d);boundOutputs++;}
 records.push({name:r.name,state:r.state,code:r.code,logSHA256:hash(await readFile(`${out}/${r.name}.log`))});
}
for(const name of Object.values(selected).flat()){
 const r=await json(`${out}/${name}-status.json`);assert.equal(r.state,'passed');assert.equal(r.code,0);
 const visited=new Set();
 async function walk(file){
  const p=relative(process.cwd(),resolve(file)).replaceAll('\\','/');if(visited.has(p))return;visited.add(p);
  const bytes=await readFile(p);assert.equal(hash(bytes),r.sourceBefore[p],p);
  if(p.endsWith('.jl'))for(const match of bytes.toString().matchAll(/^\s*include\("([^"]+)"\)/gm))await walk(resolve(dirname(p),match[1]));
 }
 await walk(r.script);await walk(`${root}/run.mjs`);await walk(`${root}/protocol.md`);
 assert((await json(`${out}/${name}.json`)).passed);
}
const native=[];
for(const [i,name] of selected.native.entries()){
 const result=await json(`${out}/${name}.json`);assert.equal(result.dt,[1800,900,450,225][i]);assert.equal(result.duration,21600);
 for(const row of result.results){
  const trace=await json(`${out}/${name}-${row.case}-trace.json`);assert.equal(trace.length,21600/result.dt);
  for(const [j,t] of trace.entries()){
   assert.equal(t.step,j+1);assert.equal(t.time,(j+1)*result.dt);assert.equal(t.dt,result.dt);
   for(const k of ['firstEquation','lastEquation','pressureEquation','localAirRelativeResidual','localWaterRelativeResidual','localDryRelativeResidual'])assert(Number.isFinite(t[k])&&t[k]>=0&&t[k]<5e-12);
   assert(t.completeEnergyAbsolute<=t.completeEnergyAllowance&&Number.isFinite(t.completeEnergyAllowance));
  }
  assert.equal(trace.reduce((s,t)=>s+t.firstIterations+t.lastIterations,0),row.totalNeutralIterations);
  assert.equal(trace.reduce((s,t)=>s+t.pressureIterations,0),row.totalPressureIterations);
  assert.equal(Math.max(...trace.flatMap(t=>[t.firstIterations,t.lastIterations,t.pressureIterations])),Math.max(row.maxPressureIterations,row.maxNeutralIterations));
  assert(row.accumulatedEnergyDrift<1e-9&&row.maxLocalRelative<5e-12&&row.pmin>0&&row.rejections===0);
  if(i===0)assert(row.restartBitwiseEqual&&row.resumedSteps===4);
  native.push({name,case:row.case,steps:row.steps,energyDrift:row.accumulatedEnergyDrift,localBudget:row.maxLocalRelative,neutralIterations:row.totalNeutralIterations});
 }
}
const temporal=await json(`${out}/${selected.temporal}.json`);assert.deepEqual(temporal.names,selected.native);
const tr=await json(`${out}/${selected.temporal}-status.json`);
for(const name of selected.native)for(const suffix of ['.json','-real-final.bin']){const p=`${out}/${name}${suffix}`;assert.equal(hash(await readFile(p)),tr.inputBefore[p]);}
for(const k of ['pressurePa','velocityMps','humidityKgKg'])for(const key of ['adjacent','reference'])assert(temporal[key][0][k]>temporal[key][1][k]&&temporal[key][1][k]>temporal[key][2][k]&&temporal[key][2][k]>0);
for(const status of ['v1-status.json','late-status.json']){
 const r=await json(`build/c9-independent-review/${status}`);assert(r.passed&&r.code===0&&r.sourceUnchanged);assert.deepEqual(r.sourceBefore,r.sourceAfter);
 for(const [p,d] of Object.entries({...r.sourceBefore,...r.outputHashes}))assert.equal(hash(await readFile(p)),d,p);
}
const own='build/c9-independent-review/audit.mjs';
await writeFile('build/c9-independent-review/audit-results.json',JSON.stringify({passed:true,sourceHashes:{[own]:hash(await readFile(own))},preservation,frozen,selected,records,boundSources,boundInputs,boundOutputs,native,temporal},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,statuses:records.length,boundSources,boundInputs,boundOutputs,nativeRows:native.length}));
