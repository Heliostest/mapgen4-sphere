import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import assert from 'node:assert/strict';
import {verifySource} from '../../docs/evidence/earth-covariant-momentum-20261014/verify-source.mjs';
const folder='docs/evidence/earth-covariant-momentum-20261014',out='build/earth-covariant-momentum';
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const selected=await read(`${folder}/selected-runs.json`);let sourceCount=0,inputCount=0,outputCount=0;const runStates=[];
for(const filename of (await readdir(out)).filter(f=>f.endsWith('-status.json'))){
 const s=await read(`${out}/${filename}`);assert(['passed','failed'].includes(s.state));assert(s.completedUTC&&s.sourceUnchanged&&s.inputUnchanged);
 for(const [p,d] of Object.entries(s.sourceBefore)){assert.equal(hash(await readFile(`${folder}/source-archives/${d}/${basename(p)}`)),d);sourceCount++;}
 for(const [p,d] of Object.entries(s.inputBefore)){assert.equal(hash(await readFile(p)),d,p);inputCount++;}
 for(const [p,d] of Object.entries(s.outputHashes)){assert.equal(hash(await readFile(p)),d,p);outputCount++;}
 runStates.push({name:s.name,state:s.state});
}
const selectedNames=[selected.kernel,selected.analytic,selected.advection,selected.covariance,selected.temporal,...selected.native];
for(const name of selectedNames){await verifySource(await read(`${out}/${name}-status.json`));assert((await read(`${out}/${name}.json`)).passed);}
const project=await read(`${out}/project-checks.json`);assert(project.passed&&project.tests===278);
for(const r of project.rows){assert.equal(r.code,0);assert.equal(hash(await readFile(r.log)),r.sha256);}
const src=await read(`${out}/c6-source-v1.json`);assert(src.passed&&src.checks===7);
for(const [p,d] of Object.entries(src.sourceHashes))assert.equal(hash(await readFile(p)),d);
const plot=await read(`${out}/plot-provenance.json`);assert(plot.passed);
for(const [p,d] of Object.entries({...plot.sourceHashes,...plot.inputHashes}))assert.equal(hash(await readFile(p)),d);
assert.equal(hash(await readFile(`${out}/convergence.png`)),plot.outputSHA256);
const result={passed:true,selectedRuns:selectedNames.length,allRunStates:runStates,sourceArchiveBindings:sourceCount,inputBindings:inputCount,outputBindings:outputCount,projectEvidenceInspected:278,sourceBindingChecksInspected:7,projectTestsRerun:false};
await writeFile('build/c6-independent-review/provenance-audit.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
