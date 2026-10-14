import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const folder='docs/evidence/earth-speedy-transport-20261013',out='build/earth-speedy-transport';
const weights=await read(`${out}/diagnostic-weights.json`);
const mean=(a,w,level=0)=>w.reduce((s,x,i)=>s+x*a[level*w.length+i],0);
const cases=[];
for(const prefix of process.argv.slice(2)){
 const s=await read(`${out}/${prefix}-statistics.json`),g=await read(`${out}/${prefix}-geometry.json`);
 assert.equal(s.monthly.length,12);assert.equal(g.npoints,weights.npoints);
 const regions=weights.regions.map(r=>({name:r.name,support:r.support,landFraction:mean(g.landFraction,r.weights),
  monthly:s.monthly.map(m=>({month:m.month,seconds:m.seconds,precipitationMm:mean(m.precipitationMm,r.weights),evaporationMm:mean(m.evaporationMm,r.weights),
   layers:Object.fromEntries(Object.entries(m.layers).map(([k,a])=>[k,Array.from({length:g.nlayers},(_,l)=>mean(a,r.weights,l))])),
   surface:Object.fromEntries(Object.entries(m.surface).map(([k,a])=>[k,mean(a,r.weights)]))}))}));
 const seconds=s.monthly.reduce((n,m)=>n+m.seconds,0),terms=s.statisticsBudget.terms;
 const annualGlobal={incomingSolarWm2:terms.incomingSolarJm2/seconds,outgoingShortwaveWm2:terms.outgoingShortwaveJm2/seconds,
  outgoingLongwaveWm2:terms.outgoingLongwaveJm2/seconds,toaNetWm2:s.statisticsBudget.toaNetJm2/seconds,
  precipitationMmDay:terms.precipitationMm/365,evaporationMmDay:terms.evaporationMm/365,
  temperatureK:Array.from({length:g.nlayers},(_,l)=>s.monthly.reduce((v,m)=>v+m.seconds*mean(m.layers.temperatureK,g.weights,l),0)/seconds)};
 cases.push({prefix,stage:s.stage,physicsFix:s.physicsFix,sigma:g.sigmaFull,annualGlobal,regions});
}
await writeFile(`${folder}/candidate-fields.json`,JSON.stringify({notes:[
 'Surface fields on GPCC support retain the original mixed land/ocean support; SST over land and landSkinK over water are fill values, not physical regional temperatures.',
 'Use native marine regions for SST interpretation and explicitly marked land diagnostic regions for land quantities.',
 'Stored moisture flux is the time mean of native instantaneous p*q*v/g; it is not a product of monthly means. Regional vector means are not moisture convergence.'
],cases},null,2)+'\n');
console.log(JSON.stringify(cases.map(c=>({prefix:c.prefix,annualGlobal:c.annualGlobal})),null,2));
