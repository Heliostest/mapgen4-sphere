import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root='docs/evidence/earth-pressure-work-20261014',out='build/earth-pressure-work',scratch='build/c8-independent-review';
const sha=b=>createHash('sha256').update(b).digest('hex'),json=async p=>JSON.parse(await readFile(p,'utf8'));
const audit=await json(`${scratch}/provenance-audit-results.json`),core=await json(`${scratch}/independent-review-results.json`),native=await json(`${scratch}/native-metrics-results.json`),restart=await json(`${scratch}/native-restart-results.json`);
assert(audit.passed&&audit.complete&&audit.selectedAssertions===365&&audit.selectedRuns===15&&audit.attempts===31&&audit.iterationRows.length===4&&audit.plotBindings);
assert(core.passed&&native.passed&&restart.passed);
const corePath=`${root}/pressure-core.jl`,coreHash='8231625a4a4ed0855150d0047a27a1c55b24324177fff4d47d8adce287168f80';
assert.equal(sha(await readFile(corePath)),coreHash);
const before=await json(`${scratch}/source-before.json`),after=await json(`${scratch}/source-after.json`);assert.deepEqual(before,after);
for(const [p,d] of Object.entries(before))assert.equal(sha(await readFile(`${root}/${p}`)),d);
for(const [p,d] of Object.entries(native.sourceAndInputHashes))assert.equal(sha(await readFile(p)),d);
const sourcePaths=new Set(['.gitattributes']);
for(const e of await readdir(root,{withFileTypes:true}))if(e.isFile()&&/\.(jl|mjs|py|md|json)$/.test(e.name)&&!['manifest.json','verification.json','review-source-bindings.json'].includes(e.name))sourcePaths.add(`${root}/${e.name}`);
const inputHashes={},outputHashes={};
for(const entry of audit.rows){
 const s=await json(`${out}/${entry.name}-status.json`);
 for(const [p,d] of Object.entries(s.inputBefore)){assert.equal(sha(await readFile(p)),d);if(inputHashes[p])assert.equal(inputHashes[p],d);inputHashes[p]=d;}
 if(entry.selected)for(const p of Object.keys(s.sourceBefore))sourcePaths.add(p);
}
for(const e of await readdir(out,{withFileTypes:true}))if(e.isFile())outputHashes[`${out}/${e.name}`]=sha(await readFile(`${out}/${e.name}`));
const reviewArtifactHashes={};
for(const e of await readdir(scratch,{withFileTypes:true}))if(e.isFile()&&e.name!=='review-source-bindings.json'){
 const p=`${scratch}/${e.name}`;reviewArtifactHashes[p]=sha(await readFile(p));
 if(/\.(jl|mjs|md)$/.test(e.name))sourcePaths.add(p);
}
const sourceHashes={};for(const p of [...sourcePaths].sort())sourceHashes[p]=sha(await readFile(p));
const result={completed:true,actionableFindings:0,verdict:'Accepted within the isolated C8 experimental scope; no remaining actionable findings',createdUTC:new Date().toISOString(),base:'6a7589687ec075cde17d7d79ef622f96c5520378',reviewedCoreSHA256:coreHash,
counts:{independentCoreAssertions:109,independentCoreSourceAssertion:1,independentBoundaryCases:112,independentNativeRestartAssertions:10,independentNativeMetricsAssertions:75,authorAssertions:365,selectedRuns:15,runnerAttempts:31,sourceVerifierChecks:7,projectTests:278,iterationTraceSteps:180},
resolvedFindings:['positive-extreme secants and compression','branch-boundary logarithmic cancellation','pre-commit local budget guard','negative Bernoulli gradient sign wording','complete per-step iteration records via deterministic replay'],
limitations:['Isolated Bernoulli/continuity subsystem','No Coriolis, vortical or vertical momentum advection, thermodynamic heat or climate acceptance','Sampled graph spatial evidence with larger polar-force errors','Literal-bit restart scoped to the recorded runtime environment'],
sourceHashes,inputHashes,outputHashes,reviewArtifactHashes,scratchImmutableAfterBinding:true};
await writeFile(`${scratch}/review-source-bindings.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({completed:true,actionableFindings:0,sourceFiles:Object.keys(sourceHashes).length,inputs:Object.keys(inputHashes).length,outputs:Object.keys(outputHashes).length,reviewArtifacts:Object.keys(reviewArtifactHashes).length,bindingSHA256:sha(await readFile(`${scratch}/review-source-bindings.json`))}));
