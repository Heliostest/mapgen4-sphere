import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const doc='docs/evidence/earth-speedy-transport-20261013/',out='build/earth-speedy-transport/';
const read=p=>readFileSync(resolve(root,p));
const sha=p=>createHash('sha256').update(read(p)).digest('hex');
const json=p=>JSON.parse(read(p).toString('utf8'));
const log=p=>{const b=read(p);return b.toString(b[0]===255&&b[1]===254?'utf16le':'utf8');};
const frozen='8258dab6422c7ea2a245492e94c8c9eb06fad5244a0cbef851ee43094e048db0';
assert.equal(sha(doc+'surface-evaporation-corrected.jl'),frozen);
assert.equal(sha(doc+'surface-evaporation-test.jl'),'87e2449784dd9e91fe359b3527a909cb1bbe7470eafc1410940f7b45a752836f');
assert.match(log(out+'surface-evaporation-red.log'),/9 passed, 13 failed, 0 errored, 0 broken/);
const green=log(out+'surface-evaporation-green-snow.log');
assert.match(green,/22\s+22/);assert.match(green,/324\s+324/);
assert.doesNotMatch(green,/Test Failed|ERROR:|Some tests did not pass/);
const snap=json(out+'surface-evaporation-snapshot.json');
assert.equal(snap.scriptSHA256,sha(doc+'surface-evaporation-snapshot.jl'));
assert.equal(snap.weightsSHA256,sha(out+'diagnostic-weights.json'));
assert.equal(snap.results.length,4);
for(const r of snap.results){
 assert.equal(r.sha256,sha(out+r.source));
 assert.equal(r.regions.length,2);
 for(const s of r.regions){
  assert.ok(Number.isFinite(s.sameInputNativeEMmDay)&&Number.isFinite(s.sameInputCorrectedEMmDay));
  assert.ok(s.sameInputCorrectedEMmDay>=s.sameInputNativeEMmDay);
  assert.ok(s.negativeWarmUnsaturatedArea<=s.negativeUnsaturatedArea+1e-14);
 }
}
const july=snap.results[0].regions.find(r=>r.name==='India native land');
assert.equal(snap.results[0].clock,'2006-07-01T00:00:00');
assert.ok(july.negativeWarmUnsaturatedArea>.96);
const fields=json(doc+'surface-evaporation-candidate-fields-snapshot.json');
assert.equal(fields.cases.length,5);
assert.ok(fields.cases.every(c=>c.stage==='same-2006-state-one-year-sensitivity'&&c.regions.length===16));
const pkg='build/earth-speedyweather/depot/packages/SpeedyWeather/qRu16/src/parameterizations/';
const files=[...['surface-evaporation-corrected.jl','surface-evaporation-test.jl','surface-evaporation-snapshot.jl',
 'surface-evaporation-report.md','surface-evaporation-verify.mjs','surface-evaporation-candidate-fields-snapshot.json',
 'circulation-followup.md','convection-LICENSE.txt'].map(x=>doc+x),
 ...['surface-evaporation-red.log','surface-evaporation-green.log','surface-evaporation-green-final.log',
 'surface-evaporation-green-complete.log','surface-evaporation-green-snow.log','surface-evaporation-snapshot.json',
 'surface-evaporation-snapshot-complete.log','diagnostic-weights.json',...snap.results.map(r=>r.source)].map(x=>out+x),
 ...['surface_fluxes/humidity.jl','surface_fluxes/surface_condition.jl','surface_fluxes/heat.jl',
 'land/vegetation.jl','land/geometry.jl','land/thermodynamics.jl','land/soil_moisture.jl','land/soil_temperature.jl'].map(x=>pkg+x)];
const record={schema:'isolated-surface-evaporation-verification-v1',verifiedUTC:new Date().toISOString(),
 frozenImplementationSHA256:frozen,julia:'1.12.7',speedyWeather:'0.23.0',threads:{julia:1,blas:1},
 executions:{nativeRegression:{exitCode:1,passed:9,failed:13,errored:0,expectedFailure:true},
 correctedRegression:{exitCode:0,passed:346,failed:0,breakdown:{thermodynamic:22,mixedWaterHeatAndSnow:324}},
 snapshot:{exitCode:0,modelSteps:0,checkpoints:4}},
 statusProvenance:'Exit codes from completed Julia tool calls; this script rechecks persisted outputs and bindings, not rerun Julia. Initial red test first 22 assertions unchanged; later mixed-test parser repair and added 54 expected-flux assertions affect only the second testset.',
 claims:{frozenIncludeUnchanged:true,positiveEvaporationUnchanged:true,instantaneousWaterHeatAccountingPass:true,
 timeIntegratedBudgetVerified:false,seasonalMonsoonFixed:false,soilAdsorptionImplemented:false,fullRepositoryTestsRun:false},
 limitations:['Current checkpoint land state and stored availability/drag are explicitly distinguished from pre-update stored E.',
 'Original availability does not represent a soil adsorption closure; no universal assertion that unsaturated soil cannot adsorb water.',
 'CPU Float64 two-soil-layer/eight-atmosphere-layer fixed-state fixtures do not test runoff/clipping, variable heat capacity or long integration.',
 'Mutable root report/comparison/candidate aggregates are intentionally not hash-bound; the five-case diagnostic snapshot is bound.'],
 files:files.map(path=>({path,sha256:sha(path),bytes:read(path).length}))};
writeFileSync(resolve(root,doc+'surface-evaporation-verification.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({ok:true,files:files.length,red:'9 pass / 13 expected fail',green:346,frozen,july}));
