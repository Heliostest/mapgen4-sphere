/** Reproduce reference initialization with real thermal/environment operators. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {referenceMoisture} from '../../../reference-moisture.ts';
import {makeThermalGrid,thermalCell} from '../../../thermal.ts';
const dir='docs/evidence/earth-moisture-p0-20261011';
await mkdir('build/earth-moisture-p0',{recursive:true});
const raw=await readFile('scenes/earth-land-sea/earth-simulation.json','utf8');
const d=JSON.parse(raw),rt=d.runtime,s=rt.state;
const grid=makeThermalGrid(),points=[['Amazon',-3,-60],['Congo',0,23],['India',22,80],['Himalaya',28,86],['Tibet',33,88],['Australia interior',-25,134],['Australia north',-12,131],['Australia east',-30,152],['Australia southwest',-32,116]] as const;
const out:any={inputSha256:createHash('sha256').update(raw).digest('hex'),bundleSha256:createHash('sha256').update(await readFile(process.argv[1])).digest('hex'),records:[]};
for(const dt of (process.env.P0_DTS??'1800,900,450').split(',').map(Number)){
 const start=performance.now();
 const height=Float64Array.from(s.height,(h:number)=>h*d.terrain.settings.planet.reliefM);
 const ref=referenceMoisture(grid,d.terrain.settings.planet,d.terrain.settings.orbit,{...rt.config,airRadiationFraction:.5},{...rt.waterConfig,moistureScheme:'transport'},s.land,height,rt.environmentConfig,dt);
 const record={dt,coupled:ref.coupled,steps:ref.steps,seconds:(performance.now()-start)/1000,waterResidualMm:ref.waterResidualMm,energyResidualJm2:ref.energyResidualJm2,points:points.map(([name,lat,lon])=>{const k=thermalCell(grid,(lon+180)/360,(90-lat)/180);return {name,k,land:s.land[k],heightM:height[k],P:ref.months.reduce((a,m)=>a+m.rainMmDay[k]*ref.forcingYearS/86400/12,0),monthlyP:ref.months.map(m=>m.rainMmDay[k]*ref.forcingYearS/86400/12),E:ref.months.reduce((a,m)=>a+m.evaporationMmDay[k]*ref.forcingYearS/86400/12,0),W:ref.months.map(m=>m.atmosphereKgM2[k]),Tair:ref.months.map(m=>m.temperatureK[k]),Tland:ref.months.map(m=>m.landTemperatureK[k]),u:ref.months.map(m=>m.windEastMps[k]),v:ref.months.map(m=>m.windNorthMps[k])};})};
 out.records.push(record);console.log(JSON.stringify({...record,points:record.points.map(p=>({name:p.name,P:p.P,E:p.E}))}));
 await writeFile(`${dir}/${process.env.P0_LABEL??'before'}-reference-valid.json`,JSON.stringify(out,null,2)+'\n');
}
