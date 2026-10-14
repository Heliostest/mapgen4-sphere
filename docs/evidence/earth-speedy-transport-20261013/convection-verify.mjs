import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const doc='docs/evidence/earth-speedy-transport-20261013/';
const out='build/earth-speedy-transport/';
const pkg='build/earth-speedyweather/depot/packages/SpeedyWeather/qRu16/';
const read=p=>readFileSync(resolve(root,p));
const sha=p=>createHash('sha256').update(read(p)).digest('hex');
const json=p=>JSON.parse(read(p).toString('utf8'));
const log=p=>{const b=read(p);return b.toString(b[0]===255&&b[1]===254?'utf16le':'utf8');};
const frozen='1013b8b2b122dec190066a1d2d5fb0fc5e5eff105fb6285796e1f4116168458f';
assert.equal(sha(doc+'convection-corrected.jl'),frozen,'Frozen include changed');
const audit=json(out+'convection-audit.json');
for(const [p,h] of Object.entries(audit.sourceSHA256)) assert.equal(sha(pkg+p),h,'Installed source changed: '+p);
const red=log(out+'convection-red.log'),green=log(out+'convection-green.log');
assert.match(red,/2 passed, 2 failed, 0 errored, 0 broken/);
assert.match(green,/1408\s+1408/);assert.match(green,/85\s+85/);assert.match(green,/4\s+4/);
assert.doesNotMatch(green,/Test Failed|ERROR:|Some tests did not pass/);
const snapshot=json(out+'convection-july-snapshot.json');
assert.equal(snapshot.implementationSHA256,frozen);
assert.equal(snapshot.checkpointSHA256,sha(out+'diagnostic-july-start.jld2'));
assert.equal(snapshot.weightsSHA256,sha(out+'diagnostic-weights.json'));
assert.equal(snapshot.result.length,2);
for(const s of snapshot.result){
  assert.equal(s.columns.pq.length,3168);
  assert.equal(s.columns.pt.length,3168);
  for(const r of s.regions) assert.ok(Math.abs(r.deepAreaFraction+r.shallowAreaFraction+r.noBuoyancyAreaFraction-1)<1e-12);
}
const bench=json(out+'convection-bench.json');
const chosen=bench.convergence.find(r=>r.maxstep===.1&&r.n===8);
assert.ok(Math.abs(chosen.temperatureErrorK)<.002);
assert.ok(Math.abs(chosen.humidityError)<4e-7);
assert.equal(bench.times.length,4);
assert.ok(bench.times.every(r=>r.columns===3168&&r.samples.length===7&&r.samples.every(x=>Number.isFinite(x)&&x>0)));
const files=[
  ...['convection-corrected.jl','convection-test.jl','convection-audit.jl','convection-bench.jl',
      'convection-july-snapshot.jl','convection-report.md','convection-LICENSE.txt','convection-verify.mjs','review-parcel.md'].map(p=>doc+p),
  ...['convection-audit.json','convection-red.log','convection-green.log','convection-bench.json',
      'convection-bench.log','convection-july-snapshot.json','convection-july-snapshot.log',
      'diagnostic-july-start.jld2','diagnostic-weights.json'].map(p=>out+p),
  'build/earth-speedy-moisture-monsoon/coupled-seasonal-statistics.json',
  'build/earth-speedy-moisture-monsoon/coupled-seasonal-geometry.json',
  ...Object.keys(audit.sourceSHA256).map(p=>pkg+p)
];
const record={schema:'isolated-convection-verification-v1',verifiedUTC:new Date().toISOString(),
  frozenImplementationSHA256:frozen,julia:'1.12.7',speedyWeather:'0.23.0',threads:{julia:1,blas:1},
  executions:{
    nativeRegression:{exitCode:1,passed:2,failed:2,errored:0,expectedFailure:true},
    correctedRegression:{exitCode:0,passed:1497,failed:0,breakdown:{parcel:1408,wrapperBudgetAndInterval:85,regression:4}},
    convergenceAndThroughput:{exitCode:0,chosenMaxLogPressureStep:.1,chosen},
    julySnapshot:{exitCode:0,clock:snapshot.clock,columns:3168,modelSteps:0}
  },
  statusProvenance:'Execution exit codes recorded from completed Julia tool calls; assertions here recheck persisted outputs and bindings, not rerun Julia.',
  claims:{installedAuditSourcesUnchanged:true,frozenIncludeUnchanged:true,isolatedWaterAndEnthalpyConstraintsPass:true,
    coupledTimeIntegrationBudgetVerified:false,seasonalMonsoonFixed:false,fullRepositoryTestsRun:false},
  limitations:['Pressure-coordinate dilute cp/Lv integration replaces old environmental-geopotential Euler lapse rate.',
    'Float32 root temperature tolerance does not imply a uniform 0.4 J/kg enthalpy bound.',
    'Interval invariance tests are not Leapfrog stability or checkpoint restart tests.',
    'Snapshot is a same-input instantaneous first-guess counterfactual, not a seasonal frequency or rainfall prediction.',
    'Benchmark uses monthly-mean fixture and warmed helper timings; concurrent host load varies.'],
  files:files.map(path=>({path,sha256:sha(path),bytes:read(path).length}))};
writeFileSync(resolve(root,doc+'convection-verification.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({ok:true,files:files.length,frozen,red:'2 pass / 2 expected fail',green:1497,
  checkpointBound:true,benchmarkErrorK:chosen.temperatureErrorK}));
