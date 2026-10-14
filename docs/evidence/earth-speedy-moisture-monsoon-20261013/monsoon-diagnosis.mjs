// Read-only analysis of frozen 2006 data. Writes only its own diagnosis artifacts.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRemap,remapScalar} from '../earth-speedyweather-20261012/remap.mjs';
import {matchedSupport} from '../../../climate-diagnostics.ts';
const folder='docs/evidence/earth-speedy-moisture-monsoon-20261013';
const frozen='docs/evidence/earth-speedy-budgets-sst-20261012';
const dataFolder='build/earth-speedy-budgets-sst';
const hashes={};
async function load(p){const b=await readFile(p);hashes[p]=createHash('sha256').update(b).digest('hex');return JSON.parse(b);}
const [gpcc,initial,accepted]=await Promise.all([
 load('docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json'),
 load('build/earth-seasonal-pressure/full-control-day0.json'),
 load(`${frozen}/acceptance.json`),
]);
const sum=a=>Array.from(a).reduce((s,v)=>s+v,0);
const dot=(w,a)=>w.reduce((s,v,k)=>s+v*a[k],0);
const normalize=w=>w.map(v=>v/sum(w));
const argmax=a=>a.indexOf(Math.max(...a))+1;
const rad=Math.PI/180,days=[31,28,31,30,31,30,31,31,30,31,30,31];
const kappa=(8314.5/28.9649)/1004;
function qsat(T,p){return (18.0153/28.9649)*610.78*Math.exp(2501000/(8314.5/18.0153)*(1/273.15-1/T))/p;}
function dailySolar(lat,date){
 const day=(date-Date.UTC(date.getUTCFullYear(),0,1))/86400000;
 const daysInYear=(Date.UTC(date.getUTCFullYear()+1,0,1)-Date.UTC(date.getUTCFullYear(),0,1))/86400000;
 // SinSolarDeclination(Earth): equinox is dayofyear(2000-03-20)-1 = 79.
 const delta=23.4*rad*Math.sin(2*Math.PI*(day/daysInYear-79/365.25));
 const p=lat*rad,h=Math.acos(Math.max(-1,Math.min(1,-Math.tan(p)*Math.tan(delta))));
 return 1365/Math.PI*(h*Math.sin(delta)*Math.sin(p)+Math.cos(delta)*Math.cos(p)*Math.sin(h));
}
const result={generatedUTC:new Date().toISOString(),method:{
 fixedComparison:'Exact prior matched GPCC-valid land support, same 48x24 remap and source geometry. No observations, supports, dates or parameters modified.',
 humidity:'Specific humidity in g/kg. RH proxy is area-mean [monthly q / qsat(monthly T, monthly ps*sigma)] using the exact model Clausius-Clapeyron constants. It is not mean instantaneous RH.',
 theta:'Potential temperature proxy from monthly T and ps. Static stability between levels 7/8 is theta7-theta8; a monthly mean cannot diagnose episodic convection.',
 alternativeSupport:'nativeBoxLand is Gaussian quadrature times native land fraction in the fixed bounds; nativeLandMaskedFixedSupport first remaps with native land mask, then uses old GPCC support. These are sensitivity checks, not replacements for the frozen comparison.',
 solar:'Analytic daily average of the default SinSolarDeclination/Earth formula, evaluated on each day at 12 UTC. Source-code phase audit, not replay of archived instantaneous cos_zenith.'},cases:[],hashes};
for(const id of ['slab','seasonal']){
 const [j,g]=await Promise.all([load(`${dataFolder}/${id}-statistics.json`),load(`${dataFolder}/${id}-geometry.json`)]);
 const n=g.npoints,map=createRemap(g);
 assert.equal(j.statisticsStart,'2006-01-01T00:00:00');assert.equal(j.actualEnd,'2007-01-01T00:00:00');
 j.monthly.forEach((a,m)=>{assert.equal(a.month,m+1);assert.equal(a.seconds,days[m]*86400);});
 const c={id,monthSeconds:j.monthly.map(a=>a.seconds),regions:[]};
 for(const name of ['India','Australia north']){
  const old=accepted.cases.find(c=>c.id===id).regions.find(r=>r.name===name);
  const support=matchedSupport(map,initial.runtime.state.land,old.bounds,gpcc.cells);
  const w=Array(n).fill(0);
  for(let k=0;k<map.count;k++)for(const [i,a] of map.overlaps[k])w[i]+=support.weights[k]/support.solidAngle*a/map.area;
  assert(Math.abs(sum(w)-1)<1e-12);
  const b=old.bounds;
  const wn=normalize(g.weights.map((v,i)=>g.latDegrees[i]>=b.south&&g.latDegrees[i]<=b.north&&g.lonDegrees[i]>=b.west&&g.lonDegrees[i]<=b.east?v*g.landFraction[i]:0));
  const ob=accepted.cases.find(c=>c.id===id).monsoon.find(r=>r.name===name).marineBox;
  const wo=normalize(g.weights.map((v,i)=>g.latDegrees[i]>=ob.south&&g.latDegrees[i]<=ob.north&&g.lonDegrees[i]>=ob.west&&g.lonDegrees[i]<=ob.east?v*(1-g.landFraction[i]):0));
  const months=j.monthly.map((a,m)=>{
   const p=a.surface.pressurePa;
   const layers=g.sigmaFull.map((sigma,k)=>{
    const T=a.layers.temperatureK.slice(k*n,(k+1)*n),q=a.layers.specificHumidity.slice(k*n,(k+1)*n),u=a.layers.u.slice(k*n,(k+1)*n),v=a.layers.v.slice(k*n,(k+1)*n);
    return {sigma,temperatureK:dot(w,T),specificHumidityGKg:1000*dot(w,q),eastWindMps:dot(w,u),northWindMps:dot(w,v),rhFromMonthlyState:dot(w,T.map((t,i)=>q[i]/qsat(t,p[i]*sigma))),potentialTemperatureK:dot(w,T.map((t,i)=>t*(100000/(p[i]*sigma))**kappa)),marine:{temperatureK:dot(wo,T),specificHumidityGKg:1000*dot(wo,q),eastWindMps:dot(wo,u),northWindMps:dot(wo,v)}};
   });
   const rain=dot(w,a.precipitationMm);
   assert(Math.abs(rain-old.monthlyMm[m])<1e-10,'Prior frozen rainfall must reproduce exactly');
   const maskedRain=support.mean(remapScalar(map,a.precipitationMm,g.landFraction).values);
   const landSkin=dot(w,a.surface.landSkinK),oceanSST=dot(wo,a.surface.sstK);
   const latentSurfaceAirDifference=landSkin-layers[7].temperatureK;
   const toa=dot(w,g.latDegrees.map(lat=>sum(Array.from({length:days[m]},(_,d)=>dailySolar(lat,new Date(Date.UTC(2006,m,d+1,12)))))/days[m]));
   return {month:m+1,precipitationMm:rain,observedPrecipitationMm:old.observedMonthlyMm[m],nativeBoxLandPrecipitationMm:dot(wn,a.precipitationMm),nativeLandMaskedFixedSupportPrecipitationMm:maskedRain,evaporationMm:dot(w,a.evaporationMm),columnWaterKgM2:dot(w,a.surface.columnWaterKgM2),pressurePa:dot(w,p),landSkinK:landSkin,nativeLandMaskedSkinK:support.mean(remapScalar(map,a.surface.landSkinK,g.landFraction).values),marineSstK:oceanSST,landMinusMarineK:landSkin-oceanSST,skinMinusLowestAirK:latentSurfaceAirDifference,lowLayerStabilityK:layers[6].potentialTemperatureK-layers[7].potentialTemperatureK,diagnosticToaSolarWm2:toa,layers};
  });
  const seaContribution=dot(w,g.landFraction.map(l=>1-l));
  const weightedMean=(key,ms)=>sum(ms.map(m=>months[m][key]*days[m]))/sum(ms.map(m=>days[m]));
  const season=ms=>({months:ms.map(m=>m+1),precipitationMm:sum(ms.map(m=>months[m].precipitationMm)),observedPrecipitationMm:sum(ms.map(m=>months[m].observedPrecipitationMm)),evaporationMm:sum(ms.map(m=>months[m].evaporationMm)),...Object.fromEntries(['columnWaterKgM2','landSkinK','marineSstK','landMinusMarineK','skinMinusLowestAirK','lowLayerStabilityK','diagnosticToaSolarWm2'].map(key=>[key,weightedMean(key,ms)])),layers:g.sigmaFull.map((sigma,k)=>({sigma,...Object.fromEntries(['temperatureK','specificHumidityGKg','eastWindMps','northWindMps','rhFromMonthlyState','potentialTemperatureK'].map(key=>[key,sum(ms.map(m=>months[m].layers[k][key]*days[m]))/sum(ms.map(m=>days[m]))]))}))});
  c.regions.push({name,bounds:b,marineBox:ob,support:{nativeFractionalMarineContribution:seaContribution,effectiveLatitude:dot(w,g.latDegrees),effectiveLongitude:dot(w,g.lonDegrees),nativeWeightedLandFraction:dot(wn,g.landFraction),nativeLandPointCount:wn.filter(v=>v>0).length,fixedComparisonPointCount:w.filter(v=>v>0).length,validLandAreaKm2:support.solidAngle*g.radiusM**2/1e6},months,seasons:{DJF:season([11,0,1]),JJA:season([5,6,7])},peaks:Object.fromEntries(['precipitationMm','observedPrecipitationMm','nativeBoxLandPrecipitationMm','nativeLandMaskedFixedSupportPrecipitationMm','landSkinK','marineSstK','diagnosticToaSolarWm2'].map(key=>[key,argmax(months.map(m=>m[key]))]))});
 }
 result.cases.push(c);
}
await writeFile(`${folder}/monsoon-diagnosis.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result.cases.map(c=>({id:c.id,regions:c.regions.map(r=>({name:r.name,support:r.support,peaks:r.peaks,seasons:r.seasons,monthly:r.months.map(m=>({month:m.month,rain:m.precipitationMm,nativeRain:m.nativeBoxLandPrecipitationMm,maskedRain:m.nativeLandMaskedFixedSupportPrecipitationMm,obs:m.observedPrecipitationMm,skin:m.landSkinK,skinMasked:m.nativeLandMaskedSkinK,ocean:m.marineSstK,air:m.layers[7].temperatureK,q:m.layers[7].specificHumidityGKg,rh:m.layers[7].rhFromMonthlyState,theta7minus8:m.lowLayerStabilityK,u:m.layers[7].eastWindMps,v:m.layers[7].northWindMps,water:m.columnWaterKgM2,solar:m.diagnosticToaSolarWm2}))}))})),null,2));
