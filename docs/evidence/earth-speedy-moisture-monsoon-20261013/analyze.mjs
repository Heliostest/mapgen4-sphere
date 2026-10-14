import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRemap,remapScalar} from '../earth-speedyweather-20261012/remap.mjs';
import {matchedSupport} from '../../../climate-diagnostics.ts';
import {CASE_IDENTITIES,INITIAL_ATM_LAND_SHA,decodeComparison} from './comparison-contract.ts';
const folder='docs/evidence/earth-speedy-moisture-monsoon-20261013',out='build/earth-speedy-moisture-monsoon';
const load=async p=>JSON.parse(await readFile(p,'utf8')),sum=a=>Array.from(a).reduce((s,v)=>s+v,0);
const [gpcc,control,initial,template]=await Promise.all([
 load('docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json'),load('build/earth-seasonal-pressure/full-control.json'),
 load('build/earth-seasonal-pressure/full-control-day0.json'),load('build/earth-speedyweather/display.json')]);
const ablationOnly=process.argv.includes('--ablation-only');
const specs=[['build/earth-speedy-budgets-sst','seasonal'],[out,'moisture-seasonal'],[out,'coupled-slab'],[out,'coupled-seasonal']].slice(0,ablationOnly?2:4);
const cases=[],displayCases=[];
const budgets=b=>{const t=b.terms;for(const v of [t.evaporationMm,t.precipitationMm,b.airWaterExcludingModeResidualMm,b.landLedgerResidualMm,b.dryAirMassRelative])assert(typeof v==='number'&&Number.isFinite(v),'Finite budget number required');const limit=Math.max(.05,.001*(Math.abs(t.evaporationMm)+t.precipitationMm));return {...b,airWaterLimitMm:limit,airWaterPassed:Math.abs(b.airWaterExcludingModeResidualMm)<=limit,landWaterPassed:Math.abs(b.landLedgerResidualMm)<=1e-6,dryAirMassPassed:Math.abs(b.dryAirMassRelative)<=1e-6};};
for(let ci=0;ci<specs.length;ci++){
 const [base,prefix]=specs[ci],identity=CASE_IDENTITIES[ci];
 const [j,g]=await Promise.all([load(`${base}/${prefix}-statistics.json`),load(`${base}/${prefix}-geometry.json`)]);
 assert.equal(j.mode,['seasonal','seasonal','slab','seasonal'][ci]);
 assert.equal(j.actualEnd,'2007-01-01T00:00:00');assert.equal(j.statisticsStart,'2006-01-01T00:00:00');
 assert.equal(j.calls,105169);assert.equal(j.initialAtmLandSHA,INITIAL_ATM_LAND_SHA);assert.equal(j.monthly.length,12);
 assert.equal(g.npoints,3168);assert.equal(g.nlayers,8);assert.equal(g.truncation,32);
 assert.equal(g.stepS,1800);assert.equal(j.version,'0.23.0');assert.deepEqual(g.sigmaFull,[.0625,.1875,.3125,.4375,.5625,.6875,.8125,.9375]);
 const map=createRemap(g),n=g.npoints,marine=g.landFraction.map(v=>1-v),mapped=[],remapping=[];
 for(let k=0;k<12;k++){
  const m=j.monthly[k];assert.equal(m.month,k+1);assert.equal(m.seconds,[31,28,31,30,31,30,31,31,30,31,30,31][k]*86400);
  const surface=Object.fromEntries(Object.entries(m.surface).map(([key,a])=>[key,remapScalar(map,a).values]));
  const rain=remapScalar(map,m.precipitationMm),landRain=remapScalar(map,m.precipitationMm,g.landFraction),ice=remapScalar(map,m.surface.seaIceConcentration,marine);
  const raw=sum(m.precipitationMm.map((v,i)=>v*g.weights[i]*g.landFraction[i]));
  const target=sum(Array.from(landRain.values,(v,i)=>v*landRain.coverage[i]))/map.count;
  assert(Math.abs(raw-target)<1e-9*Math.max(1,Math.abs(raw)));
  const fields=[['temperatureK','temperatureK'],['windEastMps','u'],['windNorthMps','v'],['specificHumidity','specificHumidity']];
  if(m.layers.relativeHumidity)fields.push(['relativeHumidity','relativeHumidity']);
  const layers=Array.from({length:8},(_,l)=>Object.fromEntries(fields.map(([key,source])=>[key,Array.from(remapScalar(map,m.layers[source].slice(l*n,(l+1)*n)).values)])));
  const evaporation=remapScalar(map,m.evaporationMm).values;
  mapped.push({layers,surface,rain:rain.values,ice:ice.values,evaporation});remapping.push({month:k+1,nativeLandRainGlobalMm:raw,mappedLandRainGlobalMm:target,errorMm:target-raw});
 }
 const regions=control.gpcc.map(r=>{
  const support=matchedSupport(map,initial.runtime.state.land,r.bounds,gpcc.cells),obs=Array.from(support.observedMonthlyMm);
  assert(Math.abs(sum(obs)-r.observedAnnualMm)<1e-8);
  const monthly=mapped.map(m=>support.mean(m.rain)),annual=sum(monthly),DJF=sum([11,0,1].map(k=>monthly[k])),JJA=sum([5,6,7].map(k=>monthly[k]));
  const south=r.bounds.north<=0,north=r.bounds.south>=0,summer=south?[11,0,1]:north?[5,6,7]:null;
  const profiles=Array.from({length:8},(_,l)=>({sigma:g.sigmaFull[l],...Object.fromEntries(Object.keys(mapped[0].layers[l]).map(key=>[key,mapped.map(a=>support.mean(a.layers[l][key]))]))}));
  const surface=Object.fromEntries(Object.keys(mapped[0].surface).map(key=>[key,mapped.map(a=>support.mean(a.surface[key]))]));
  const seasonalMean=(a,months)=>a?sum(months.map(k=>a[k]*j.monthly[k].seconds))/sum(months.map(k=>j.monthly[k].seconds)):null;
  const seasons=Object.fromEntries([['DJF',[11,0,1]],['JJA',[5,6,7]]].map(([name,months])=>[name,{
   lowestAirK:seasonalMean(profiles[7].temperatureK,months),landSkinK:seasonalMean(surface.landSkinK,months),
   skinMinusLowestAirK:seasonalMean(surface.landSkinK,months)-seasonalMean(profiles[7].temperatureK,months),
   lowestHumidity:seasonalMean(profiles[7].specificHumidity,months),lowestRelativeHumidity:seasonalMean(profiles[7].relativeHumidity,months),
   lowestNorthWindMps:seasonalMean(profiles[7].windNorthMps,months),
   landEvaporationMmDay:seasonalMean(surface.landEvaporationMmDay,months),landSensibleHeatWm2:seasonalMean(surface.landSensibleHeatWm2,months),
   verticalMixingActiveFraction:seasonalMean(surface.verticalMixingActiveFraction,months),
  }]));
  return {name:r.name,bounds:r.bounds,monthlyMm:monthly,observedMonthlyMm:obs,modelAnnualMm:annual,observedAnnualMm:sum(obs),annualBiasMm:annual-sum(obs),monthlyMAEMm:sum(monthly.map((v,k)=>Math.abs(v-obs[k])))/12,
   DJFMm:DJF,JJAMm:JJA,summerFraction:summer?sum(summer.map(k=>monthly[k]))/annual:null,observedSummerFraction:summer?sum(summer.map(k=>obs[k]))/sum(obs):null,
   peakMonth:monthly.indexOf(Math.max(...monthly))+1,observedPeakMonth:obs.indexOf(Math.max(...obs))+1,validLandAreaKm2:support.solidAngle*g.radiusM**2/1e6,profiles,surface,seasons,evaporationMm:mapped.map(a=>support.mean(a.evaporation))};
 });
 const startup=j.audits.find(a=>a.stock.time==='2001-01-04T00:00:00');assert(startup);
 const year=budgets(j.statisticsBudget),full=budgets(j.budget);
 const nativeRain=sum(j.monthly.map(m=>sum(m.precipitationMm.map((x,i)=>x*g.weights[i]))));assert(Math.abs(nativeRain-year.terms.precipitationMm)<1e-8);
 const record={...identity,source:{base,prefix,initialSHA:j.initialAtmLandSHA,calls:j.calls,end:j.actualEnd,secondsWall:j.secondsWall},regions,budget:{startup,year,full},massMode:j.massMode,remapping};cases.push(record);
 const frames=mapped.map((a,k)=>({...template.frames[k],layers:a.layers.map(({temperatureK,windEastMps,windNorthMps})=>({temperatureK,windEastMps,windNorthMps})),surface:{pressurePa:Array.from(a.surface.pressurePa),seaIceConcentration:Array.from(a.ice),rainMmDay:Array.from(a.rain,v=>v/j.monthly[k].seconds*86400)}}));
 displayCases.push({...identity,data:{...template,frames}});
}
const diagnosis=cases.slice(1).map(c=>({id:c.id,regions:c.regions.map(r=>{
 const before=cases[0].regions.find(b=>b.name===r.name),distance=Math.abs(r.peakMonth-r.observedPeakMonth),monsoon=['India','Australia north'].includes(r.name);
 return {name:r.name,annualDeltaMm:r.modelAnnualMm-before.modelAnnualMm,monthlyMAEDeltaMm:r.monthlyMAEMm-before.monthlyMAEMm,summerFractionDelta:r.summerFraction===null?null:r.summerFraction-before.summerFraction,
  // Predeclared sensitivity-screen only, never a replacement for multi-year climate validation.
  seasonalScreen:monsoon?{peakWithinOneMonth:Math.min(distance,12-distance)<=1,summerMajority:r.summerFraction>=.5,annualWithin25Percent:Math.abs(r.annualBiasMm)<=.25*r.observedAnnualMm,monthlyMAEImproves:r.monthlyMAEMm<before.monthlyMAEMm}:null};
})}));
const display={format:'speedyweather-sst-comparison',version:1,initialAtmLandSHA:INITIAL_ATM_LAND_SHA,cases:displayCases};
if(!ablationOnly){decodeComparison(display);await writeFile(`${out}/comparison-display.json`,JSON.stringify(display));}
const result={cases,diagnosis,gpcc:{product:gpcc.product,url:gpcc.url,method:'Same fixed GPCC-valid geographic land support as the frozen experiment. 2006 model year versus 1991–2020 climatology.'},acceptance:{formalDefaultUnchanged:true,regionalClimateAccepted:false,fullEarthWaterBudgetAvailable:false,fullEarthEnergyBudgetAvailable:false}};
await writeFile(`${folder}/${ablationOnly?'ablation-acceptance':'acceptance'}.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(cases.map(c=>({id:c.id,waterYear:c.budget.year.airWaterExcludingModeResidualMm,waterYearPass:c.budget.year.airWaterPassed,regions:c.regions.filter(r=>['India','Australia north'].includes(r.name)).map(({name,modelAnnualMm,monthlyMAEMm,summerFraction,peakMonth})=>({name,modelAnnualMm,monthlyMAEMm,summerFraction,peakMonth}))})),null,2));
