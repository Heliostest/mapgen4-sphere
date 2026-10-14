import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-speedy-transport-20261013',out='build/earth-speedy-transport';
const d=JSON.parse(await readFile(`${out}/replay-diagnostics.json`,'utf8'));
assert(d.diagnosticReplayMatched);assert.equal(d.comparisons.length,12);assert.equal(d.count,17520);
const n=d.regions.length;
const mean=(a,ri,li,months)=>months.reduce((s,m)=>s+a[m][li*n+ri]*d.seconds[m],0)/months.reduce((s,m)=>s+d.seconds[m],0);
const records=d.regions.map((name,ri)=>({name,seasons:Object.fromEntries([['DJF',[11,0,1]],['JJA',[5,6,7]]].map(([season,months])=>[season,{
 rainMmDay:months.reduce((s,m)=>s+d.monthlyRainMm[m][ri],0)/(months.reduce((s,m)=>s+d.seconds[m],0)/86400),
 fields:Object.fromEntries(Object.entries(d.fields).map(([key,a])=>[key,Array.from({length:a[0].length/n},(_,l)=>mean(a,ri,l,months))])),
 processes:Object.fromEntries(Object.entries(d.process).map(([key,a])=>[key.replace(/WaterMmS$/,'WaterMmDay').replace(/TemperatureKS$/,'TemperatureKDay').replace(/HumidityKgKgS$/,'HumidityKgKgDay'),Array.from({length:a[0].length/n},(_,l)=>mean(a,ri,l,months)*86400)]))
 }]))}));
await writeFile(`${folder}/replay-summary.json`,JSON.stringify({count:d.count,comparisons:d.comparisons,sigma:d.sigma,records},null,2)+'\n');
for(const r of records.filter(r=>['India','India native land','Australia north','Arabian Sea','Bay of Bengal'].includes(r.name))){
 const s=r.seasons[r.name.startsWith('Australia')?'DJF':'JJA'];
 console.log(JSON.stringify({name:r.name,rainMmDay:s.rainMmDay,deep:s.fields.deepFraction[0],shallow:s.fields.shallowFraction[0],stable:s.fields.noBuoyancyFraction[0],Pq:s.fields.convectionPq[0],PT:s.fields.convectionPT[0],sigmaVelocityPerDay:s.fields.sigmaVelocityPerS.map(x=>x*86400),qBudgetByLevel:Object.fromEntries(Object.entries(s.processes).filter(([k])=>k.endsWith('WaterMmDay')))}));
}
