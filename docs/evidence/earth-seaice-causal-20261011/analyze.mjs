import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const folder='docs/evidence/earth-seaice-causal-20261011';
const load=async name=>JSON.parse(await readFile(`${folder}/${name}.json`,'utf8'));
const reference=await load('nsidc-same-grid'),grid=reference.grid,n=grid.width*grid.height;
const labels=['control-1800','thermal-only-1800','fair-transport-1800','fair-both-1800','shortwave-fair-1800','shortwave-fair-900'];
const continuous=await Promise.all(labels.map(l=>load(l+'-continuous'))),ice=await Promise.all(labels.map(l=>load(l+'-seaice')));
assert(continuous.every(r=>r.records.at(-1).day===365&&r.strictRestoreNextStepExact));
assert(continuous.every(r=>r.initialStocksSha256===continuous[0].initialStocksSha256&&r.inputSha256===continuous[0].inputSha256));
const sum=a=>a.reduce((s,v)=>s+v,0),weights=reference.supportM2;
const concentration=ice.map(a=>a.monthlyFields.cover.map((row,j)=>row.map(v=>v/a.monthlyCoverageS[j])));
const hemisphere=k=>k<n/2?'north':'south';
const polar=c=>Object.fromEntries(['north','south'].map(h=>{
 const ks=Array.from({length:n},(_,k)=>k).filter(k=>hemisphere(k)===h);
 return [h,{extentMillionKm2:sum(ks.map(k=>c[k]>=.15?weights[k]/1e12:0)),areaMillionKm2:sum(ks.map(k=>c[k]*weights[k]/1e12))}];
}));
const obs=reference.concentration.map(polar),model=concentration.map(c=>c.map(polar));
const extrema=a=>({min:Math.min(...a),max:Math.max(...a),minMonth:a.indexOf(Math.min(...a))+1,maxMonth:a.indexOf(Math.max(...a))+1});
const checks=continuous.map((r,i)=>({name:labels[i],conductiveSeaIce:ice[i].conductiveSeaIce,underIceOcean:ice[i].underIceOcean,
 monthlyCoverageS:ice[i].monthlyCoverageS,
 iceInitialGlobalMm:r.records[0].seaIce.north.iceGlobalMm+r.records[0].seaIce.south.iceGlobalMm,
 iceDay365GlobalMm:r.records.at(-1).seaIce.north.iceGlobalMm+r.records.at(-1).seaIce.south.iceGlobalMm,
 budgetMax:Object.fromEntries(['waterResidualMm','enthalpyResidualJm2','maxCellVaporResidualMm'].map(key=>[key,Math.max(...r.records.map(v=>Math.abs(v.budget[key])))])),
 hemispheres:Object.fromEntries(['north','south'].map(h=>{
  const ks=Array.from({length:n},(_,k)=>k).filter(k=>hemisphere(k)===h);
  const cMAE=concentration[i].map((c,j)=>sum(ks.map(k=>Math.abs(c[k]-reference.concentration[j][k])*weights[k]))/sum(ks.map(k=>weights[k])));
  return [h,{monthly:model[i].map((a,j)=>({month:j+1,...a[h],observed:obs[j][h],concentrationMeanAbsoluteErrorFraction:cMAE[j]})),extent:extrema(model[i].map(a=>a[h].extentMillionKm2)),area:extrema(model[i].map(a=>a[h].areaMillionKm2)),meanConcentrationMAE:sum(cMAE)/12,
   extentMonthlyMeanAbsoluteErrorMillionKm2:sum(model[i].map((a,j)=>Math.abs(a[h].extentMillionKm2-obs[j][h].extentMillionKm2)))/12}];
 }))}));
const annual=continuous.map(r=>r.records.at(-1));
const seasons=m=>({JJA:m[5]+m[6]+m[7],DJF:m[11]+m[0]+m[1]});
const gpcc=annual[5].regions.map((r,i)=>({name:r.name,bounds:r.bounds,validLandAreaKm2:r.validLandAreaKm2,observedAnnualMm:r.observedAnnualMm,oldBoth1800Mm:annual[3].regions[i].modelCumulativeMm,after1800Mm:annual[4].regions[i].modelCumulativeMm,after900Mm:r.modelCumulativeMm,bias900Percent:100*(r.modelCumulativeMm/r.observedAnnualMm-1),dtAbsoluteDifferenceMm:Math.abs(r.modelCumulativeMm-annual[4].regions[i].modelCumulativeMm),modelSeasons:seasons(r.modelMonthlyMm),observedSeasons:seasons(r.observedMonthlyMm),wholeArea:r.wholeArea}));
const bands=Array.from({length:grid.height},(_,y)=>Math.asin(1-2*(y+.5)/grid.height)*180/Math.PI);
const band=(i,month,lo,hi)=>{
 const ks=Array.from({length:n},(_,k)=>k).filter(k=>bands[Math.floor(k/grid.width)]>=lo&&bands[Math.floor(k/grid.width)]<=hi);
 const w=ks.map(k=>grid.support[k]*grid.cellAreaM2),total=sum(w);
 return Object.fromEntries(Object.entries(ice[i].monthlyFields).filter(([name])=>name!=='waterLatentWm2').map(([name,f])=>[name,sum(ks.map((k,j)=>f[month-1][k]/ice[i].monthlyCoverageS[month-1]*w[j]))/total]));
};
const southMidWinter=labels.map((name,i)=>({name,month:8,coarseCentreLatitudeBand:[-55,-40],fields:band(i,8,-55,-40)}));
const factors=Object.fromEntries(['north','south'].map(h=>[h,Array.from({length:12},(_,j)=>{
 const out={month:j+1};for(const quantity of ['extentMillionKm2','areaMillionKm2']) {
  const v=model.slice(0,4).map(a=>a[j][h][quantity]);
  out[quantity]={thermalAtTransportOff:v[1]-v[0],thermalAtTransportOn:v[3]-v[2],transportAtThermalOff:v[2]-v[0],transportAtThermalOn:v[3]-v[1],interaction:v[3]-v[2]-v[1]+v[0],shortwaveFixAtBothOn:model[4][j][h][quantity]-v[3],dt1800To900:model[5][j][h][quantity]-model[4][j][h][quantity]};
 }return out;
})]));
const source=JSON.parse(await readFile('scenes/earth-land-sea/earth-simulation.json','utf8'));
assert.equal(source.runtime.environmentConfig.conductiveSeaIce,undefined);assert.equal(source.runtime.environmentConfig.underIceOcean,undefined);
const result={formalSha256:continuous[0].inputSha256,initialStocksSha256:continuous[0].initialStocksSha256,strictRestoreNextStepExact:true,
 physicalYearDays:grid.physicalYearDays,integrationDays:365,missingOrbitalYearDays:grid.physicalYearDays-365,
 method:'Six full authored Earth real 365-day integrations; exact same initial physical stocks and full routing. Experimental transport/airRadiationFraction=0.5 in all runs. Fair two-by-two controls use identical ocean wet support. Pair before/after shortwave at both flags on. No seasonal seeks. Monthly model concentration time means and 1981-2010 monthly observed concentration means both remapped to the exact same fixed valid marine weights, then apply 15% coarse-cell threshold. Model concentration is still a mass-derived proxy, not an independently evolved concentration. One transient year is not a converged climate.',
 observationalStatus:'Same-grid acceptance performed; seasonal coverage remains failed. No threshold tuning, formal defaults or source stocks changed.',
 observation:{product:reference.product,doi:reference.doi,variable:reference.variable,commonMillionKm2:reference.commonMillionKm2,unrepresentedMarineMillionKm2:grid.unrepresentedMarineMillionKm2,yearsPerMonth:reference.yearsPerMonth,excludedFiles:reference.excludedFiles,extent:Object.fromEntries(['north','south'].map(h=>[h,extrema(obs.map(a=>a[h].extentMillionKm2))])),area:Object.fromEntries(['north','south'].map(h=>[h,extrema(obs.map(a=>a[h].areaMillionKm2))])),quadratureConvergence:reference.quadratureConvergence},
 budgetMax:Object.fromEntries(['waterResidualMm','enthalpyResidualJm2','maxCellVaporResidualMm'].map(key=>[key,Math.max(...checks.map(r=>r.budgetMax[key]))])),runs:checks,monthlyObserved:obs,factors,southMidWinter,gpcc,
 maxSkinBalanceResidualWm2:Math.max(...ice.map(a=>a.maxSkinResidualWm2)),
 temporalConvergence:Object.fromEntries(['north','south'].map(h=>{const ks=Array.from({length:n},(_,k)=>k).filter(k=>hemisphere(k)===h);return [h,{maxMonthlyExtentDifferenceMillionKm2:Math.max(...model[4].map((m,j)=>Math.abs(m[h].extentMillionKm2-model[5][j][h].extentMillionKm2))),maxMonthlyAreaDifferenceMillionKm2:Math.max(...model[4].map((m,j)=>Math.abs(m[h].areaMillionKm2-model[5][j][h].areaMillionKm2))),monthlyConcentrationWeightedAbsoluteDifference:concentration[4].map((c,j)=>sum(ks.map(k=>weights[k]*Math.abs(c[k]-concentration[5][j][k])))/sum(ks.map(k=>weights[k])))}]})),
 diagnosticCorrection:'Frozen old bundles label env.oceanHeatJm2/dt as waterLatentWm2. This is only the final phase-call heat after overwrite, not full evaporation latent heat or full phase heat. It was excluded from analysis. New harness calls it lastPhaseHeatWm2; actual net phase is accumulated across both phase calls.',
 limitations:['No independent concentration: before full ice coverage, A=M/(rho*0.5m), hence diagnosed thickness M/(rho*A)=0.5m. Basal freezing cannot thicken at fixed area in this representation.','Whole-column radiative forcing remains the original effective closure; shortwave allocation fixes leads versus ice but is not a full downwelling-longwave/snow/ice dynamics model.','NSIDC G02202 v2 NT historical field differs from current G02135; cross-check limited to cached north Jan-Jun. Explicit version and mask, no claimed product equivalence.','NSIDC square polar grid limits spatial support; all no-data/pole holes excluded. Common extent is not the native extent including filled pole hole.','Fixed shelf geometry and terrain-centroid lake/marine classification; 16-subsample quadrature convergence attached.']};
await writeFile(`${folder}/acceptance.json`,JSON.stringify(result,null,2)+'\n');
const sha=b=>createHash('sha256').update(b).digest('hex');
const paths=['sea-ice-thermodynamics.ts','environment.ts','ocean.ts','refinement-surface.ts','runtime-state.ts','environment-panel.ts','scenes/earth-land-sea/sidebar-zh.js','tests/environment.test.ts','tests/simulation.test.ts','config.js','scenes/earth-land-sea/earth-simulation.json','scenes/earth-land-sea/scene-config.json',`${folder}/integrate.ts`,`${folder}/analyze.mjs`,`${folder}/analyze-factorial.mjs`,`${folder}/export-mask.ts`,`${folder}/prepare-fair.mjs`,`${folder}/download-ncei.mjs`,`${folder}/remap-nsidc.py`,`${folder}/check-index.py`,`${folder}/plot.py`,`${folder}/report.mjs`,`${folder}/acceptance.json`,`${folder}/nsidc-same-grid.json`,`${folder}/nsidc-inputs.json`,`${folder}/nsidc-index-crosscheck.json`];
const bindings=await Promise.all(paths.map(async path=>({path,sha256:sha(await readFile(path))})));
await writeFile(`${folder}/manifest.json`,JSON.stringify({generatedAtUtc:new Date().toISOString(),bindings,runs:continuous.map(r=>({label:r.label,dt:r.dt,bundleSha256:r.bundleSha256,initialStocksSha256:r.initialStocksSha256,strictRestoreNextStepExact:r.strictRestoreNextStepExact,records:r.records.map(c=>({day:c.day,path:c.file,sha256:c.sha256}))})),baselines:{original:'build/earth-seaice-causal/integrate-factorial.mjs',sharedMask:'build/earth-seaice-causal/integrate-factorial-sharedmask.mjs',current:'build/earth-seaice-causal/integrate-shortwave-sharedmask.mjs'},excludedRuns:['transport-only/both old bundle changes the lake mask along with frozen mask; superseded by fair-transport/fair-both.','shortwave-1800/900 were intentionally stopped partial probes and use the confounded mask; not accepted.'],graphics:'Numeric plots only. Prior WebGL2 initialization blocker remains; no browser restart or internal GPU pages used.'},null,2)+'\n');
console.log(JSON.stringify({budgetMax:result.budgetMax,observation:result.observation,runs:checks.map(r=>({name:r.name,stock:r.iceDay365GlobalMm,north:r.hemispheres.north.extent,south:r.hemispheres.south.extent,southMAE:r.hemispheres.south.extentMonthlyMeanAbsoluteErrorMillionKm2})),southMidWinter,gpcc},null,2));
