import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const d='docs/evidence/earth-speedy-transport-20261013',b='build/earth-speedy-transport';
const sha=x=>createHash('sha256').update(x).digest('hex'),bindings={};
async function read(path){const bytes=await readFile(path);bindings[path]=sha(bytes);return JSON.parse(bytes);}
async function snapshot(name){const dest=`${b}/v3-climate-review-sixyear-${name}.json`;let bytes;
 try{bytes=await readFile(dest);}catch(e){if(e.code!=='ENOENT')throw e;bytes=await readFile(`${d}/${name}.json`);await writeFile(dest,bytes);}
 bindings[dest]=sha(bytes);return JSON.parse(bytes);}
const f=await snapshot('candidate-fields'),c=await snapshot('sensitivity-comparison');
assert.equal(f.cases.length,12);assert.equal(c.cases.length,12);
const weights=await read(`${b}/diagnostic-weights.json`);
const old=await read('docs/evidence/earth-speedy-moisture-monsoon-20261013/acceptance.json');
const mean=(a,w,k=0)=>w.reduce((s,wi,i)=>s+wi*a[k*w.length+i],0),sum=a=>a.reduce((s,x)=>s+x,0);
let maxRainError=0,maxFieldError=0,maxMetricError=0,maxGlobalError=0,maxBudgetError=0;
const check=(a,v,kind)=>{const e=Math.abs(a-v);assert(e<1e-8,`${kind}: ${e}`);return e;};
const selectors={annual:[1,2,3,4,5,6,7,8,9,10,11,12],JJA:[6,7,8],DJF:[12,1,2],MAM:[3,4,5],SON:[9,10,11],August:[8],September:[9]};
const cases=[];
for(const prefix of ['combined-seasonal','split-reference-sensitivity','split-reference-seasonal']){
 const raw=await read(`${b}/${prefix}-statistics.json`),g=await read(`${b}/${prefix}-geometry.json`);
 const fc=f.cases.find(x=>x.prefix===prefix),cc=c.cases.find(x=>x.prefix===prefix);assert(fc&&cc);
 const full=prefix.endsWith('-seasonal');assert.equal(raw.calls,full?105169:17520);
 assert.equal(raw.start,full?'2001-01-01T00:00:00':'2006-01-01T00:00:00');
 assert.equal(raw.statisticsStart,'2006-01-01T00:00:00');assert.equal(raw.actualEnd,'2007-01-01T00:00:00');
 assert.equal(raw.initialAtmLandSHA,full?'4c665c83b08918fad6f8b67968fae472539c8796515afc93a22099d682b44a68':'85239455dd7cfb118de88d71db503906261e986f12a7161d9f894f4389e99bae');
 const seconds=sum(raw.monthly.map(m=>m.seconds));assert.equal(seconds,31536000);assert.equal(g.nlayers,8);
 for(const r of cc.regions){
  const w=weights.regions.find(x=>x.name===r.name).weights;
  const monthly=raw.monthly.map(m=>mean(m.precipitationMm,w));
  monthly.forEach((x,i)=>{maxRainError=Math.max(maxRainError,check(x,r.monthlyMm[i],'rain'));});
  const annual=sum(monthly),mae=sum(monthly.map((x,i)=>Math.abs(x-r.observedMonthlyMm[i])))/12;
  const southern=['Australia north','Australia southwest'].includes(r.name),season=southern?[11,0,1]:[5,6,7];
  const obsPeak=r.observedMonthlyMm.indexOf(Math.max(...r.observedMonthlyMm))+1,peak=monthly.indexOf(Math.max(...monthly))+1;
  for(const [x,y] of [[annual,r.modelAnnualMm],[mae,r.monthlyMAEMm],[sum(season.map(i=>monthly[i]))/annual,r.summerFraction],
   [mae-old.cases.find(x=>x.id==='coupled-seasonal').regions.find(x=>x.name===r.name).monthlyMAEMm,r.monthlyMAEDeltaMm]])
   maxMetricError=Math.max(maxMetricError,check(x,y,'metric'));
  assert.equal(peak,r.peakMonth);
  if(r.monsoonScreen){const dist=Math.abs(peak-obsPeak),baseline=old.cases.find(x=>x.id==='before-seasonal').regions.find(x=>x.name===r.name);
   assert.deepEqual(r.monsoonScreen,{peakWithinOneMonth:Math.min(dist,12-dist)<=1,summerMajority:sum(season.map(i=>monthly[i]))/annual>=.5,
    annualWithin25Percent:Math.abs(annual-sum(r.observedMonthlyMm))<=.25*sum(r.observedMonthlyMm),monthlyMAEImproves:mae<baseline.monthlyMAEMm});}
 }
 const regions=fc.regions.filter(r=>['India native land','Australia north native land','Arabian Sea','Bay of Bengal'].includes(r.name)).map(r=>{
  const w=weights.regions.find(x=>x.name===r.name).weights;
  for(let j=0;j<12;j++){
   for(const key of ['temperatureK','specificHumidity','u','v'])for(let k=0;k<8;k++)maxFieldError=Math.max(maxFieldError,check(mean(raw.monthly[j].layers[key],w,k),r.monthly[j].layers[key][k],'layer'));
   for(const key of Object.keys(r.monthly[j].surface))maxFieldError=Math.max(maxFieldError,check(mean(raw.monthly[j].surface[key],w),r.monthly[j].surface[key],'surface'));
  }
  return {name:r.name,periods:Object.fromEntries(Object.entries(selectors).map(([period,months])=>{
   const ms=r.monthly.filter(m=>months.includes(m.month)),sec=sum(ms.map(m=>m.seconds)),avg=fn=>sum(ms.map(m=>m.seconds*fn(m)))/sec;
   return [period,{rainMm:sum(ms.map(m=>m.precipitationMm)),landETMm:avg(m=>m.surface.landEvaporationMmDay)*sec/86400,
    layers:Object.fromEntries(Object.keys(ms[0].layers).map(k=>[k,Array.from({length:8},(_,i)=>avg(m=>m.layers[k][i]))])),
    surface:Object.fromEntries(Object.keys(ms[0].surface).map(k=>[k,avg(m=>m.surface[k])]))}];
  }))};
 });
 const t=raw.statisticsBudget.terms;
 const global={incomingSolarWm2:t.incomingSolarJm2/seconds,outgoingShortwaveWm2:t.outgoingShortwaveJm2/seconds,
  outgoingLongwaveWm2:t.outgoingLongwaveJm2/seconds,toaNetWm2:(t.incomingSolarJm2-t.outgoingShortwaveJm2-t.outgoingLongwaveJm2)/seconds,
  precipitationMmDay:sum(raw.monthly.map(m=>mean(m.precipitationMm,g.weights)))/365,evaporationMmDay:sum(raw.monthly.map(m=>mean(m.evaporationMm,g.weights)))/365,
  temperatureK:Array.from({length:8},(_,k)=>sum(raw.monthly.map(m=>m.seconds*mean(m.layers.temperatureK,g.weights,k)))/seconds)};
 for(const key of Object.keys(global)){const va=Array.isArray(global[key])?global[key]:[global[key]],vb=Array.isArray(fc.annualGlobal[key])?fc.annualGlobal[key]:[fc.annualGlobal[key]];
  va.forEach((x,i)=>{maxGlobalError=Math.max(maxGlobalError,check(x,vb[i],'global'));});}
 const budgets={};
 for(const [period,budget] of Object.entries({statistics:raw.statisticsBudget,full:raw.budget})){
  const t=budget.terms,residual=budget.final.airWaterMm-budget.initial.airWaterMm-t.evaporationMm+t.precipitationMm-t.pressureModeWaterMm,
   limit=Math.max(.05,.001*(Math.abs(t.evaporationMm)+t.precipitationMm));
  maxBudgetError=Math.max(maxBudgetError,check(residual,budget.airWaterExcludingModeResidualMm,'budget'));
  budgets[period]={residual,limit,passed:Math.abs(residual)<=limit,budget};
 }
 cases.push({prefix,stage:raw.stage,calls:raw.calls,initialAtmLandSHA:raw.initialAtmLandSHA,global,externalSSTWm2:t.prescribedSstExternalHeatJm2/seconds,
  iceAdjustmentWm2:t.oceanFreezingAdjustmentJm2/seconds,comparison:cc,regions,budgets});
}
const status=await read(`${d}/split-reference-seasonal-native-status.json`);assert.equal(status.code,0);assert(status.sourceUnchanged&&status.inputsUnchanged);
assert.equal(status.configuration.PHYSICS_FIX,'all-corrections-split-reference');
for(const p of ['transport-v3-model.jl','run-v3.jl','v3-protocol.md']){const bytes=await readFile(`${d}/${p}`);bindings[`${d}/${p}`]=sha(bytes);assert.equal(bindings[`${d}/${p}`],status.sourceBefore[`${d}/${p}`]);}
const result={scriptSHA:sha(await readFile(new URL(import.meta.url))),bindings,verification:{maxRainError,maxFieldError,maxMetricError,maxGlobalError,maxBudgetError},cases};
await writeFile(`${b}/v3-climate-review-sixyear-analysis.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({verification:result.verification,cases:cases.map(c=>({prefix:c.prefix,global:c.global,externalSSTWm2:c.externalSSTWm2,iceAdjustmentWm2:c.iceAdjustmentWm2,
 regions:c.comparison.regions.map(r=>({name:r.name,annual:r.modelAnnualMm,observed:r.observedAnnualMm,mae:r.monthlyMAEMm,deltaOld:r.monthlyMAEDeltaMm,summer:r.summerFraction,peak:r.peakMonth,months:r.monthlyMm})),
 diagnostics:c.regions.map(r=>({name:r.name,periods:Object.fromEntries(Object.entries(r.periods).map(([p,v])=>[p,{P:v.rainMm,ET:v.landETMm,T:v.layers.temperatureK[7],q:1000*v.layers.specificHumidity[7],RH:v.layers.relativeHumidity[7],u:v.layers.u[7],v:v.layers.v[7],CW:v.surface.columnWaterKgM2,soil:v.surface.soilWaterKgM2,convP:v.surface.convectivePrecipitationMmDay,largeP:v.surface.largeScalePrecipitationMmDay}]))})),
 budgets:Object.fromEntries(Object.entries(c.budgets).map(([p,v])=>[p,{residual:v.residual,limit:v.limit,passed:v.passed}]))}))},null,2));
