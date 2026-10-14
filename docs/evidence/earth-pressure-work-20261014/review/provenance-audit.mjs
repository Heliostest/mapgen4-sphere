import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,basename,resolve,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root='docs/evidence/earth-pressure-work-20261014',out='build/earth-pressure-work',scratch='build/c8-independent-review';
const sha=b=>createHash('sha256').update(b).digest('hex');
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const check=async(p,d)=>assert.equal(sha(await readFile(p)),d,p);
const walk=async d=>(await Promise.all((await readdir(d,{withFileTypes:true})).map(async e=>e.isDirectory()?await walk(`${d}/${e.name}`):[`${d}/${e.name}`]))).flat();
const ancestors=[
['earth-conservative-accuracy-20261013','9c2624a29cff97d7cd74dd118ac39cc4e71141852561ebaf2b00aa8150f64cd2'],
['earth-polar-pressure-20261014','cb95e9a55efac60795367edebe119e601bc984d941c2f7b76f595f483070eb8e'],
['earth-native-graph-wind-20261014','8c9869d799dc7b7da8bd955de8a9cacd1c843722de8926bb10ddc1bc94cd6536'],
['earth-rotating-graph-20261014','bccc6cf74351355e7c3c799c4767684b2fa06a2de73b0a2d67ca057ed5e376e8'],
['earth-covariant-momentum-20261014','fa83192f5dd1dd2627734a6eaff9a6a2d546181ae24ac5d07fe45d93f834633c'],
['earth-compatible-momentum-20261014','c0d8e047bb577bb6b689a128639c8e4b9dcf6cf3fe6f4eee8ed74f589ceedfeb']];
const preserved=[];
for(const [name,digest] of ancestors){
 const dir=`docs/evidence/${name}`,p=`${dir}/manifest.json`;await check(p,digest);const m=await json(p);
 for(const b of m.bindings)await check(b.path,b.sha256);
 assert.deepEqual((await walk(dir)).sort(),[p,...m.bindings.filter(b=>b.path.startsWith(`${dir}/`)).map(b=>b.path)].sort(),`membership ${name}`);
 preserved.push({candidate:name,boundFiles:m.bindings.length,manifestSHA256:digest});
}
const c2=await json(`docs/evidence/${ancestors[0][0]}/manifest.json`);await check(c2.c1Snapshot.path,c2.c1Snapshot.sha256);
const snap=await json(c2.c1Snapshot.path);for(const b of snap.c1bindings)await check(b.path,b.sha256);
assert.deepEqual([...(await walk('docs/evidence/earth-conservative-transport-20261013')),...await walk('build/earth-conservative-transport')].sort(),snap.c1bindings.map(b=>b.path).sort());
preserved.unshift({candidate:'C1',boundFiles:snap.c1bindings.length,snapshotSHA256:c2.c1Snapshot.sha256});
const base='6a7589687ec075cde17d7d79ef622f96c5520378';
const defaultPath='scenes/earth-land-sea/earth-simulation.json';
assert.equal(sha(await readFile(defaultPath)),sha(execFileSync('git',['show',`${base}:${defaultPath}`],{maxBuffer:128*1024*1024})));
const trackedDiff=execFileSync('git',['diff','--name-only',base],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
assert(trackedDiff.every(p=>p==='.gitattributes'||p.startsWith(`${root}/`)),`Unexpected tracked change: ${trackedDiff}`);
const selection=await json(`${root}/selected-runs.json`),selected=Object.values(selection).flat(),rows=[];
const currentClosure=async s=>{
 const seen=new Set();
 async function visit(p){p=relative(process.cwd(),resolve(p)).replaceAll('\\','/');if(seen.has(p))return;seen.add(p);assert(s.sourceBefore[p],`unbound current ${p}`);await check(p,s.sourceBefore[p]);
 if(p.endsWith('.jl'))for(const m of (await readFile(p,'utf8')).matchAll(/\binclude\("([^"]+)"\)/g))await visit(resolve(dirname(p),m[1]));}
 await visit(s.script);await visit(`${root}/run.mjs`);await visit(`${root}/protocol.md`);return seen.size;
};
let selectedAssertions=0;
for(const p of (await readdir(out)).filter(p=>p.endsWith('-status.json')).sort()){
 const s=await json(`${out}/${p}`);const wanted=selected.includes(s.name);
 if(s.state==='running'){rows.push({name:s.name,state:s.state,selected:wanted});continue;}
 assert(['passed','failed'].includes(s.state)&&s.completedUTC,`incomplete ${s.name}`);
 assert(s.sourceUnchanged&&s.inputUnchanged,`changed ${s.name}`);
 assert.deepEqual(s.sourceBefore,s.sourceAfter);assert.deepEqual(s.inputBefore,s.inputAfter);
 for(const [p,d] of Object.entries(s.sourceBefore))await check(`${root}/source-archives/${d}/${basename(p)}`,d);
 for(const [p,d] of Object.entries(s.inputBefore))await check(p,d);
 for(const [p,d] of Object.entries(s.outputHashes))await check(p,d);
 let closure=null,count=null;
 if(wanted){assert(s.state==='passed'&&s.code===0);closure=await currentClosure(s);assert((await json(`${out}/${s.name}.json`)).passed);
  const log=await readFile(`${out}/${s.name}.log`,'utf8');const last=log.trim().split(/\r?\n/).at(-1);const match=last.match(/\|\s+(\d+)\s+(\d+)\s+/);assert(match,`test count ${s.name}: ${last}`);assert.equal(match[1],match[2]);count=Number(match[1]);selectedAssertions+=count;
 }
 rows.push({name:s.name,state:s.state,selected:wanted,currentClosure:closure,assertions:count,archivedSources:Object.keys(s.sourceBefore).length,outputs:Object.keys(s.outputHashes).length});
}
const project=await json(`${out}/project-checks.json`);assert(project.passed&&project.tests===278&&project.rows.every(r=>r.code===0));for(const r of project.rows)await check(r.log,r.sha256);
const source=await json(`${out}/c8-source-v1.json`);assert(source.passed&&source.checks===7);for(const [p,d] of Object.entries(source.sourceHashes))await check(p,d);
const iterationRows=[];
for(let i=0;i<selection.iterations.length;i++){
 const name=selection.iterations[i],entry=rows.find(r=>r.name===name);
 if(entry?.state!=='passed')continue;
 const s=await json(`${out}/${name}-status.json`),t=await json(`${out}/${name}.json`),nativeName=selection.native[i],n=await json(`${out}/${nativeName}.json`);
 assert.equal(t.nativeName,nativeName);assert.equal(t.dt,[1800,900,450,225][i]);assert.equal(t.duration,21600);assert.equal(t.trace.length,21600/t.dt);
 assert.deepEqual(s.extra,[nativeName]);assert(t.literalBitFinalPressureVelocity&&t.aggregatesExactlyMatch);
 assert.deepEqual(t.matchedCases,n.results.map(r=>r.case));
 const counts=t.trace.map((r,j)=>{assert.equal(r.step,j+1);assert.equal(r.time,(j+1)*t.dt);assert(Number.isInteger(r.iterations)&&r.iterations>=0&&r.iterations<=30);assert(Number.isInteger(r.backtracks)&&r.backtracks>=0);assert(Number.isFinite(r.residual)&&r.residual>=0&&r.residual<=2e-14);assert(r.equationP>=0&&r.equationP<5e-12&&r.equationV>=0&&r.equationV<5e-12);assert(Number.isFinite(r.energyAbsolute)&&Number.isFinite(r.energyAllowance)&&r.energyAbsolute>=0&&r.energyAbsolute<=r.energyAllowance);return r.iterations;});
 for(const r of n.results){
  assert.equal(counts.reduce((a,b)=>a+b,0),r.totalIterations);assert.equal(Math.max(...counts),r.maxIterations);assert.equal(t.trace.reduce((a,b)=>a+b.backtracks,0),r.backtracks);assert.equal(Math.max(...t.trace.map(r=>r.residual)),r.maxNonlinearResidual);assert.equal(Math.max(...t.trace.map(r=>Math.max(r.equationP,r.equationV))),r.maxEquationRelative);
  const p=`${out}/${nativeName}-${r.case}-final.bin`;assert(s.inputBefore[p]);await check(p,s.inputBefore[p]);
 }
 const p=`${out}/${nativeName}.json`;assert(s.inputBefore[p]);await check(p,s.inputBefore[p]);
 iterationRows.push({name,nativeName,steps:t.trace.length,total:counts.reduce((a,b)=>a+b,0),min:Math.min(...counts),max:Math.max(...counts),matchedCases:t.matchedCases});
}
const plot=await json(`${out}/plot-provenance.json`);assert(plot.passed);for(const [p,d] of Object.entries({...plot.sourceHashes,...plot.inputHashes}))await check(p,d);await check(`${out}/convergence.png`,plot.outputSHA256);
const complete=selected.every(n=>rows.some(r=>r.name===n&&r.state==='passed'));
if(complete){assert.equal(selectedAssertions,365);assert.equal(selected.length,15);assert.equal(rows.length,31);assert.equal(iterationRows.length,4);}
const result={passed:true,complete,preserved,formalDefaultUnchanged:true,trackedDiff,selectedAssertions,selectedExpectedAssertions:365,selectedRuns:selected.length,attempts:rows.length,rows,iterationRows,projectTests:278,sourceChecks:7,plotBindings:true};
await writeFile(`${scratch}/provenance-audit-results.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
