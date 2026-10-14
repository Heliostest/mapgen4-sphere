import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-compatible-momentum-20261014',out='build/earth-compatible-momentum';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const counters={sourceBindings:0,inputBindings:0,outputBindings:0,archiveBindings:0,priorSealBindings:0};
const check=async(p,d,k)=>{assert.equal(digest(await readFile(p)),d,p);counters[k]++;};
const selected=await read(`${folder}/selected-runs.json`),statuses=[];
for(const file of (await readdir(out)).filter(n=>n.endsWith('-status.json'))){
  const s=await read(`${out}/${file}`);assert(['passed','failed'].includes(s.state));assert(s.completedUTC&&s.sourceUnchanged&&s.inputUnchanged);
  for(const [p,d] of Object.entries(s.sourceBefore))await check(`${folder}/source-archives/${d}/${basename(p)}`,d,'archiveBindings');
  for(const [p,d] of Object.entries(s.inputBefore))await check(p,d,'inputBindings');
  for(const [p,d] of Object.entries(s.outputHashes))await check(p,d,'outputBindings');
  statuses.push(s);
}
for(const name of Object.values(selected).flat()){
  const s=statuses.find(s=>s.name===name);assert(s&&s.state==='passed'&&s.code===0);assert((await read(`${out}/${name}.json`)).passed);
  const visited=new Set();
  async function visit(p){
    p=relative(process.cwd(),resolve(p)).replaceAll('\\','/');if(visited.has(p))return;visited.add(p);
    assert(s.sourceBefore[p],p);await check(p,s.sourceBefore[p],'sourceBindings');
    if(p.endsWith('.jl'))for(const m of (await readFile(p,'utf8')).matchAll(/^\s*include\("([^"]+)"\)/gm))await visit(resolve(dirname(p),m[1]));
  }
  await visit(s.script);await visit(`${folder}/run.mjs`);await visit(`${folder}/protocol.md`);
}
const temporal=statuses.find(s=>s.name===selected.temporal);
for(const name of selected.native)for(const suffix of ['.json','-real-final.bin']){
  const p=`${out}/${name}${suffix}`;assert(temporal.inputBefore[p]);await check(p,temporal.inputBefore[p],'inputBindings');
}
async function walk(p){let paths=[];for(const e of await readdir(p,{withFileTypes:true})){const q=`${p}/${e.name}`;if(e.isDirectory())paths.push(...await walk(q));else paths.push(q);}return paths;}
for(const [base,expected] of [
  ['earth-native-graph-wind-20261014','8c9869d799dc7b7da8bd955de8a9cacd1c843722de8926bb10ddc1bc94cd6536'],
  ['earth-rotating-graph-20261014','bccc6cf74351355e7c3c799c4767684b2fa06a2de73b0a2d67ca057ed5e376e8'],
  ['earth-covariant-momentum-20261014','fa83192f5dd1dd2627734a6eaff9a6a2d546181ae24ac5d07fe45d93f834633c']]){
  const p=`docs/evidence/${base}/manifest.json`,m=await read(p);await check(p,expected,'priorSealBindings');
  assert.deepEqual((await walk(dirname(p))).sort(),[p,...m.bindings.map(b=>b.path)].sort());
  for(const b of m.bindings)await check(b.path,b.sha256,'priorSealBindings');
}
const frozen=JSON.parse(execFileSync(process.execPath,['docs/evidence/earth-native-graph-wind-20261014/check-frozen.mjs'],{encoding:'utf8'}));
assert(frozen.passed&&frozen.formalDefaultUnchanged);
const project=await read(`${out}/project-checks.json`);assert(project.passed&&project.tests===278);
for(const r of project.rows){assert.equal(r.code,0);await check(r.log,r.sha256,'outputBindings');}
const plot=await read(`${out}/plot-provenance.json`);assert(plot.passed);
for(const [p,d] of Object.entries(plot.sourceHashes))await check(p,d,'sourceBindings');
for(const [p,d] of Object.entries(plot.inputHashes))await check(p,d,'inputBindings');
await check(`${out}/convergence.png`,plot.outputSHA256,'outputBindings');
const sourceHashes=Object.fromEntries(await Promise.all(['run.mjs','seal.mjs','verify-source.mjs','verify-seal.mjs','project-checks.mjs','test-source.mjs','plot.py','selected-runs.json'].map(async f=>[`${folder}/${f}`,digest(await readFile(`${folder}/${f}`))])));
const result={passed:true,selectedCount:Object.values(selected).flat().length,statusCount:statuses.length,retainedFailed:statuses.filter(s=>s.state==='failed').map(s=>s.name).sort(),counters,frozen,sourceHashes};
await writeFile('build/c7-independent-review/provenance-v1.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
