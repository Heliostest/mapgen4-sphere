/** First-orbit rainfall audit on the complete Earth terrain and routing. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {makeMesh} from '../../../mesh.ts';
import config,{HIGH_DETAIL_SPACING} from '../../../config.js';
import Map from '../../../map.ts';
import Geometry from '../../../geometry.ts';
import {decodeSimulationDocument} from '../../../simulation-document.ts';
import {meshIdentity} from '../../../terrain-document.ts';
import {sampleTerrainGrid} from '../../../thermal.ts';
import {ThermalRuntime} from '../../../thermal-runtime.ts';
import {deriveOrbit} from '../../../astronomy.ts';
import {moistureCapacity} from '../../../water.ts';
import {matchedSupport,CalendarFlux,type Bounds} from '../../../climate-diagnostics.ts';

const folder='docs/evidence/earth-east-asia-rainfall-20261015',out='build/earth-east-asia-rainfall';
const label=process.env.PARAM_PROFILE??'bulk',start=performance.now();
assert(['control','bulk','transport','transport-bulk'].includes(label));
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
config.spacing=HIGH_DETAIL_SPACING;const {mesh,t_peaks}=await makeMesh();
const raw=await readFile('scenes/earth-land-sea/earth-simulation.json','utf8');
const d=decodeSimulationDocument(raw,meshIdentity(mesh,config),128),p=d.terrain.settings.planet,o=d.terrain.settings.orbit;
const profiles=JSON.parse(await readFile('docs/evidence/earth-bulk-evaporation-20261015/profiles.json','utf8')),profile=profiles[label];
Object.assign(d.runtime.config,profile.thermal);Object.assign(d.runtime.waterConfig,profile.water);Object.assign(d.runtime.environmentConfig,profile.environment);
const separate=d.runtime.environmentConfig.separateSurfaceAlbedo;delete d.runtime.environmentConfig.separateSurfaceAlbedo;
const map=new Map(mesh,t_peaks,config);
map.assignElevation(d.terrain.parameters.elevation,{size:128,constraints:new Float32Array(d.terrain.constraints.values)},new Float32Array(d.terrain.offsets!));
map.assignRainfall(d.terrain.parameters.biomes);map.assignRivers(d.terrain.parameters.rivers,true);
const elevation=new Float32Array(mesh.numRegions+mesh.numTriangles);elevation.set(map.elevation_r);elevation.set(map.elevation_t,mesh.numRegions);
const quads=new Int32Array(mesh.numSolidSides*3);Geometry.setMapGeometry(map,0,quads,new Float32Array(elevation.length*2));
const source={mesh,directions:mesh.xyz_r,elevation,quadElements:quads,drainage:d.terrain.drainage};
const rt=ThermalRuntime.fromSnapshot(d.runtime,p,o),terrain=sampleTerrainGrid(rt.grid,mesh.xyz_r,elevation);
rt.attachRestoredTerrain(terrain.landFraction,terrain.landElevation,source);
const initialStockSha=sha(JSON.stringify(rt.snapshot().state));
const stocks=(s:NonNullable<typeof d.runtime.state>)=>({air:Array.from(s.thermal.temperatureK),land:Array.from(s.thermal.landTemperatureK!),sea:Array.from(s.thermal.oceanTemperatureK!),ocean:s.water!.oceanGlobalKgM2,water:Object.fromEntries((['atmosphereKgM2','soilKgM2','surfaceKgM2','snowKgM2','seaIceKgM2','landIceKgM2','shelfLandIceKgM2','shelfSeaIceKgM2'] as const).map(k=>[k,Array.from(s.water![k])])),initialEnergy:s.initialEnergyJm2,initialEnthalpy:s.initialEnthalpy,initialWater:s.water!.initialTotalMm});
assert.deepEqual(stocks(rt.snapshot().state!),stocks(d.runtime.state!));
const initialInventoriesSha=sha(JSON.stringify(stocks(rt.snapshot().state!)));
const beforeSurfaceClosure=rt.snapshot().state!;
if(separate)rt.configureSurfacePhysics({separateSurfaceAlbedo:true});
const afterSurfaceClosure=rt.snapshot().state!;
// This closure intentionally changes radiative albedo, not inventories.
beforeSurfaceClosure.thermal.albedo.fill(0);afterSurfaceClosure.thermal.albedo.fill(0);
assert.deepEqual(afterSurfaceClosure,beforeSurfaceClosure);
const m=rt.model!,w=rt.water!,e=rt.environment!,n=rt.grid.count,year=deriveOrbit(p,o).yearS;
assert(m.timeS===0&&o.orbitPhaseRad===0&&w.routing);
const obsRaw=await readFile('docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json','utf8'),obs=JSON.parse(obsRaw);
const regions:{name:string;bounds:Bounds}[]=[
 {name:'East Asia',bounds:{south:30,north:45,west:110,east:135}},
 {name:'South China',bounds:{south:20,north:27,west:105,east:120}},
 {name:'Yangtze',bounds:{south:27,north:33,west:110,east:122}},
 {name:'North China',bounds:{south:34,north:41,west:110,east:120}},
 {name:'Northeast China',bounds:{south:41,north:49,west:119,east:133}},
 {name:'Korea Japan',bounds:{south:30,north:45,west:125,east:145}},
];
const supports=regions.map(r=>matchedSupport(rt.grid,w.land,r.bounds,obs.cells));
const rain=new CalendarFlux(n,year),coverage=new CalendarFlux(1,year);
const names=['relativeHumidity','airC','landC','windEastMps','windNorthMps','evaporationMmDay','netVaporImportMmDay','columnRainMmDay'] as const;
const diagnostics=Object.fromEntries(names.map(k=>[k,new CalendarFlux(regions.length,year)])) as Record<typeof names[number],CalendarFlux>;
const parts=Object.fromEntries(Object.keys(w.precipitationComponents).map(k=>[k,new CalendarFlux(regions.length,year)])) as Record<string,CalendarFlux>;
const step=w.step.bind(w);
w.step=(dt,t,q,c)=>{
 const at=m.timeS,span=Math.min(dt,Math.max(0,year-at));
 if(span<=0){step(dt,t,q,c);return;}
 // Wind, temperature and humidity entering this water step; not observations.
 for(const [key,values] of Object.entries({relativeHumidity:w.atmosphereKgM2.map((v,k)=>v/moistureCapacity(t[k])),airC:Array.from(t,v=>v-273.15),landC:m.landTemperatureK.map(v=>v-273.15),windEastMps:w.windEastMps,windNorthMps:w.windNorthMps}))
  diagnostics[key as typeof names[number]].add(at,span,supports.map(s=>s.mean(values)));
 step(dt,t,q,c);
 const landRain=w.config.moistureScheme==='transport'?w.landPrecipitationKgM2S.map((v,k)=>w.land[k]>0?v/w.land[k]:0):w.precipitationKgM2S;
 rain.add(at,span,landRain);coverage.add(at,span,[1]);
 for(const [key,values] of Object.entries({evaporationMmDay:w.evaporationKgM2S.map(v=>v*86400),netVaporImportMmDay:w.vaporTransportKgM2.map(v=>v/dt*86400),columnRainMmDay:w.precipitationKgM2S.map(v=>v*86400)}))
  diagnostics[key as typeof names[number]].add(at,span,supports.map(s=>s.mean(values)));
 for(const [key,flux] of Object.entries(parts)) {
  const values=w.config.moistureScheme==='transport'?w.landPrecipitationComponents[key as keyof typeof w.landPrecipitationComponents].map((v,k)=>w.land[k]>0?v/w.land[k]:0):w.precipitationComponents[key as keyof typeof w.precipitationComponents];
  flux.add(at,span,supports.map(s=>s.mean(values)));
 }
};
const records:any[]=[];
for(const day of [0,90,180,270,year/86400]) {
 const end=Math.ceil(day*86400/m.stepS);while(m.steps<end)rt.sync(p,o,Math.min(end,m.steps+32)*m.stepS+.001,null);
 const budget={waterMm:w.diagnostics().residualMm,heatJm2:e.enthalpy()-e.initialEnthalpy-m.radiationJm2,routingM3:w.routing!.diagnostics(w).partitionResidualM3};
 assert(Math.abs(budget.waterMm)<5e-6&&Math.abs(budget.heatJm2)<.005&&Math.abs(budget.routingM3)<1);
 records.push({day:m.timeS/86400,seconds:(performance.now()-start)/1000,budget});console.log(JSON.stringify({label,...records.at(-1)}));
}
assert(Math.abs(coverage.total[0]-year)<1e-6);
const gpcc=regions.map((r,i)=>({...r,modelCells:supports[i].weights.filter(v=>v>0).length,observedAnnualMm:supports[i].observedMonthlyMm.reduce((a,b)=>a+b,0),observedMonthlyMm:Array.from(supports[i].observedMonthlyMm),modelAnnualMm:supports[i].mean(rain.total),monthlyMm:rain.months.map(a=>supports[i].mean(a)),diagnostics:Object.fromEntries(names.map(k=>[k,diagnostics[k].months.map((a,j)=>a[i]/coverage.months[j][0])])),componentsMonthlyMm:Object.fromEntries(Object.entries(parts).map(([key,v])=>[key,v.months.map(a=>a[i])]))}));
for(const r of gpcc)for(let j=0;j<12;j++)assert(Math.abs(Object.values(r.componentsMonthlyMm).reduce((s,a)=>s+a[j],0)-r.monthlyMm[j])<1e-7);
const restored=ThermalRuntime.fromSnapshot(rt.snapshot(),p,o);restored.attachRestoredTerrain(terrain.landFraction,terrain.landElevation,source);
const next=m.timeS+m.stepS;rt.sync(p,o,next,null);restored.sync(p,o,next,null);assert.deepEqual(restored.snapshot(),rt.snapshot());
await mkdir(out,{recursive:true});
await writeFile(`${out}/${label}.json`,JSON.stringify({stage:'complete-terrain-first-orbit',label,parameters:profile,grid:{width:rt.grid.width,height:rt.grid.height},meshTriangles:mesh.numTriangles,dt:m.stepS,yearS:year,startCalendar:'March 20, non-leap Gregorian months mapped to orbital year',formalSha256:sha(raw),observationSha256:sha(obsRaw),initialStockSha,initialInventoriesSha,bundleSha256:sha(await readFile(process.argv[1],'utf8')),strictContinuation:true,records,gpcc},null,2)+'\n');
