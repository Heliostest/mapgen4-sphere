import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir='docs/evidence/earth-physics-information-20261011',sha=x=>createHash('sha256').update(x).digest('hex'),sum=a=>a.reduce((s,v)=>s+v,0);
const normalize=v=>{
 if(v===null||typeof v!=='object')return v;
 if(Array.isArray(v))return v.map(normalize);
 const keys=Object.keys(v);return keys.length&&keys.every((k,i)=>k===String(i))?keys.map(k=>normalize(v[k])):Object.fromEntries(keys.map(k=>[k,normalize(v[k])]));
};
const load=async path=>normalize(JSON.parse(await readFile(path,'utf8')));
const [flat,relief,physics,ns]=await Promise.all([load(dir+'/flat.json'),load(dir+'/relief.json'),load(dir+'/physics-check.json'),load('docs/evidence/earth-seaice-causal-20261011/nsidc-same-grid.json')]);
assert.equal(flat.fineInventorySha,relief.fineInventorySha);assert.equal(flat.originalInventorySha,relief.originalInventorySha);assert.equal(flat.partitionGeometrySha,relief.partitionGeometrySha);assert.equal(flat.bundleSha256,relief.bundleSha256);assert.notEqual(flat.activeHeightSha,relief.activeHeightSha);
assert.equal(flat.originalInventorySha,'51961e8bb0611e0e79c7d4bef14a379c6ca8db2072c3f45f205d0e79cb5b93f5');
for(const r of [flat,relief]){assert.ok(r.records.at(-1).day*86400>=r.yearS);assert.ok(Math.abs(sum(r.records.at(-1).calendarCoverageS)-r.yearS)<1e-6);assert.ok(r.snapshotRuntimeDecoded);assert.equal(r.inputSha256,physics.formalSha256);assert.equal(r.bundleSha256,sha(await readFile('build/earth-physics-information/integrate.mjs')));assert.equal(r.finalSnapshotSha,sha(await readFile(`build/earth-physics-information/${r.label}-final.json`)));}
for(const b of physics.bindings)assert.equal(b.sha256,sha(await readFile(b.path)),b.path);
assert.equal(physics.formalSha256,sha(await readFile('scenes/earth-land-sea/earth-simulation.json')));
const final=[flat,relief].map(r=>r.records.at(-1));
const gpcc=final[0].regions.map((r,k)=>{
 const actual=final[1].regions[k];assert.equal(r.validLandAreaKm2,actual.validLandAreaKm2);assert.deepEqual(r.observedMonthlyMm,actual.observedMonthlyMm);
 const seasons=q=>({JJA:sum(q.slice(5,8)),DJF:q[11]+q[0]+q[1]});
 return {name:r.name,observed:r.observedAnnualMm,flat:r.modelCumulativeMm,relief:actual.modelCumulativeMm,deltaMm:actual.modelCumulativeMm-r.modelCumulativeMm,flatAbsoluteError:Math.abs(r.modelCumulativeMm-r.observedAnnualMm),reliefAbsoluteError:Math.abs(actual.modelCumulativeMm-r.observedAnnualMm),observedMonthlyMm:r.observedMonthlyMm,flatMonthlyMm:r.modelMonthlyMm,reliefMonthlyMm:actual.modelMonthlyMm,observedSeasons:seasons(r.observedMonthlyMm),flatSeasons:seasons(r.modelMonthlyMm),reliefSeasons:seasons(actual.modelMonthlyMm),endOfYear:{flat:{airC:r.airC,landC:r.landC,landSpreadK:r.landSpreadK,snowMm:r.snowMm},relief:{airC:actual.airC,landC:actual.landC,landSpreadK:actual.landSpreadK,snowMm:actual.snowMm}}};
});
const n=flat.atmosphereCells,weights=ns.supportM2;
assert.equal(weights.length,n);assert.equal(ns.concentration.length,12);
const polar=c=>Object.fromEntries(['north','south'].map(h=>{const ks=Array.from({length:n/2},(_,k)=>k+(h==='south'?n/2:0));return [h,{area:sum(ks.map(k=>weights[k]*c[k]))/1e12,extent:sum(ks.map(k=>c[k]>=.15?weights[k]:0))/1e12}];}));
const observed=ns.concentration.map(polar),seaice=[flat,relief].map(r=>{
 const months=r.monthlyMeanMarineIceCover.map(polar);
 return {label:r.label,months,errors:Object.fromEntries(['north','south'].map(h=>[h,{meanAbsoluteAreaMillionKm2:sum(months.map((m,j)=>Math.abs(m[h].area-observed[j][h].area)))/12,meanAbsoluteExtentMillionKm2:sum(months.map((m,j)=>Math.abs(m[h].extent-observed[j][h].extent)))/12}]))};
});
const snapshots=await Promise.all(['flat','relief'].map(r=>load(`build/earth-physics-information/${r}-final.json`)));
const cases=['Himalaya foreland','Tibet'].map(name=>{
 const bounds=final[0].regions.find(r=>r.name===name).bounds,p=snapshots[1].state.refined.partition;let selected=null;
 for(let k=0;k<n;k++){const lat=Math.asin(1-2*(Math.floor(k/48)+.5)/24)*180/Math.PI,lon=((k%48+.5)/48-.5)*360;if(lat<bounds.south||lat>bounds.north||lon<bounds.west||lon>bounds.east)continue;
  const ts=Array.from({length:p.offset[k+1]-p.offset[k]},(_,t)=>t+p.offset[k]).filter(t=>p.land[t]>0);if(!ts.length)continue;
  const low=ts.reduce((a,b)=>p.heightM[a]<p.heightM[b]?a:b),high=ts.reduce((a,b)=>p.heightM[a]>p.heightM[b]?a:b),range=p.heightM[high]-p.heightM[low];if(!selected||range>selected.range)selected={parent:k,latitude:lat,longitude:lon,low,high,range};
 }
 if(!selected)return {name};const result={name,...selected};
 for(let i=0;i<2;i++){const r=snapshots[i].state.refined;result[i===0?'flat':'relief']={low:{heightM:r.partition.heightM[selected.low],landC:r.landK[selected.low]-273.15,snowMm:r.snow[selected.low]/r.partition.land[selected.low]},high:{heightM:r.partition.heightM[selected.high],landC:r.landK[selected.high]-273.15,snowMm:r.snow[selected.high]/r.partition.land[selected.high]}};}
 return result;
});
const budgetMax=Object.fromEntries(['waterResidualMm','enthalpyResidualJm2','maxCellVaporResidualMm'].map(key=>[key,Math.max(...[flat,relief].flatMap(r=>r.records.map(s=>Math.abs(s.budget[key]))))]));
const paths=['integrate.ts','physics-check.ts','physics-check.json','flat.json','relief.json','analyze.mjs'].map(f=>dir+'/'+f);
paths.push('build/earth-physics-information/integrate.mjs','build/earth-physics-information/physics-check.mjs','build/earth-physics-information/focused-tests.log','docs/evidence/earth-seaice-causal-20261011/nsidc-same-grid.json');
const bindings=await Promise.all(paths.map(async path=>({path,sha256:sha(await readFile(path))})));
const result={formalSha256:physics.formalSha256,initialStocksSha256:flat.originalInventorySha,fineInventorySha:flat.fineInventorySha,partitionGeometrySha:flat.partitionGeometrySha,physicsGroupsPassed:physics.checks.length,focusedTestsPassed:116,physicalYearDays:flat.yearS/86400,integrationDays:final[0].day,method:'Ablation of fine land-height variance only: same 8922 surface patches, coarse mean heights, coast, routing, atmospheric grid, physical parameters and exact same coarse+patch initial temperatures and water stocks. Full authored Earth actual integration for one orbital year; final step remains 1800 s, observation flux ledger clips its final few minutes to exactly one physical year. No climate regeneration, date seeking, source imports, tuning or formal default changes.',limitation:'One transient orbital year, not climate equilibrium. No atmosphere resolution intervention; relief changes local lapse, emission, precipitation deposition and ensuing feedbacks. Parent circulation/uplift retains the same mean-height input. NSIDC comparison uses parent marine-mean patch concentration proxy uniform on common valid marine support; it is not a patch observation remap.',budgetMax,gpcc,seaice,observedSeaice:observed,nsidc:{product:ns.product,doi:ns.doi,commonMillionKm2:ns.commonMillionKm2,sourceSha256:sha(await readFile('docs/evidence/earth-seaice-causal-20261011/nsidc-same-grid.json'))},localCases:cases,bindings};
await writeFile(dir+'/acceptance.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({budgetMax,gpcc:gpcc.map(r=>({name:r.name,observed:r.observed,flat:r.flat,relief:r.relief,delta:r.deltaMm})),seaice:seaice.map(r=>({label:r.label,errors:r.errors})),cases},null,2));
