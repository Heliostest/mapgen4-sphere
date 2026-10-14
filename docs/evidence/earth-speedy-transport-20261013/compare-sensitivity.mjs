import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRemap,remapScalar} from '../earth-speedyweather-20261012/remap.mjs';
import {matchedSupport} from '../../../climate-diagnostics.ts';
const load=async p=>JSON.parse(await readFile(p,'utf8')),sum=a=>Array.from(a).reduce((s,v)=>s+v,0);
const folder='docs/evidence/earth-speedy-transport-20261013',out='build/earth-speedy-transport';
const prefixes=process.argv.slice(2);assert(prefixes.length);
const [gpcc,control,initial,baseline]=await Promise.all([
 load('docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json'),load('build/earth-seasonal-pressure/full-control.json'),
 load('build/earth-seasonal-pressure/full-control-day0.json'),load('docs/evidence/earth-speedy-moisture-monsoon-20261013/acceptance.json')]);
const old=baseline.cases.find(c=>c.id==='coupled-seasonal');
const budgetChecks=b=>{
 const waterLimitMm=Math.max(.05,.001*(Math.abs(b.terms.evaporationMm)+b.terms.precipitationMm));
 for(const n of [waterLimitMm,b.airWaterExcludingModeResidualMm,b.landLedgerResidualMm,b.dryAirMassRelative])assert(Number.isFinite(n));
 return {waterLimitMm,waterPassed:Math.abs(b.airWaterExcludingModeResidualMm)<=waterLimitMm,
  landWaterPassed:Math.abs(b.landLedgerResidualMm)<=1e-6,dryAirMassPassed:Math.abs(b.dryAirMassRelative)<=1e-6};
};
const cases=[];
for(const prefix of prefixes){
 const [s,g]=await Promise.all([load(`${out}/${prefix}-statistics.json`),load(`${out}/${prefix}-geometry.json`)]);
 assert.equal(s.actualEnd,'2007-01-01T00:00:00');assert.equal(s.monthly.length,12);
 assert.equal(s.stepS,1800);assert.equal(g.npoints,3168);assert.equal(s.statisticsStart,'2006-01-01T00:00:00');
 assert.equal(g.nlayers,8);
 const full=s.stage==='five-year-spinup-one-statistics-year';
 assert(full||s.stage==='same-2006-state-one-year-sensitivity');
 assert.equal(s.start,full?'2001-01-01T00:00:00':'2006-01-01T00:00:00');
 assert.equal(s.calls,full?105169:17520);
 assert.equal(s.initialAtmLandSHA,full?'4c665c83b08918fad6f8b67968fae472539c8796515afc93a22099d682b44a68':'85239455dd7cfb118de88d71db503906261e986f12a7161d9f894f4389e99bae');
 const map=createRemap(g),rain=s.monthly.map(m=>remapScalar(map,m.precipitationMm).values);
 const regions=control.gpcc.map(r=>{
  const support=matchedSupport(map,initial.runtime.state.land,r.bounds,gpcc.cells),obs=Array.from(support.observedMonthlyMm),monthlyMm=rain.map(a=>support.mean(a));
  const before=old.regions.find(x=>x.name===r.name),frozen=baseline.cases.find(c=>c.id==='before-seasonal').regions.find(x=>x.name===r.name),modelAnnualMm=sum(monthlyMm),observedAnnualMm=sum(obs),monthlyMAEMm=sum(monthlyMm.map((x,k)=>Math.abs(x-obs[k])))/12;
  const summer=r.bounds.north<=0?[11,0,1]:[5,6,7],summerFraction=sum(summer.map(k=>monthlyMm[k]))/modelAnnualMm;
  const peakMonth=monthlyMm.indexOf(Math.max(...monthlyMm))+1,observedPeakMonth=obs.indexOf(Math.max(...obs))+1,dist=Math.abs(peakMonth-observedPeakMonth);
  return {name:r.name,monthlyMm,observedMonthlyMm:obs,modelAnnualMm,observedAnnualMm,monthlyMAEMm,monthlyMAEDeltaMm:monthlyMAEMm-before.monthlyMAEMm,monthlyMAEDeltaFrozenBaselineMm:monthlyMAEMm-frozen.monthlyMAEMm,summerFraction,peakMonth,observedPeakMonth,
   monsoonScreen:['India','Australia north'].includes(r.name)?{peakWithinOneMonth:Math.min(dist,12-dist)<=1,summerMajority:summerFraction>=.5,annualWithin25Percent:Math.abs(modelAnnualMm-observedAnnualMm)<=.25*observedAnnualMm,monthlyMAEImproves:monthlyMAEMm<frozen.monthlyMAEMm}:null};
 });
 cases.push({prefix,physicsFix:s.physicsFix,stage:s.stage,initialAtmLandSHA:s.initialAtmLandSHA,calls:s.calls,secondsWall:s.secondsWall,regions,budget:s.statisticsBudget,...budgetChecks(s.statisticsBudget),
  fullBudget:s.budget,fullBudgetChecks:budgetChecks(s.budget),maxOceanHeatResidualStepJm2:s.maxOceanHeatResidualStepJm2,
  regionsMAEIncreased:regions.filter(r=>r.monthlyMAEDeltaMm>0).length,
  monsoonPassed:regions.filter(r=>r.monsoonScreen).every(r=>Object.values(r.monsoonScreen).every(Boolean))});
}
await writeFile(`${folder}/sensitivity-comparison.json`,JSON.stringify({note:'Deltas compare coupled-seasonal; predeclared monsoon MAE gate still compares the frozen before-seasonal baseline. Same 2006 state is not an equilibrated climate. Full six-year runs are explicitly identified by stage.',cases},null,2)+'\n');
console.log(JSON.stringify(cases.map(c=>({prefix:c.prefix,stage:c.stage,waterPassed:c.waterPassed,regionsMAEIncreased:c.regionsMAEIncreased,regions:c.regions.filter(r=>r.monsoonScreen).map(r=>({name:r.name,annualMm:r.modelAnnualMm,summerFraction:r.summerFraction,peakMonth:r.peakMonth,monthlyMAEMm:r.monthlyMAEMm,gates:r.monsoonScreen}))})),null,2));
