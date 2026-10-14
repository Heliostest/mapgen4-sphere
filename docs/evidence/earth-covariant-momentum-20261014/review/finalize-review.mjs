import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const hash=b=>createHash('sha256').update(b).digest('hex');
let frozenBindings=0;
for(const p of ['docs/evidence/earth-native-graph-wind-20261014/manifest.json','docs/evidence/earth-rotating-graph-20261014/manifest.json']){
 const m=JSON.parse(await readFile(p,'utf8'));
 for(const b of m.bindings){assert.equal(hash(await readFile(b.path)),b.sha256,b.path);frozenBindings++;}
}
const f='docs/evidence/earth-covariant-momentum-20261014/';
const sources=['momentum.jl','advection-core.jl','common.jl','analytic.jl','native-run.jl','compare-time.jl','test-momentum.jl','test-advection.jl','test-covariance.jl','run.mjs','seal.mjs','verify-source.mjs','test-source.mjs','verify-seal.mjs','project-checks.mjs','plot.py','protocol.md','selected-runs.json','report.md','README.md','CURRENT-STATE.md'];
const sourceHashes=Object.fromEntries(await Promise.all(sources.map(async p=>[f+p,hash(await readFile(f+p))])));
const record={completed:true,actionableFindings:0,reviewer:'/root/review_c6',base:'1fa1cd0',assessment:'Ready for a scoped experimental commit after sealing; no application-default promotion',resolvedFindings:[{priority:'P3',file:f+'report.md',description:'Removed unsupported smoothness certification claim.'},{priority:'P3',file:f+'report.md',description:'Renamed -nabla_U U as covariant advection tendency, not material acceleration.'}],independentAssertions:323,randomDenseCases:60,checkpointBitAudit:{cases:3,stepsPerCase:4,method:'UInt64 view equality for all arrays and Float64 time'},frozenC4C5Bindings:frozenBindings,sourceHashes,notRerun:['Full selected analytic/covariance/native refinement matrix','278 project tests'],declinedToJudge:['C5 nonlinear edge feedback and fully coupled physical dynamics','Exact global angular momentum, potential vorticity or total thermodynamic energy conservation','Second-order momentum transport or long-time climate validation','Production performance and cross-runtime bitwise reproducibility']};
await writeFile('build/c6-independent-review/review-source-bindings.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({completed:true,actionableFindings:0,independentAssertions:323,frozenC4C5Bindings:frozenBindings,sourceFiles:sources.length,sourceHashes}));
