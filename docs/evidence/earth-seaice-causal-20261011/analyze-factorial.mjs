import {readFile,writeFile} from 'node:fs/promises';
const folder='docs/evidence/earth-seaice-causal-20261011',grid=JSON.parse(await readFile('build/earth-seaice-causal/grid.json'));
const results={};
for(const label of ['control','thermal-only','fair-transport','fair-both','shortwave-fair']){
 const a=JSON.parse(await readFile(folder+'/'+label+'-1800-seaice.json')),r=JSON.parse(await readFile(folder+'/'+label+'-1800-continuous.json'));
 const monthly=Object.fromEntries(Object.entries(a.monthlyFields).filter(([k])=>k!=='waterLatentWm2').map(([k,x])=>[k,x.map((row,j)=>row.map(v=>v/a.monthlyCoverageS[j]))]));
 const south=[];for(let row=grid.height/2;row<grid.height;row++){
  const ks=Array.from({length:grid.width},(_,x)=>row*grid.width+x),area=ks.reduce((s,k)=>s+grid.support[k],0);
  const avg=f=>ks.reduce((s,k)=>s+f[k]*grid.support[k],0)/area;
  south.push({row,lat:Math.asin(1-2*(row+.5)/grid.height)*180/Math.PI,months:monthly.cover.map((_,j)=>Object.fromEntries(Object.entries(monthly).map(([k,f])=>[k,avg(f[j])])))});
 }
 const summary={day:r.records.at(-1).day,initial:r.initialStocksSha256,conductiveSeaIce:a.conductiveSeaIce,underIceOcean:a.underIceOcean,budget:r.records.at(-1).budget,iceGlobalMm:r.records.at(-1).seaIce.north.iceGlobalMm+r.records.at(-1).seaIce.south.iceGlobalMm,southDaily:[Math.min(...a.daily.map(d=>d.south.extentMillionKm2)),Math.max(...a.daily.map(d=>d.south.extentMillionKm2))],northDaily:[Math.min(...a.daily.map(d=>d.north.extentMillionKm2)),Math.max(...a.daily.map(d=>d.north.extentMillionKm2))],south};
 results[label]=summary;console.log(label,JSON.stringify({...summary,south:undefined}));
 console.log('southern monthly cover',south.map(x=>[x.lat,x.months.map(m=>+m.cover.toFixed(2))]));
}
await writeFile(folder+'/factorial-analysis.json',JSON.stringify(results,null,2));
