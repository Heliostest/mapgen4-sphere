import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-moisture-structural-20261011',base='e3222280a0ceddd597245f3c45d75f75d2def9f5',label=process.argv[2]??'candidate';
const sha=b=>createHash('sha256').update(b).digest('hex');
const defaults=[];
for(const path of ['scenes/earth-land-sea/earth-simulation.json','scenes/earth-land-sea/scene-config.json','config.js','environment.ts','surface-grid.ts','climate.ts']){
 const bytes=await readFile(path);assert.equal(sha(bytes),sha(execFileSync('git',['show',`${base}:${path}`],{maxBuffer:30e6})),path);
 defaults.push({path,sha256:sha(bytes),unchangedAgainstBase:true});
}
const formal=JSON.parse(await readFile(defaults[0].path,'utf8'));
assert.equal(formal.runtime.waterConfig.moistureScheme,undefined);assert.equal(formal.runtime.config.airRadiationFraction,undefined);assert.equal(formal.runtime.refinement,undefined);
const runNames=['baseline-1800',...[1800,900,450].map(dt=>`${label}-${dt}`)],runs=[];
const initial=JSON.parse(await readFile('build/earth-moisture-structural/baseline-1800-day0.json','utf8')).runtime.state;
for(const name of runNames){
 const run=JSON.parse(await readFile(`${folder}/${name}-continuous.json`,'utf8'));
 assert.equal(run.inputSha256,defaults[0].sha256);assert.equal(run.records.at(-1).day,365);assert.equal(run.strictRestoreNextStepExact,true);
 const bundle=`build/earth-moisture-structural/integrate-${run.label}.mjs`;
 assert.equal(run.bundleSha256,sha(await readFile(bundle)));
 const start=JSON.parse(await readFile(run.records[0].file,'utf8')).runtime.state;
 for(const key of Object.keys(initial)){
  if(key==='stepS')continue;
  if(key==='water'){
   for(const field of Object.keys(initial.water))assert.deepEqual(start.water[field],initial.water[field],`Initial ${name} water.${field}`);
   if(start.water.landPrecipitationKgM2S)start.water.landPrecipitationKgM2S.forEach((p,k)=>assert.equal(p,start.water.precipitationKgM2S[k]*start.land[k]));
  }else assert.deepEqual(start[key],initial[key],`Initial ${name} ${key}`);
 }
 for(const r of run.records)assert.equal(r.sha256,sha(await readFile(r.file)),r.file);
 const physical={air:Float64Array.from(start.thermal.temperatureK),land:Float64Array.from(start.thermal.landTemperatureK),sea:Float64Array.from(start.thermal.oceanTemperatureK),
  water:Object.fromEntries(['atmosphereKgM2','soilKgM2','surfaceKgM2','snowKgM2','seaIceKgM2','landIceKgM2','shelfLandIceKgM2','shelfSeaIceKgM2','oceanGlobalKgM2'].map(k=>[k,k==='oceanGlobalKgM2'?start.water[k]:Float64Array.from(start.water[k])]))};
 const initialStocksSha256=sha(JSON.stringify(physical));
 if(run.initialStocksSha256)assert.equal(run.initialStocksSha256,initialStocksSha256);
 runs.push({name,initialStocksSha256,initialStocksHashSource:run.initialStocksSha256?'Recorded during integration and independently verified':'Derived from original preserved day-zero snapshot; old baseline harness did not emit this field',bundle,bundleSha256:run.bundleSha256,snapshots:run.records.map(r=>({day:r.day,path:r.file,sha256:r.sha256}))});
}
assert.ok(runs.every(r=>r.initialStocksSha256===runs[0].initialStocksSha256));
const finalRun=JSON.parse(await readFile(`${folder}/final-compatibility-1800-continuous.json`,'utf8'));
const frozenRun=JSON.parse(await readFile(`${folder}/${label}-1800-continuous.json`,'utf8'));
assert.equal(finalRun.strictRestoreNextStepExact,true);assert.equal(finalRun.records.at(-1).day,24);
assert.equal(finalRun.initialStocksSha256,frozenRun.initialStocksSha256);
const finalBundle='build/earth-moisture-structural/integrate-final-compatibility.mjs';
assert.equal(finalRun.bundleSha256,sha(await readFile(finalBundle)));
const equivalentSnapshots=[];
for(const fresh of finalRun.records){
 const frozen=frozenRun.records.find(r=>r.day===fresh.day);assert.ok(frozen);
 assert.equal(fresh.sha256,sha(await readFile(fresh.file)));
 const a=JSON.parse(await readFile(fresh.file,'utf8')),b=JSON.parse(await readFile(frozen.file,'utf8'));
 assert.deepEqual(a.runtime,b.runtime,`Final source matches frozen physics at day ${fresh.day}`);
 equivalentSnapshots.push({day:fresh.day,finalPath:fresh.file,finalSha256:fresh.sha256,frozenPath:frozen.file,frozenSha256:frozen.sha256,entireRuntimeExactlyEqual:true});
}
await writeFile(`${folder}/final-source-equivalence.json`,JSON.stringify({finalBundle,sha256:finalRun.bundleSha256,strictRestoreNextStepExact:true,actualDays:24,
 explanation:'Final changes concern old refined save compatibility, refined diagnostics and UI; the full-year comparison uses classic terrain. A final-source actual integration from identical initial stocks is exactly equal at days 0 and 24 to the preserved classic physics bundle.',snapshots:equivalentSnapshots},null,2)+'\n');
const productHashes=[];
for(const path of ['circulation.ts','water.ts','reference-moisture.ts','refinement-surface.ts','runtime-state.ts','thermal-runtime.ts','climate-diagnostics.ts','planet-controls.ts','scenes/earth-land-sea/sidebar-zh.js','scripts/test.mjs','tests/circulation.test.ts','tests/moisture.test.ts','tests/simulation.test.ts','tests/refinement.test.ts','tests/climate-diagnostics.test.ts'])productHashes.push({path,sha256:sha(await readFile(path))});
const artifacts=[];for(const entry of (await readdir(folder,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name)))if(entry.isFile()&&entry.name!=='bindings.json')artifacts.push({path:`${folder}/${entry.name}`,sha256:sha(await readFile(`${folder}/${entry.name}`))});
await writeFile(`${folder}/bindings.json`,JSON.stringify({base,defaults,productHashes,runs,artifacts,initialPhysicalStateEqualAcrossRuns:true,addedInitialDiagnostic:'land precipitation = original column precipitation * original land fraction; no stock migration',screenshots:{earthRenderer:'PENDING: WebGL2 initialization fails; user chose to continue numerical acceptance. chrome://gpu was rejected automatically (HTTP/HTTPS-only policy). No Chrome restart authorized or performed.',numericCharts:'Actual-integration charts, explicitly separate from WebGL screenshots.'}},null,2)+'\n');
console.log('Verified unchanged formal defaults, all initial physical fields, identical inventory hashes, all bundles, all saved snapshots and final-source actual 24-day equivalence.');
