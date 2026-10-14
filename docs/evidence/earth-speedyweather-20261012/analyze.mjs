import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRemap,remapScalar} from './remap.mjs';
import {matchedSupport} from '../../../climate-diagnostics.ts';
const folder='docs/evidence/earth-speedyweather-20261012',out='build/earth-speedyweather';
const load=async p=>JSON.parse(await readFile(p,'utf8'));
const [j,g,gpcc,ice,old,oldInitial]=await Promise.all([
 load(`${out}/annual-statistics.json`),load(`${out}/annual-geometry.json`),
 load('docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json'),
 load('docs/evidence/earth-seaice-causal-20261011/nsidc-same-grid.json'),
 load('build/earth-seasonal-pressure/full-control.json'),load('build/earth-seasonal-pressure/full-control-day0.json'),
]);
assert.equal(j.actualEnd,'2007-01-01T00:00:00');assert.equal(j.statisticsStart,'2006-01-01T00:00:00');
assert.equal(j.calls,2191*48+1);assert.equal(j.monthly.length,12);assert.equal(g.truncation,32);assert.equal(g.nlayers,8);
const sum=a=>Array.from(a).reduce((s,v)=>s+v,0),mean=a=>sum(a)/a.length;
const wmean=(a,w)=>sum(Array.from(a,(v,k)=>v*w[k]))/sum(w);
const map=createRemap(g),n=g.npoints,marine=g.landFraction.map(v=>1-v),landCoverage=remapScalar(map,g.landFraction).values;
const remapped=[],conservation=[];
for(let m=0;m<12;m++) {
 const a=j.monthly[m];assert.equal(a.month,m+1);
 const expectedDays=[31,28,31,30,31,30,31,31,30,31,30,31][m];assert.equal(a.seconds,expectedDays*86400);
 // Atmospheric precipitation exists on every column. GPCC keeps the old fixed
 // geographic land support; the column field is remapped without a changing mask.
 const rain=remapScalar(map,a.precipitationMm),landRain=remapScalar(map,a.precipitationMm,g.landFraction);
 const sic=remapScalar(map,a.surface.seaIceConcentration,marine);
 const check=(source,target,mask,coverage)=>{
  const native=sum(source.map((v,k)=>v*g.weights[k]*mask[k]));
  const mapped=sum(Array.from(target,(v,k)=>v*coverage[k]))/map.count;
  assert(Math.abs(native-mapped)<1e-9*Math.max(1,Math.abs(native)),'Remap must preserve masked native totals');return {native,mapped,error:mapped-native};
 };
 conservation.push({month:m+1,landRainGlobalMm:check(a.precipitationMm,landRain.values,g.landFraction,landRain.coverage),marineIceGlobalAreaFraction:check(a.surface.seaIceConcentration,sic.values,marine,sic.coverage)});
 const layers=Array.from({length:8},(_,level)=>Object.fromEntries([
  ['temperatureK','temperatureK'],['windEastMps','u'],['windNorthMps','v'],
 ].map(([target,source])=>[target,Array.from(remapScalar(map,a.layers[source].slice(level*n,(level+1)*n)).values)])));
 const fields={rainMm:rain.values,landRainMm:landRain.values,ice:sic.values,marineCoverage:sic.coverage,layers,
  pressurePa:remapScalar(map,a.surface.pressurePa).values};
 remapped.push(fields);
}
const fixedLand=oldInitial.runtime.state.land;
const regions=old.gpcc.map(r=>{
 const support=matchedSupport(map,fixedLand,r.bounds,gpcc.cells),obs=Array.from(support.observedMonthlyMm);
 assert(Math.abs(sum(obs)-r.observedAnnualMm)<1e-8,'Existing GPCC support changed');
 const monthly=remapped.map(a=>support.mean(a.rainMm)),landMonthly=remapped.map(a=>support.mean(a.landRainMm));
 const season=(a,ms)=>sum(ms.map(k=>a[k]));
 return {name:r.name,bounds:r.bounds,fit:r.fit,validLandAreaKm2:support.solidAngle*g.radiusM**2/1e6,
  observedMonthlyMm:obs,observedAnnualMm:sum(obs),monthlyMm:monthly,modelAnnualMm:sum(monthly),annualBiasMm:sum(monthly)-sum(obs),
  DJFMm:season(monthly,[11,0,1]),JJAMm:season(monthly,[5,6,7]),observedDJFMm:season(obs,[11,0,1]),observedJJAMm:season(obs,[5,6,7]),
  monthlyMAEMm:mean(monthly.map((v,k)=>Math.abs(v-obs[k]))),oldReferenceAnnualMm:r.modelAnnualMm,
  nativeLandNormalizedAnnualMm:sum(landMonthly),nativeLandFractionOnReferenceSupport:support.mean(landCoverage)};
});
const hemisphere=k=>k<map.count/2?'north':'south';
const polar=(c,w,h)=>{
 const ks=Array.from({length:map.count},(_,k)=>k).filter(k=>hemisphere(k)===h);
 return {extentMillionKm2:sum(ks.map(k=>c[k]>=.15?w[k]/1e12:0)),areaMillionKm2:sum(ks.map(k=>c[k]*w[k]/1e12))};
};
const ext=a=>({min:Math.min(...a),max:Math.max(...a),minMonth:a.indexOf(Math.min(...a))+1,maxMonth:a.indexOf(Math.max(...a))+1});
const hemispheres=Object.fromEntries(['north','south'].map(h=>{
 const ks=Array.from({length:map.count},(_,k)=>k).filter(k=>hemisphere(k)===h);
 const monthly=remapped.map((a,m)=>({month:m+1,...polar(a.ice,ice.supportM2,h),observed:polar(ice.concentration[m],ice.supportM2,h),
  concentrationMAE:sum(ks.map(k=>ice.supportM2[k]*Math.abs(a.ice[k]-ice.concentration[m][k])))/sum(ks.map(k=>ice.supportM2[k])),
  noNativeMarineReferenceMillionKm2:sum(ks.map(k=>a.marineCoverage[k]===0?ice.supportM2[k]/1e12:0))}));
 return [h,{monthly,extent:ext(monthly.map(v=>v.extentMillionKm2)),observedExtent:ext(monthly.map(v=>v.observed.extentMillionKm2)),
  extentMAEMillionKm2:mean(monthly.map(v=>Math.abs(v.extentMillionKm2-v.observed.extentMillionKm2))),concentrationMAE:mean(monthly.map(v=>v.concentrationMAE))}];
}));
const nativeIce=j.monthly.map(a=>({month:a.month,...Object.fromEntries(['north','south'].map(h=>{
 const ks=Array.from({length:n},(_,k)=>k).filter(k=>h==='north'?g.latDegrees[k]>=0:g.latDegrees[k]<0),c=a.surface.seaIceConcentration;
 return [h,{extentMillionKm2:sum(ks.map(k=>c[k]>=.15?g.weights[k]*marine[k]*4*Math.PI*g.radiusM**2/1e12:0)),areaMillionKm2:sum(ks.map(k=>c[k]*g.weights[k]*marine[k]*4*Math.PI*g.radiusM**2/1e12))}];
}))}));
const b=j.statisticsBudget,duration=sum(j.monthly.map(a=>a.seconds)),waterLimit=Math.max(.05,.001*(Math.abs(b.evaporationMm)+b.precipitationMm));
const budget={statisticsYear:b,fullSpan:j.budget,oceanHeatResidualMaxPerStepJm2:j.oceanHeatResidualMaxPerStepJm2,
 airMass:{limitRelative:1e-6,observedRelative:b.airMassRelative,passed:Math.abs(b.airMassRelative)<=1e-6},
 atmosphericWater:{limitMm:waterLimit,observedMm:b.airWaterResidualMm,passed:Math.abs(b.airWaterResidualMm)<=waterLimit},
 oceanSurface:{maxStepResidualJm2:j.oceanHeatResidualMaxPerStepJm2,yearResidualJm2:b.oceanHeatResidualJm2,freezingAdjustmentMeanWm2:b.oceanFreezingAdjustmentJm2/duration,finiteIceEnthalpyClosed:false},
 landWater:{residualMm:b.landWaterResidualMm,untrackedLowerDrainage:true,passed:false},
 toaMean:{incomingWm2:b.incomingSolarJm2/duration,shortwaveUpWm2:b.outgoingShortwaveJm2/duration,longwaveUpWm2:b.outgoingLongwaveJm2/duration,netWm2:b.toaNetJm2/duration},
 trends:{oceanMeanKChange:(b.final.oceanSensibleHeatJm2-b.initial.oceanSensibleHeatJm2)/(209200000*sum(marine.map((v,k)=>v*g.weights[k]))),airWaterMmChange:b.final.airWaterMm-b.initial.airWaterMm},
 limitations:j.limitations};
const rings=[...new Set(g.latDegrees)].sort((a,b)=>a-b),annualMeanField=key=>Array.from({length:n*8},(_,k)=>sum(j.monthly.map(a=>a.layers[key][k]*a.seconds))/duration);
const annualU=annualMeanField('u'),annualPV=annualMeanField('pressureTimesNorthWind');
const zonalU=rings.map(lat=>Array.from({length:8},(_,level)=>{
 const ks=g.latDegrees.map((v,k)=>v===lat?k:-1).filter(k=>k>=0);return wmean(ks.map(k=>annualU[level*n+k]),ks.map(k=>g.weights[k]));
}));
const streamfunction=rings.map(lat=>{
 const ks=g.latDegrees.map((v,k)=>v===lat?k:-1).filter(k=>k>=0),psi=[0];let mass=0;
 for(let level=0;level<8;level++){
  mass+=(g.sigmaHalf[level+1]-g.sigmaHalf[level])*wmean(ks.map(k=>annualPV[level*n+k]),ks.map(k=>g.weights[k]));
  psi.push(2*Math.PI*g.radiusM*Math.cos(lat*Math.PI/180)/g.gravityMps2*mass);
 }return psi;
});
const zonal={latitudeDegrees:rings,sigmaFull:g.sigmaFull,sigmaHalf:g.sigmaHalf,annualZonalWindMps:zonalU,annualSigmaMassStreamfunctionKgS:streamfunction,
 method:'Zonal average of actual ps*v, integrated from sigma=0 downwards. Sigma-coordinate mass streamfunction, not fixed-pressure interpolation; includes residual surface transport, no boundary correction.'};
await writeFile(`${out}/zonal-circulation.json`,JSON.stringify(zonal));
const frames=remapped.map((a,m)=>({label:`2006年${m+1}月平均`,kind:'monthly-mean',month:m+1,
 timeS:((sum(j.monthly.slice(0,m).map(v=>v.seconds))/86400+j.monthly[m].seconds/86400/2-78+365)%365)*86400,
 layers:a.layers,surface:{pressurePa:Array.from(a.pressurePa),seaIceConcentration:Array.from(a.ice),rainMmDay:Array.from(a.rainMm,v=>v/j.monthly[m].seconds*86400)}}));
const display={format:'speedyweather-earth-display',version:1,
 model:{name:'SpeedyWeather',version:'0.23.0',truncation:32,nlayers:8,precision:'Float64',statisticsStart:'2006-01-01T00:00:00Z',statisticsEnd:'2007-01-01T00:00:00Z'},
 grid:{width:48,height:24,layout:'equal-area-north-first',longitudeWestDeg:-180},sigmaFull:g.sigmaFull,frames,
 acceptance:{formalDefaultUnchanged:true,regionalClimateAccepted:false}};
await writeFile(`${out}/display.json`,JSON.stringify(display));
const result={integration:{calls:j.calls,start:j.start,end:j.actualEnd,warmupCalendarYears:5,statisticsYear:2006,secondsWall:j.secondsWall,stepS:j.stepS,nativePoints:g.npoints,nlayers:8},budget,
 gpcc:{product:gpcc.product,url:gpcc.url,regions,temperateAnnualMAEMm:mean(regions.filter(v=>v.fit).map(v=>Math.abs(v.annualBiasMm))),
 method:'Fixed prior GPCC-valid geographic land weights, unchanged. Atmospheric total rain+snow is conservatively remapped from every forecast column. Separate native-land normalized precipitation and masked volume checks expose coast/mask sensitivity. Old reference is contextual, not a same-stock causal control.'},
 nsidc:{product:ice.product,variable:ice.variable,doi:ice.doi,method:ice.method,commonMillionKm2:ice.commonMillionKm2,hemispheres,nativeIce,
 caveat:'The fixed reference marine support is unchanged. Remapped concentrations are normalized by native marine coverage; zero native marine cells remain zero and their reference area is reported explicitly. Native and reference coast/shelf definitions differ. Extent threshold is applied after monthly concentration remap.'},
 remapping:{method:'Piecewise constant ring footprints reconstructed to Gaussian quadrature area; preserves integral, does not resolve subgrid features.',conservation},
 acceptance:{formalDefaultUnchanged:true,regionalClimateAccepted:false,allBudgetsClosed:false,fullEarthWaterBudgetAvailable:false,fullEarthEnergyBudgetAvailable:false}};
await writeFile(`${folder}/acceptance.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({integration:result.integration,budget:{airMass:budget.airMass,water:budget.atmosphericWater,toa:budget.toaMean},gpcc:regions.map(v=>({name:v.name,model:v.modelAnnualMm,observed:v.observedAnnualMm,DJF:v.DJFMm,JJA:v.JJAMm})),ice:Object.fromEntries(Object.entries(hemispheres).map(([h,v])=>[h,{extent:v.extent,MAE:v.extentMAEMillionKm2}]))},null,2));
