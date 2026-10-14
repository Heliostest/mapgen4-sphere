import {readFile,writeFile} from 'node:fs/promises';
import {matchedSupport,cellBounds,sphericalOverlap} from '../../../climate-diagnostics.ts';
import {makeThermalGrid} from '../../../thermal.ts';
import {moistureCapacity} from '../../../water.ts';
const folder='build/earth-uplift-closure',grid=makeThermalGrid(),n=grid.count,stage=process.env.CAUSE_STAGE??'screen';
const formal=JSON.parse(await readFile(stage==='full'?'build/earth-lakes-freeze-temperate/lake-day0.json':'scenes/earth-land-sea/earth-simulation.json','utf8'));
const land=formal.runtime.state.land;
const obs=JSON.parse(await readFile('docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json','utf8'));
const days=[31,28,31,30,31,30,31,31,30,31,30,31];
const result=[];
for(const label of process.argv.slice(2)){
 const j=JSON.parse(await readFile(`${folder}/${stage}-${label}.json`,'utf8'));
 const regions=j.gpcc.map((r:any)=>({...r,support:matchedSupport(grid,land,r.bounds,obs.cells)}));
 for(const r of [{name:'Canada snow belt',bounds:{south:50,north:65,west:-130,east:-60}},{name:'Siberia snow belt',bounds:{south:50,north:65,west:60,east:150}},{name:'SW Australia offshore',bounds:{south:-38,north:-28,west:103,east:113}}]){
  const weights=Float64Array.from({length:n},(_,k)=>sphericalOverlap(cellBounds(grid,k),r.bounds)*(r.name.includes('offshore')?1-land[k]:land[k]));
  const sum=weights.reduce((s,v)=>s+v,0);regions.push({...r,support:{mean:(a:ArrayLike<number>)=>weights.reduce((s,v,k)=>s+v*a[k],0)/sum}});
 }
 const rows=regions.map((r:any)=>{
  const mean=r.support.mean;
  const transport=Object.fromEntries(j.causal.transport.map((t:any)=>[t.key,mean(t.annual.map((v:number,k:number)=>t.key.startsWith('orographic')&&land[k]>0?v/land[k]:v))]));
  const snow=Object.fromEntries(Object.entries(j.causal.snowLedger).map(([key,a])=>[key,mean((a as number[]).map((v,k)=>land[k]>0?v/land[k]:0))]));
  const seasons=Object.fromEntries([['DJF',[11,0,1]],['JJA',[5,6,7]]].map(([name,months]:any)=>{
   const seconds=months.reduce((s:number,m:number)=>s+days[m],0);
   const values=Float64Array.from({length:j.causal.drivers.keys.length*n},(_,k)=>months.reduce((s:number,m:number)=>s+days[m]*j.causal.drivers.monthly[m][k],0)/seconds);
   const fields=Object.fromEntries(j.causal.drivers.keys.map((key:string,i:number)=>[key,mean(values.subarray(i*n,(i+1)*n))]));
   const rh=mean(Float64Array.from({length:n},(_,k)=>values[2*n+k]/moistureCapacity(values[k])));
   return [name,{...fields,rhFromMeanState:rh}];
  }));
  const vapor=j.vaporBudget?Object.fromEntries(Object.entries(j.vaporBudget).map(([key,a])=>[key,mean(a as number[])])):null;
  return {name:r.name,transport,snow,seasons,vapor};
 });
 result.push({label,rows});
}
await writeFile(`docs/evidence/earth-uplift-closure-20261012/${stage}-causes.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({stage,labels:result.map(j=>j.label)}));
