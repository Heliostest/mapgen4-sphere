import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {deriveOrbit} from '../../../astronomy.ts';
const folder='docs/evidence/earth-seaice-p1-20261011',load=async name=>JSON.parse(await readFile(`${folder}/${name}.json`,'utf8'));
const runs=await Promise.all(['baseline-1800','conductive-v2-1800','conductive-v2-900','conductive-v2-450'].map(name=>load(name+'-continuous')));
assert(runs.every(d=>d.strictRestoreNextStepExact));assert(runs.every(d=>d.inputSha256===runs[0].inputSha256&&d.initialStocksSha256===runs[0].initialStocksSha256));
const annual=runs.map(d=>d.records.find(r=>r.day===365)),two=runs.slice(0,2).map(d=>d.records.find(r=>r.day===730));assert(annual.every(Boolean)&&two.every(Boolean));
const legacy=await load('formal-legacy-conductive-v2-1800-continuous');assert(legacy.strictRestoreNextStepExact);assert.equal(legacy.initialStocksSha256,runs[0].initialStocksSha256);
const legacy24=legacy.records.find(r=>r.day===24),legacyState=JSON.parse(await readFile(legacy24.file,'utf8')).runtime;
assert.notEqual(legacyState.waterConfig.moistureScheme,'transport');assert.equal(legacyState.config.airRadiationFraction,undefined);assert.equal(legacyState.environmentConfig.conductiveSeaIce,true);
const sum=a=>a.reduce((s,v)=>s+v,0),iceTotal=r=>r.seaIce.north.iceGlobalMm+r.seaIce.south.iceGlobalMm;
const seasons=m=>({JJA:m[5]+m[6]+m[7],DJF:m[11]+m[0]+m[1]});
const result={formalSha256:runs[0].inputSha256,initialStocksSha256:runs[0].initialStocksSha256,strictRestoreNextStepExact:true,
 method:'Complete full-Earth actual integrations from identical restored formal day-zero stock. Experimental P0 transport and air radiation fraction 0.5 retained in both paired arms; only conductiveSeaIce differs. All gates remain experimental.',
 formalLegacySmoke:{days:24,dt:1800,initialStocksSha256:legacy.initialStocksSha256,budget:legacy24.budget,strictRestoreNextStepExact:legacy.strictRestoreNextStepExact,moistureScheme:'legacy',airRadiationFraction:0,conductiveSeaIce:true},
 budgetMax:Object.fromEntries(['waterResidualMm','enthalpyResidualJm2','maxCellVaporResidualMm'].map(key=>[key,Math.max(...runs.flatMap(d=>d.records.map(r=>Math.abs(r.budget[key]))))])),
 stocks:runs.slice(0,2).map((d,i)=>({label:d.label,day0:iceTotal(d.records[0]),day365:iceTotal(annual[i]),day730:iceTotal(two[i]),year1Change:iceTotal(annual[i])-iceTotal(d.records[0]),year2Change:iceTotal(two[i])-iceTotal(annual[i])})),
 convergence:annual[1].regions.map((r,i)=>({name:r.name,dt1800Mm:r.modelCumulativeMm,dt900Mm:annual[2].regions[i].modelCumulativeMm,dt450Mm:annual[3].regions[i].modelCumulativeMm,diff1800To900Mm:Math.abs(r.modelCumulativeMm-annual[2].regions[i].modelCumulativeMm),diff900To450Mm:Math.abs(annual[2].regions[i].modelCumulativeMm-annual[3].regions[i].modelCumulativeMm),relative900To450Percent:100*Math.abs(annual[2].regions[i].modelCumulativeMm-annual[3].regions[i].modelCumulativeMm)/annual[3].regions[i].modelCumulativeMm})),
 gpcc:annual[3].regions.map((r,i)=>({name:r.name,bounds:r.bounds,validLandAreaKm2:r.validLandAreaKm2,GPCCMm:r.observedAnnualMm,before1800Mm:annual[0].regions[i].modelCumulativeMm,after1800Mm:annual[1].regions[i].modelCumulativeMm,after450Mm:r.modelCumulativeMm,after450BiasPercent:100*(r.modelCumulativeMm/r.observedAnnualMm-1),modelSeasons:seasons(r.modelMonthlyMm),observedSeasons:seasons(r.observedMonthlyMm),wholeArea:r.wholeArea})),seaIceMonthly:[]};
const nsidc=await load('nsidc-1981-2010'),formal=JSON.parse(await readFile('scenes/earth-land-sea/earth-simulation.json','utf8')),yearDays=deriveOrbit(formal.terrain.settings.planet,formal.terrain.settings.orbit).yearS/86400;
const month=d=>{let j=0,left=((d/yearDays*365+78)%365+365)%365;for(const len of [31,28,31,30,31,30,31,31,30,31,30,31]){if(left<len)return j;left-=len;j++;}return 11;};
for(const name of ['baseline-1800','conductive-v2-1800']){
 const d=await load(`${name}-seaice`);
 for(const year of [1,2])for(const hemisphere of ['north','south']){
  const daily=d.daily.filter(r=>r.day>(year-1)*365&&r.day<=year*365);
  const extents=daily.map(r=>r[hemisphere].extentMillionKm2);
  const monthly=Array.from({length:12},(_,m)=>{const a=daily.filter(r=>month(r.day-.5)===m),obs=nsidc.records.find(r=>r.hemisphere===hemisphere&&r.month===m+1);return {month:m+1,samples:a.length,extentMillionKm2:sum(a.map(r=>r[hemisphere].extentMillionKm2))/a.length,areaMillionKm2:sum(a.map(r=>r[hemisphere].areaMillionKm2))/a.length,observedExtentNativeMillionKm2:obs.extentMillionKm2,observedAreaNativeMillionKm2:obs.areaMillionKm2};});
  result.seaIceMonthly.push({name,year,hemisphere,minimumMillionKm2:Math.min(...extents),maximumMillionKm2:Math.max(...extents),monthlyMinimum:monthly.reduce((a,b)=>a.extentMillionKm2<b.extentMillionKm2?a:b).month,monthlyMaximum:monthly.reduce((a,b)=>a.extentMillionKm2>b.extentMillionKm2?a:b).month,monthly});
 }
}
result.seaIceObservationMethod='Model monthly means of daily mass-derived extent proxy. NSIDC native extent is thresholded monthly-mean satellite concentration. Shelf/land/lake exclusion is only matched within model arms, not remapped to a common satellite grid; observational acceptance remains open.';
await writeFile(`${folder}/acceptance.json`,JSON.stringify(result,null,2)+'\n');
const files=['sea-ice-thermodynamics.ts','environment.ts','thermal.ts','thermal-runtime.ts','water.ts','circulation.ts','climate-diagnostics.ts','ocean.ts','refinement-surface.ts','runtime-state.ts','environment-panel.ts','geometry.ts','terrain-water-view.ts','config.js','scenes/earth-land-sea/earth-simulation.json','scenes/earth-land-sea/scene-config.json',`${folder}/integrate.ts`,`${folder}/performance.ts`,`${folder}/acceptance.json`,`${folder}/performance.json`,`${folder}/nsidc-1981-2010.json`];
const bindings=await Promise.all(files.map(async path=>({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')})));
await writeFile(`${folder}/manifest.json`,JSON.stringify({generatedAtUtc:new Date().toISOString(),bindings,runs:[...runs,legacy].map(d=>({label:d.label,dt:d.dt,bundleSha256:d.bundleSha256,initialStocksSha256:d.initialStocksSha256,records:d.records.map(r=>({day:r.day,path:r.file,sha256:r.sha256})),strictRestoreNextStepExact:d.strictRestoreNextStepExact})),graphics:'WebGL2 blocked in prior authorized session. No GPU screenshot/foreground timing supplied or inferred.',v1:'Reproduction evidence retained only; rejected because exhausted liquid could produce negative temperatures and restore/rollback diagnostics were stale.'},null,2)+'\n');
console.log(JSON.stringify({budgets:result.budgetMax,stocks:result.stocks,convergence:result.convergence,gpcc:result.gpcc.map(r=>[r.name,r.after450Mm,r.GPCCMm])},null,2));
