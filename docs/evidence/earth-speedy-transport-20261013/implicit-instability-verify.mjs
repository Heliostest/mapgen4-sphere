import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const docs='docs/evidence/earth-speedy-transport-20261013',build='build/earth-speedy-transport';
const load=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
const records=[];let checks=0;
for(const label of ['thermal','all']){
 const path=`${build}/implicit-instability-${label}-v2.json`,r=await load(path);
 const status=await load(`${docs}/implicit-instability-${label}-v2-native-status.json`);
 assert.equal(status.code,0);assert.equal(status.sourceUnchanged,true);assert.equal(status.inputsUnchanged,true);
 assert.equal(r.nativeFirstStepExact,true);assert.equal(r.failure.kind,'first_nonpositive_poststep_temperature');checks+=5;
 assert.ok(r.records.slice(0,-1).every(x=>x.minTemperatureK>0));assert.ok(r.records.at(-1).minTemperatureK<0);checks+=2;
 for(const row of r.records){
  const final=row.stages.find(s=>s.name==='horizontal_diffusion');
  assert.ok(Math.abs(final.minCandidateK-row.minTemperatureK)<1e-9);
  assert.ok(Math.abs(final.maxCandidateK-row.maxTemperatureK)<1e-9);checks+=2;
 }
 const bad=r.records.at(-1),w2=.1*(1-.53)/2,base=(1-2*w2)*bad.oldSpectralTemperatureK+2*w2*bad.currentSpectralTemperatureK;
 const localCandidates=Object.fromEntries(Object.entries(bad.ratesAtMinimumKSec).map(([k,v])=>[k,base+(1-w2)*3600*v]));
 assert.ok(Math.abs(localCandidates.horizontal_diffusion-bad.minTemperatureK)<1e-9);checks++;
 const first=(test)=>r.records.find(test)?.time??null;
 records.push({label,source:path,nSteps:r.records.length,firstNegativeTime:bad.time,latitude:bad.lat,longitude:bad.lon,layer:bad.k,
  firstNegativeK:bad.minTemperatureK,highestSameStepK:bad.maxTemperatureK,
  nominalStepCourant:bad.maxVerticalCourant/2,fullLeapfrogSpanCourant:bad.maxVerticalCourant,
  firstNominalCourantOverQuarter:first(x=>x.maxVerticalCourant>.5),
  firstNominalCourantOverHalf:first(x=>x.maxVerticalCourant>1),
  firstNominalCourantOverOne:first(x=>x.maxVerticalCourant>2),
  firstTemperatureBelow150K:first(x=>x.minTemperatureK<150),
  physicalGridRateAtBadCellKDay:bad.physicalRateKDay,oldSpectralK:bad.oldSpectralTemperatureK,
  currentSpectralK:bad.currentSpectralTemperatureK,localCandidates,
  beforeColumn:bad.atMinimumColumn.beforeT,reference:bad.atMinimumColumn.reference,
  finalTwelveHours:r.records.slice(-25).map(x=>({time:x.time,minK:x.minTemperatureK,maxK:x.maxTemperatureK,
   nominalStepCourant:x.maxVerticalCourant/2,ij:x.ij,k:x.k,oldK:x.oldSpectralTemperatureK,currentK:x.currentSpectralTemperatureK}))});
}
const result={passed:true,checks,note:'Successful diagnostic execution reproduces model failure; code=0 is NOT climate stability acceptance. Courant divides the full 3600 s Leapfrog span by two to report nominal 1800 s Courant.',records};
await writeFile(`${docs}/implicit-instability-verification.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:true,checks,records:records.map(({finalTwelveHours,...rest})=>rest)},null,2));
