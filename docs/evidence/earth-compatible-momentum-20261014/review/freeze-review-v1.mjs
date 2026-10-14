import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,dirname} from 'node:path';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-compatible-momentum-20261014',scratch='build/c7-independent-review',out='build/earth-compatible-momentum';
const hash=b=>createHash('sha256').update(b).digest('hex');
const sourceFiles=new Set(['.gitattributes','docs/evidence/earth-native-graph-wind-20261014/check-frozen.mjs']);
async function visit(file){
  const p=relative(process.cwd(),resolve(file)).replaceAll('\\','/');if(sourceFiles.has(p))return;sourceFiles.add(p);
  if(p.endsWith('.jl'))for(const m of (await readFile(p,'utf8')).matchAll(/^\s*include\("([^"]+)"\)/gm))await visit(resolve(dirname(p),m[1]));
}
for(const e of await readdir(folder,{withFileTypes:true}))if(e.isFile()&&e.name!=='review-source-bindings.json')await visit(`${folder}/${e.name}`);
for(const e of await readdir(scratch,{withFileTypes:true}))if(e.isFile()&&/\.(jl|mjs)$/.test(e.name))await visit(`${scratch}/${e.name}`);
const sourceHashes=Object.fromEntries(await Promise.all([...sourceFiles].sort().map(async p=>[p,hash(await readFile(p))])));
const artifactHashes=Object.fromEntries(await Promise.all((await readdir(scratch)).filter(p=>p.endsWith('.json')).sort().map(async f=>[`${scratch}/${f}`,hash(await readFile(`${scratch}/${f}`))])));
const selected=JSON.parse(await readFile(`${folder}/selected-runs.json`,'utf8'));
const evidencePaths=[`${out}/project-checks.json`,`${out}/plot-provenance.json`,`${out}/convergence.png`,...Object.values(selected).flat().flatMap(n=>[`${out}/${n}.json`,`${out}/${n}-status.json`])];
const evidenceHashes=Object.fromEntries(await Promise.all(evidencePaths.sort().map(async p=>[p,hash(await readFile(p))])));
const provenance=JSON.parse(await readFile(`${scratch}/provenance-v1.json`,'utf8'));
for(const [p,d] of Object.entries(provenance.sourceHashes))assert.equal(sourceHashes[p],d,p);
for(const f of ['probes-v2','ode-v2','native-audit-v1']){
  const r=JSON.parse(await readFile(`${scratch}/${f}.json`,'utf8'));assert(r.passed);
  for(const [p,d] of Object.entries(r.sourceAfter??r.sourceHashes))assert.equal(sourceHashes[`${folder}/${p}`],d,p);
}
const record={completed:true,reviewer:'/root/review_c7',base:'b8c0fce',actionableFindings:0,independentNumericalAssertions:64,
  resolvedFindings:['Near-rest false rejection by relative-only complete-energy guard','Unresolved edge component preservation scoped to transport substep'],
  selectedRuns:10,historicalRuns:17,retainedFailedRuns:5,provenanceCounters:provenance.counters,
  scope:'Scoped fixed-reference nonlinear split-form coupling; no full physical momentum, thermodynamic energy, climate, cross-runtime binary, or formal-default acceptance.',
  sourceHashes,reviewArtifactHashes:artifactHashes,evidenceHashes};
const target=`${folder}/review-source-bindings.json`;await writeFile(target,JSON.stringify(record,null,2)+'\n',{flag:'wx'});
for(const [p,d] of Object.entries(sourceHashes))assert.equal(hash(await readFile(p)),d,p);
console.log(JSON.stringify({completed:true,actionableFindings:0,numericalAssertions:64,sourceFiles:Object.keys(sourceHashes).length,reviewArtifacts:Object.keys(artifactHashes).length,evidenceFiles:Object.keys(evidenceHashes).length,reviewBindingsSHA256:hash(await readFile(target))}));
