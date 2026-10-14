// Read-only climate summary; snapshots mutable root aggregates before interpreting them.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const d='docs/evidence/earth-speedy-transport-20261013',b='build/earth-speedy-transport';
const hash=x=>createHash('sha256').update(x).digest('hex');
const bindings={};
async function snapshot(name) {
 const original=`${d}/${name}.json`;
 const copy=`${b}/v3-climate-review-annual-${name}.json`;
 let data;
 try{data=await readFile(copy);}catch(e){if(e.code!=='ENOENT')throw e;data=await readFile(original);await writeFile(copy,data);}
 bindings[copy]=hash(data);
 return JSON.parse(data);
}
const fields=await snapshot('candidate-fields'),comparison=await snapshot('sensitivity-comparison');
assert.equal(fields.cases.length,10);assert.equal(comparison.cases.length,10);
const target=fields.cases.find(x=>x.prefix==='split-reference-sensitivity');
assert(target);assert.equal(target.stage,'same-2006-state-one-year-sensitivity');
const cases=[];
const selectors={annual:[1,2,3,4,5,6,7,8,9,10,11,12],JJA:[6,7,8],DJF:[12,1,2],MAM:[3,4,5],SON:[9,10,11]};
const wanted=['India','India native land','Australia north','Australia north native land','Arabian Sea','Bay of Bengal','Equatorial Indian Ocean','Amazon','Congo'];
for(const x of fields.cases) {
 const path=`${b}/${x.prefix}-statistics.json`,bytes=await readFile(path);bindings[path]=hash(bytes);
 const raw=JSON.parse(bytes);
 assert.equal(raw.actualEnd,'2007-01-01T00:00:00');assert.equal(raw.monthly.length,12);
 const c=comparison.cases.find(y=>y.prefix===x.prefix);assert(c);
 if(x.prefix==='split-reference-sensitivity') {assert.equal(raw.calls,17520);assert.equal(raw.initialAtmLandSHA,'85239455dd7cfb118de88d71db503906261e986f12a7161d9f894f4389e99bae');}
 const regions=x.regions.filter(r=>wanted.includes(r.name)).map(r=>({name:r.name,support:r.support,
  monthly:r.monthly.map(m=>({month:m.month,precipitationMm:m.precipitationMm,evaporationMm:m.evaporationMm,
   lowT:m.layers.temperatureK[7],lowQgKg:1000*m.layers.specificHumidity[7],lowRH:m.layers.relativeHumidity[7],
   lowU:m.layers.u[7],lowV:m.layers.v[7],soilWaterKgM2:m.surface.soilWaterKgM2,
   landETMmDay:m.surface.landEvaporationMmDay,columnWaterMm:m.surface.columnWaterKgM2,
   convectivePmmDay:m.surface.convectivePrecipitationMmDay,largeScalePmmDay:m.surface.largeScalePrecipitationMmDay,
   landSkinK:m.surface.landSkinK,sstK:m.surface.sstK,fluxNorthKgMs:m.surface.moistureFluxNorthKgMs,fluxEastKgMs:m.surface.moistureFluxEastKgMs})),
  periods:Object.fromEntries(Object.entries(selectors).map(([period,months])=>{
   const ms=r.monthly.filter(m=>months.includes(m.month)),seconds=ms.reduce((a,m)=>a+m.seconds,0);
   const mean=f=>ms.reduce((a,m)=>a+m.seconds*f(m),0)/seconds;
   return [period,{precipitationMm:ms.reduce((a,m)=>a+m.precipitationMm,0),mixedColumnEvaporationMm:ms.reduce((a,m)=>a+m.evaporationMm,0),
    layers:Object.fromEntries(Object.keys(ms[0].layers).map(k=>[k,Array.from({length:8},(_,l)=>mean(m=>m.layers[k][l]))])),
    surface:Object.fromEntries(Object.keys(ms[0].surface).map(k=>[k,mean(m=>m.surface[k])])),
    landETMm:mean(m=>m.surface.landEvaporationMmDay)*seconds/86400,
    oceanETMm:mean(m=>m.surface.oceanEvaporationMmDay)*seconds/86400}];
  }))}));
 cases.push({prefix:x.prefix,stage:x.stage,global:x.annualGlobal,regions,comparison:c});
}
for(const path of [`${b}/diagnostic-weights.json`,`${d}/summarize-candidates.mjs`,`${d}/compare-sensitivity.mjs`,`${d}/transport-v3-model.jl`,`${d}/longwave-corrected.jl`,`${d}/split-reference-sensitivity-native-status.json`,
 'docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json',
 'docs/evidence/earth-speedy-moisture-monsoon-20261013/acceptance.json',
 'docs/evidence/earth-speedyweather-20261012/julia-env/Manifest.toml',
 'build/earth-speedyweather/depot/packages/SpeedyWeather/qRu16/Project.toml',
 'build/earth-speedyweather/depot/packages/SpeedyWeather/qRu16/ext/SpeedyWeatherNumericalRadiationExt/SpeedyWeatherNumericalRadiationExt.jl',
 'build/earth-speedyweather/depot/packages/SpeedyWeather/qRu16/ext/SpeedyWeatherNumericalRadiationExt/analytic_band_longwave.jl',
 'build/earth-speedyweather/depot/packages/SpeedyWeather/qRu16/ext/SpeedyWeatherNumericalRadiationExt/ecckd_radiation.jl',
 'build/earth-speedyweather/depot/packages/SpeedyWeather/qRu16/src/parameterizations/radiation/longwave_radiation.jl',
 'build/earth-speedyweather/depot/packages/SpeedyWeather/qRu16/src/parameterizations/radiation/longwave_transmissivity.jl']) {
 try{bindings[path]=hash(await readFile(path));}catch(e){if(e.code!=='ENOENT')throw e;}
}
const result={scriptSHA:hash(await readFile(new URL(import.meta.url))),note:'Frozen snapshots of 10 cases; raw statistics independently hash-bound. Period means use actual seconds. No monthly-mean products used as instantaneous transport.',bindings,cases};
await writeFile(`${b}/v3-climate-review-annual-analysis.json`,JSON.stringify(result,null,2)+'\n');
for(const prefix of ['baseline-sensitivity-v2','combined-sensitivity','split-reference-sensitivity']) {
 const c=cases.find(x=>x.prefix===prefix);
 console.log(JSON.stringify({prefix,monsoon:c.comparison.regions.filter(x=>x.monsoonScreen),
  diagnostics:c.regions.filter(r=>['India native land','Australia north native land','Arabian Sea','Bay of Bengal'].includes(r.name)).map(r=>({name:r.name,
   periods:Object.fromEntries(['annual','JJA','DJF'].map(p=>{const x=r.periods[p],s=x.surface,l=x.layers;return[p,{P:x.precipitationMm,mixedE:x.mixedColumnEvaporationMm,landET:x.landETMm,lowT:l.temperatureK[7],lowQgKg:l.specificHumidity[7]*1000,lowRH:l.relativeHumidity[7],lowU:l.u[7],lowV:l.v[7],soil:s.soilWaterKgM2,skin:s.landSkinK,sst:s.sstK,CW:s.columnWaterKgM2,convP:s.convectivePrecipitationMmDay,largeP:s.largeScalePrecipitationMmDay,fluxN:s.moistureFluxNorthKgMs,fluxE:s.moistureFluxEastKgMs}]}))}))},null,2));
}
