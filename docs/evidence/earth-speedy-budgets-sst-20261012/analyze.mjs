import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRemap,remapScalar} from '../earth-speedyweather-20261012/remap.mjs';
import {matchedSupport} from '../../../climate-diagnostics.ts';
import {moistureConvergence} from './moisture-diagnostic.mjs';
import {sstGradient} from './sst-gradient.mjs';
const folder='docs/evidence/earth-speedy-budgets-sst-20261012',out='build/earth-speedy-budgets-sst';
const load=async p=>JSON.parse(await readFile(p,'utf8'));
const sum=a=>Array.from(a).reduce((s,v)=>s+v,0),mean=a=>sum(a)/a.length;
const initialSHA='4c665c83b08918fad6f8b67968fae472539c8796515afc93a22099d682b44a68';
const [gpcc,control,initial,oldDisplay,oldAcceptance]=await Promise.all([
 load('docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json'),
 load('build/earth-seasonal-pressure/full-control.json'),load('build/earth-seasonal-pressure/full-control-day0.json'),
 load('build/earth-speedyweather/display.json'),load('docs/evidence/earth-speedyweather-20261012/acceptance.json'),
]);
// Fixed before reading the new annual results. Values are diagnostics, not rain nudges.
const oceanBoxes={India:{south:5,north:15,west:60,east:90},'Australia north':{south:-10,north:-2,west:110,east:140}};
const season=(a,ms)=>sum(ms.map(k=>a[k]));
const weightedSeason=(a,ms,monthly)=>sum(ms.map(k=>a[k]*monthly[k].seconds))/sum(ms.map(k=>monthly[k].seconds));
function convergence(east,north,grid,radius) {
 const result=moistureConvergence(east,north,grid,radius);
 assert(Math.abs(sum(result))<1e-8,'Diagnostic finite-volume faces must cancel globally');return result;
}
const cases=[],displayCases=[],checks=[];
for(const id of ['reference','slab','seasonal']) {
 const base=id==='reference'?'build/earth-speedyweather':out,prefix=id==='reference'?'annual':id;
 const [j,g]=await Promise.all([load(`${base}/${prefix}-statistics.json`),load(`${base}/${prefix}-geometry.json`)]);
 assert.equal(j.actualEnd,'2007-01-01T00:00:00');assert.equal(j.statisticsStart,'2006-01-01T00:00:00');
 assert.equal(j.calls,105169);assert.equal(j.monthly.length,12);assert.equal(g.npoints,3168);assert.equal(g.nlayers,8);assert.equal(g.truncation,32);
 if(id!=='reference')assert.equal(j.initialAtmLandSHA,initialSHA);
 const map=createRemap(g),n=g.npoints,marine=g.landFraction.map(v=>1-v),mapped=[],conservation=[];
 for(let m=0;m<12;m++) {
  const a=j.monthly[m];assert.equal(a.month,m+1);assert.equal(a.seconds,[31,28,31,30,31,30,31,31,30,31,30,31][m]*86400);
  const field=k=>remapScalar(map,a.surface[k]).values;
  const rain=remapScalar(map,a.precipitationMm),landRain=remapScalar(map,a.precipitationMm,g.landFraction),sic=remapScalar(map,a.surface.seaIceConcentration,marine);
  const raw=sum(a.precipitationMm.map((v,k)=>v*g.weights[k]*g.landFraction[k]));
  const target=sum(Array.from(landRain.values,(v,k)=>v*landRain.coverage[k]))/map.count;
  assert(Math.abs(raw-target)<1e-9*Math.max(1,Math.abs(raw)));
  const layers=Array.from({length:8},(_,l)=>Object.fromEntries([['temperatureK','temperatureK'],['windEastMps','u'],['windNorthMps','v'],['specificHumidity','specificHumidity']].map(([key,source])=>[key,Array.from(remapScalar(map,a.layers[source].slice(l*n,(l+1)*n)).values)])));
  const east=id==='reference'?null:field('moistureFluxEastKgMs'),north=id==='reference'?null:field('moistureFluxNorthKgMs');
  mapped.push({rain:rain.values,layers,pressurePa:field('pressurePa'),ice:sic.values,columnWater:field('columnWaterKgM2'),convergenceMmDay:east?convergence(east,north,map,g.radiusM):null,east,north});
  conservation.push({month:m+1,nativeLandRainGlobalMm:raw,mappedLandRainGlobalMm:target,errorMm:target-raw});
 }
 const regions=control.gpcc.map(r=>{
  const support=matchedSupport(map,initial.runtime.state.land,r.bounds,gpcc.cells),obs=Array.from(support.observedMonthlyMm);
  assert(Math.abs(sum(obs)-r.observedAnnualMm)<1e-8,'Fixed GPCC support changed');
  const monthly=mapped.map(a=>support.mean(a.rain)),summer=r.bounds.north<=0?[11,0,1]:r.bounds.south>=0?[5,6,7]:null,winter=summer?(summer[0]===11?[5,6,7]:[11,0,1]):null;
  const local=Object.fromEntries([['eastWindMps',a=>a.layers[7].windEastMps],['northWindMps',a=>a.layers[7].windNorthMps],['specificHumidity',a=>a.layers[7].specificHumidity],['columnWaterKgM2',a=>a.columnWater]].map(([key,get])=>[key,mapped.map(a=>support.mean(get(a)))]));
  if(id!=='reference')for(const [key,get]of [['columnFluxEastKgMs',a=>a.east],['columnFluxNorthKgMs',a=>a.north],['diagnosticMoistureConvergenceMmDay',a=>a.convergenceMmDay]])local[key]=mapped.map(a=>support.mean(get(a)));
  const annual=sum(monthly),DJF=season(monthly,[11,0,1]),JJA=season(monthly,[5,6,7]);
  return {name:r.name,bounds:r.bounds,fit:r.fit,monthlyMm:monthly,observedMonthlyMm:obs,modelAnnualMm:annual,observedAnnualMm:sum(obs),annualBiasMm:annual-sum(obs),monthlyMAEMm:mean(monthly.map((v,k)=>Math.abs(v-obs[k]))),DJFMm:DJF,JJAMm:JJA,observedDJFMm:season(obs,[11,0,1]),observedJJAMm:season(obs,[5,6,7]),seasonDefinition:summer?(summer[0]===11?'Southern DJF summer':'Northern JJA summer'):'Equatorial: DJF/JJA only, no summer label',summerFraction:summer?season(monthly,summer)/annual:null,observedSummerFraction:summer?season(obs,summer)/sum(obs):null,summerWinterRatio:summer?season(monthly,summer)/season(monthly,winter):null,observedSummerWinterRatio:summer?season(obs,summer)/season(obs,winter):null,peakMonth:monthly.indexOf(Math.max(...monthly))+1,observedPeakMonth:obs.indexOf(Math.max(...obs))+1,validLandAreaKm2:support.solidAngle*g.radiusM**2/1e6,local};
 });
 if(id==='reference')for(const r of regions)assert(Math.abs(r.modelAnnualMm-oldAcceptance.gpcc.regions.find(v=>v.name===r.name).modelAnnualMm)<1e-8,'Frozen reference changed');
 const monsoon=Object.entries(oceanBoxes).map(([name,box])=>{
  const r=regions.find(v=>v.name===name),ms=name==='India'?[5,6,7]:[11,0,1];
  const oceanW=g.weights.map((w,k)=>g.latDegrees[k]>=box.south&&g.latDegrees[k]<=box.north&&g.lonDegrees[k]>=box.west&&g.lonDegrees[k]<=box.east?w*marine[k]:0);
  assert(sum(oceanW)>0);const nativeMean=a=>sum(a.map((v,k)=>v*oceanW[k]))/sum(oceanW);
  const oceanMonthly=j.monthly.map(a=>({sstK:nativeMean(a.surface.sstK),sstGradient:sstGradient(a.surface.sstK,g.latDegrees,g.lonDegrees,oceanW,g.radiusM),lowEastWindMps:nativeMean(a.layers.u.slice(7*n,8*n)),lowNorthWindMps:nativeMean(a.layers.v.slice(7*n,8*n)),lowSpecificHumidity:nativeMean(a.layers.specificHumidity.slice(7*n,8*n))}));
  const landSkin=id==='reference'?null:j.monthly.map(a=>{
   const support=matchedSupport(map,initial.runtime.state.land,r.bounds,gpcc.cells);return support.mean(remapScalar(map,a.surface.landSkinK).values);
  });
  return {name,marineBox:box,oceanMonthly,landSkinK:landSkin,summerLowWind:{east:weightedSeason(r.local.eastWindMps,ms,j.monthly),north:weightedSeason(r.local.northWindMps,ms,j.monthly)},summerColumnWaterKgM2:weightedSeason(r.local.columnWaterKgM2,ms,j.monthly),summerLandMinusOceanSkinK:landSkin?weightedSeason(landSkin,ms,j.monthly)-weightedSeason(oceanMonthly.map(v=>v.sstK),ms,j.monthly):null,summerDiagnosticMoistureConvergenceMmDay:id==='reference'?null:weightedSeason(r.local.diagnosticMoistureConvergenceMmDay,ms,j.monthly)};
 });
 const budgetScope=b=>{
  const t=b.terms??b,raw=b.airWaterRawResidualMm??b.airWaterResidualMm,remaining=b.airWaterExcludingModeResidualMm??raw;
  const dry=(b.final.airMassKgM2-b.final.airWaterMm)/(b.initial.airMassKgM2-b.initial.airWaterMm)-1;
  const limit=Math.max(.05,.001*(Math.abs(t.evaporationMm)+t.precipitationMm));
  return {initial:b.initial,final:b.final,terms:t,totalAirMassRelative:b.airMassRelativeOriginal??b.airMassRelative,dryAirMassRelative:dry,dryAirMassPassed:Math.abs(dry)<=1e-6,airWaterRawResidualMm:raw,airWaterExcludingCurrentModeResidualMm:remaining,airWaterLimitMm:limit,airWaterPassed:Math.abs(remaining)<=limit,landRawResidualMm:b.landRawResidualMm??b.landWaterResidualMm,landLedgerResidualMm:b.landLedgerResidualMm??null,landWaterPassed:id!=='reference'&&Math.abs(b.landLedgerResidualMm)<=1e-6};
 };
 const budget={fullSpan:budgetScope(j.budget),statisticsYear:budgetScope(j.statisticsBudget),massMode:j.massMode??null,maxOceanHeatResidualStepJm2:j.maxOceanHeatResidualStepJm2??j.oceanHeatResidualMaxPerStepJm2};
 for(const scope of [budget.fullSpan,budget.statisticsYear])if(id!=='reference') {
  const t=scope.terms,delta=scope.final.oceanSensibleHeatJm2-scope.initial.oceanSensibleHeatJm2;
  scope.oceanLedgerResidualJm2=delta-t.oceanSurfaceInputJm2-t.oceanFreezingAdjustmentJm2-t.prescribedSstExternalHeatJm2;
 }
 const wetYear=j.monthly.reduce((s,a)=>s+sum(a.precipitationMm.map((v,k)=>v*g.weights[k])),0);
 assert(Math.abs(wetYear-budget.statisticsYear.terms.precipitationMm)<1e-8,'Native monthly precipitation ledger differs');
 checks.push({id,conservation,monthlyNativePrecipitationMm:wetYear});
 const display=id==='reference'?oldDisplay:{...oldDisplay,frames:mapped.map((a,m)=>({label:`2006年${m+1}月平均`,kind:'monthly-mean',month:m+1,timeS:oldDisplay.frames[m].timeS,layers:a.layers.map(({specificHumidity,...rest})=>rest),surface:{pressurePa:Array.from(a.pressurePa),seaIceConcentration:Array.from(a.ice),rainMmDay:Array.from(a.rain,v=>v/j.monthly[m].seconds*86400)}}))};
 const maxDisplayWind=display.frames.reduce((max,f)=>f.layers.reduce((max,l)=>[...l.windEastMps,...l.windNorthMps].reduce((max,v)=>Math.max(max,Math.abs(v)),max),max),0);assert(maxDisplayWind<=100,'Renderer packing would clip actual monthly winds');
 cases.push({id,integration:{calls:j.calls,start:j.start,end:j.actualEnd,statisticsStart:j.statisticsStart,statisticsEnd:j.statisticsEnd,secondsWall:j.secondsWall,initialAtmLandSHA:initialSHA},budget,regions,monsoon,maxDisplayWind});
 displayCases.push({id,label:{reference:'原配置 · 50 m 混合层',slab:'修复后 · 自由海温',seasonal:'修复后 · 规定季节海温'}[id],description:{reference:'原始独立实验，预算未修正。',slab:'排水记账和干空气质量约束，海温自由演化。',seasonal:'相同修复；海温边界外部热量单独记账。'}[id],data:display});
}
const deltas=cases[2].regions.map(r=>{
 const slab=cases[1].regions.find(v=>v.name===r.name),ref=cases[0].regions.find(v=>v.name===r.name);
 return {name:r.name,seasonalMinusSlabAnnualMm:r.modelAnnualMm-slab.modelAnnualMm,seasonalMinusSlabMonthlyMAEMm:r.monthlyMAEMm-slab.monthlyMAEMm,seasonalMinusReferenceMonthlyMAEMm:r.monthlyMAEMm-ref.monthlyMAEMm,seasonalSummerFractionChange:r.summerFraction===null?null:r.summerFraction-slab.summerFraction};
});
await writeFile(`${out}/comparison-display.json`,JSON.stringify({format:'speedyweather-sst-comparison',version:1,initialAtmLandSHA:initialSHA,cases:displayCases}));
const result={cases,deltas,gpcc:{product:gpcc.product,url:gpcc.url,method:'Same fixed GPCC-valid geographic land support; native atmospheric rain+snow conservatively mapped to 48×24. Single model year versus 1991–2020 climatology is a sensitivity test, not a validated climate.'},diagnostics:{lowLevelSigma:.9375,marineBoxes:oceanBoxes,sstGradientMethod:'Native marine Gaussian weights, regional monthly SST least-squares plane in longitude/latitude, converted to K/1000km at the weighted mean latitude. Fixed regional support, no local SST correction.',convergenceMethod:'Monthly native integrated q*u/q*v remapped to equal-area grid, averaged across adjacent faces and differenced with spherical geometry. Coarse spatial diagnostic only; not an exact native atmospheric water closure.'},remapping:checks,acceptance:{formalDefaultUnchanged:true,regionalClimateAccepted:false,fullEarthWaterBudgetAvailable:false,fullEarthEnergyBudgetAvailable:false,nsidcPredictionAccepted:false}};
await writeFile(`${folder}/acceptance.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({cases:cases.map(c=>({id:c.id,budget:{year:c.budget.statisticsYear,full:c.budget.fullSpan,mass:c.budget.massMode},regions:c.regions.map(({local,monthlyMm,observedMonthlyMm,...r})=>r),monsoon:c.monsoon})),deltas},null,2));
