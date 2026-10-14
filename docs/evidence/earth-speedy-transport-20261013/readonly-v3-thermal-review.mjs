import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const d='docs/evidence/earth-speedy-transport-20261013',b='build/earth-speedy-transport';
const sha=x=>createHash('sha256').update(x).digest('hex'),bindings={};
async function snapshot(name){
 const file=`${b}/v3-climate-review-thermal-${name}.json`;let bytes;
 try{bytes=await readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;bytes=await readFile(`${d}/${name}.json`);await writeFile(file,bytes);}
 bindings[file]=sha(bytes);return JSON.parse(bytes);
}
const f=await snapshot('candidate-fields'),c=await snapshot('sensitivity-comparison');
assert.equal(f.cases.length,11);assert.equal(c.cases.length,11);
const weightsBytes=await readFile(`${b}/diagnostic-weights.json`),weights=JSON.parse(weightsBytes);
bindings[`${b}/diagnostic-weights.json`]=sha(weightsBytes);
const prefixes=['combined-sensitivity','thermal-split-reference-sensitivity','split-reference-sensitivity'];
const names=['India','India native land','Australia north','Australia north native land','Arabian Sea','Bay of Bengal'];
const selectors={annual:[1,2,3,4,5,6,7,8,9,10,11,12],JJA:[6,7,8],DJF:[12,1,2],August:[8],September:[9]};
const cases=[];let maxRainSupportError=0,maxLayerSupportError=0;
for(const prefix of prefixes){
 const path=`${b}/${prefix}-statistics.json`,bytes=await readFile(path),raw=JSON.parse(bytes);bindings[path]=sha(bytes);
 assert.equal(raw.calls,17520);assert.equal(raw.actualEnd,'2007-01-01T00:00:00');
 assert.equal(raw.initialAtmLandSHA,'85239455dd7cfb118de88d71db503906261e986f12a7161d9f894f4389e99bae');
 const fc=f.cases.find(x=>x.prefix===prefix),cc=c.cases.find(x=>x.prefix===prefix);assert(fc&&cc);
 const regions=fc.regions.filter(r=>names.includes(r.name)).map(r=>{
  const w=weights.regions.find(x=>x.name===r.name).weights;
  for(let j=0;j<12;j++){
   const rain=w.reduce((a,wi,i)=>a+wi*raw.monthly[j].precipitationMm[i],0);
   const target=cc.regions.find(x=>x.name===r.name)?.monthlyMm[j]??r.monthly[j].precipitationMm;
   maxRainSupportError=Math.max(maxRainSupportError,Math.abs(rain-target));
   for(const key of ['temperatureK','specificHumidity','u','v'])for(let k=0;k<8;k++){
    const mean=w.reduce((a,wi,i)=>a+wi*raw.monthly[j].layers[key][k*w.length+i],0);
    maxLayerSupportError=Math.max(maxLayerSupportError,Math.abs(mean-r.monthly[j].layers[key][k]));
   }
  }
  return {name:r.name,monthly:r.monthly,periods:Object.fromEntries(Object.entries(selectors).map(([name,months])=>{
   const ms=r.monthly.filter(x=>months.includes(x.month)),seconds=ms.reduce((a,x)=>a+x.seconds,0),mean=fn=>ms.reduce((a,x)=>a+x.seconds*fn(x),0)/seconds;
   return [name,{rainMm:ms.reduce((a,x)=>a+x.precipitationMm,0),
    layers:Object.fromEntries(Object.keys(ms[0].layers).map(k=>[k,Array.from({length:8},(_,i)=>mean(m=>m.layers[k][i]))])),
    surface:Object.fromEntries(Object.keys(ms[0].surface).map(k=>[k,mean(m=>m.surface[k])])),
    landETMm:mean(m=>m.surface.landEvaporationMmDay)*seconds/86400}];
  }))};
 });
 cases.push({prefix,global:fc.annualGlobal,comparison:cc,externalSSTWm2:cc.budget.terms.prescribedSstExternalHeatJm2/31536000,regions});
}
assert(maxRainSupportError<1e-9);assert(maxLayerSupportError<1e-10);
for(const prefix of prefixes.slice(1)){
 const path=`${d}/${prefix}-native-status.json`,bytes=await readFile(path),s=JSON.parse(bytes);bindings[path]=sha(bytes);
 assert.equal(s.code,0);assert(s.sourceUnchanged&&s.inputsUnchanged);
 assert.equal(s.configuration.PHYSICS_FIX,prefix.startsWith('thermal-')?'combined-implicit-split-reference':'all-corrections-split-reference');
}
const result={scriptSHA:sha(await readFile(new URL(import.meta.url))),bindings,maxRainSupportError,maxLayerSupportError,cases};
await writeFile(`${b}/v3-climate-review-thermal-analysis.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({maxRainSupportError,maxLayerSupportError,cases:cases.map(x=>({prefix:x.prefix,global:x.global,externalSSTWm2:x.externalSSTWm2,
 regions:x.regions.filter(r=>['India native land','Australia north native land','Arabian Sea','Bay of Bengal'].includes(r.name)).map(r=>({name:r.name,periods:Object.fromEntries(Object.entries(r.periods).map(([p,x])=>[p,{rain:x.rainMm,T:x.layers.temperatureK[7],q:1000*x.layers.specificHumidity[7],rh:x.layers.relativeHumidity[7],u:x.layers.u[7],v:x.layers.v[7],cw:x.surface.columnWaterKgM2,soil:x.surface.soilWaterKgM2,et:x.landETMm,skin:x.surface.landSkinK,convP:x.surface.convectivePrecipitationMmDay,largeP:x.surface.largeScalePrecipitationMmDay}]))}))}))},null,2));
