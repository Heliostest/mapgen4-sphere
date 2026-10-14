import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root='docs/evidence/earth-rotating-sigma-20261014',scratch='build/c9-independent-review',out='build/earth-rotating-sigma';
const hash=b=>createHash('sha256').update(b).digest('hex');
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const hashes=async paths=>Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async p=>[p,hash(await readFile(p))])));
const sourcePaths=(await readdir(root,{withFileTypes:true})).filter(e=>e.isFile()&&/\.(jl|mjs|py|md)$/.test(e.name)).map(e=>`${root}/${e.name}`);
sourcePaths.push('.gitattributes',`${root}/selected-runs.json`,'docs/evidence/earth-pressure-work-20261014/analytic.jl','docs/evidence/earth-native-graph-wind-20261014/check-frozen.mjs');
const inputPaths=['docs/evidence/earth-speedyweather-20261012/julia-env/Project.toml','docs/evidence/earth-speedyweather-20261012/julia-env/Manifest.toml'];
for(const name of ['v1-status.json','late-status.json']){
 const r=await json(`${scratch}/${name}`);assert(r.passed&&r.code===0&&r.sourceUnchanged);assert.deepEqual(r.sourceBefore,r.sourceAfter);
 for(const [p,d] of Object.entries({...r.sourceBefore,...r.outputHashes}))assert.equal(hash(await readFile(p)),d,p);
 sourcePaths.push(...Object.keys(r.sourceBefore));
}
for(const e of await readdir(out,{withFileTypes:true}))if(e.isFile()){
 inputPaths.push(`${out}/${e.name}`);
 if(e.name.endsWith('-status.json')){const r=await json(`${out}/${e.name}`);inputPaths.push(...Object.keys(r.inputBefore));}
}
const audit=await json(`${scratch}/audit-results.json`);assert(audit.passed);inputPaths.push(...audit.frozen.map(r=>r.path));
const sourceTest=await json(`${out}/c9-source-v1.json`);assert(sourceTest.passed&&sourceTest.checks===7);
for(const [p,d] of Object.entries(sourceTest.sourceHashes))assert.equal(hash(await readFile(p)),d,p);
const project=await json(`${out}/project-checks.json`);assert(project.passed&&project.tests===278&&project.rows.every(r=>r.code===0));
for(const r of project.rows)assert.equal(hash(await readFile(r.log)),r.sha256);
const plot=await json(`${out}/plot-provenance.json`);assert(plot.passed);
for(const [p,d] of Object.entries({...plot.sourceHashes,...plot.inputHashes}))assert.equal(hash(await readFile(p)),d,p);
assert.equal(hash(await readFile(`${out}/convergence.png`)),plot.outputSHA256);
const artifactPaths=(await readdir(scratch,{withFileTypes:true})).filter(e=>e.isFile()&&e.name!=='review-source-bindings.json').map(e=>`${scratch}/${e.name}`);
sourcePaths.push(...artifactPaths.filter(p=>/\.(jl|mjs)$/.test(p)));
const record={completed:true,actionableFindings:0,reviewer:'independent fresh-context C9 mathematical/code/evidence reviewer',
 createdUTC:new Date().toISOString(),base:'0041b1eebc24aafdcf784fcf50afb12bbf219819',branch:'codex/rotating-sigma-momentum',
 assertions:{independentNumerical:236,selectedNumerical:315,sourceBinding:7,application:278},
 reviewScope:'Declared finite-graph barotropic rotating sigma momentum, numerical evidence and preseal provenance. Does not claim sealing or postmerge verification already performed.',
 sourceHashes:await hashes(sourcePaths),inputHashes:await hashes(inputPaths),
 outputHashes:await hashes([`${scratch}/results.json`,`${scratch}/late-results.json`,`${scratch}/audit-results.json`,`${out}/convergence.png`]),
 reviewArtifactHashes:await hashes(artifactPaths)};
for(const group of ['sourceHashes','inputHashes','outputHashes','reviewArtifactHashes'])for(const [p,d] of Object.entries(record[group]))assert.equal(hash(await readFile(p)),d,p);
await writeFile(`${scratch}/review-source-bindings.json`,JSON.stringify(record,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({completed:true,actionableFindings:0,sourceFiles:Object.keys(record.sourceHashes).length,inputFiles:Object.keys(record.inputHashes).length,reviewArtifacts:Object.keys(record.reviewArtifactHashes).length,reviewSHA256:hash(await readFile(`${scratch}/review-source-bindings.json`)),coreSHA256:record.sourceHashes[`${root}/vector-core.jl`]}));
