/** Exploratory reanalysis forcing on complete terrain; no production import. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync,gzipSync} from 'node:zlib';
import {interpolate,nudge,Sum} from './forcing.ts';
import {makeMesh} from '../../../mesh.ts';
import config,{HIGH_DETAIL_SPACING} from '../../../config.js';
import Map from '../../../map.ts';
import Geometry from '../../../geometry.ts';
import {decodeSimulationDocument} from '../../../simulation-document.ts';
import {meshIdentity} from '../../../terrain-document.ts';
import {sampleTerrainGrid} from '../../../thermal.ts';
import {ThermalRuntime} from '../../../thermal-runtime.ts';
import {SEA_FREEZE_K} from '../../../environment.ts';
import {deriveOrbit} from '../../../astronomy.ts';
import {moistureCapacity} from '../../../water.ts';
import {matchedSupport,CalendarFlux,type Bounds} from '../../../climate-diagnostics.ts';

const folder='docs/evidence/earth-monsoon-forcing-20261015',out='build/earth-monsoon-forcing';
const label=process.env.PARAM_PROFILE??'native',start=performance.now();
assert(['native','wind10','thermal','both10','windColumn','bothColumn'].includes(label));
const forceThermal=['thermal','both10','bothColumn'].includes(label),forceWind=label.includes('10')||label.includes('Column');
const forcingRaw=gunzipSync(await readFile(`${folder}/forcing.json.gz`)),forcing=JSON.parse(forcingRaw.toString());

const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
config.spacing=HIGH_DETAIL_SPACING;const {mesh,t_peaks}=await makeMesh();
const raw=await readFile('scenes/earth-land-sea/earth-simulation.json','utf8');
const d=decodeSimulationDocument(raw,meshIdentity(mesh,config),128),p=d.terrain.settings.planet,o=d.terrain.settings.orbit;
const profile=JSON.parse(await readFile('docs/evidence/earth-east-asia-mechanisms-20261015/profiles.json','utf8'))['shared-core'];
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
assert(forcing.width===rt.grid.width&&forcing.height===rt.grid.height);
const external=new Sum(),externalAbs=new Sum(),forcingHeat=new Float64Array(n),externalByCell=new Float64Array(n);
const airTarget=new Float64Array(n),skinTarget=new Float64Array(n),oceanTarget=new Float64Array(n),uTarget=new Float64Array(n),vTarget=new Float64Array(n),clipped=new Float64Array(n);
const atmosphereStep=e.atmosphere!.step.bind(e.atmosphere);
let clippedComponents=0,windComponents=0,maxClipMps=0;
// Runtime invokes this after its radiative step, before coupled water/phase work.
e.atmosphere!.step=(dt,timeS)=>{
 forcingHeat.fill(0);clipped.fill(0);
 if(forceThermal){
  interpolate(forcing.fields.airK,timeS,year,airTarget);interpolate(forcing.fields.skinK,timeS,year,skinTarget);
  for(let k=0;k<n;k++)oceanTarget[k]=Math.max(SEA_FREEZE_K,skinTarget[k]);
  nudge(m.temperatureK,m.capacity,airTarget,dt,86400,forcingHeat);
  nudge(m.landTemperatureK,m.landCapacity,skinTarget,dt,86400,forcingHeat);
  // The liquid ocean below ice must not be forced toward subfreezing ice skin.
  nudge(m.oceanTemperatureK,m.oceanCapacity,oceanTarget,dt,86400,forcingHeat);
  for(let k=0;k<n;k++){external.add(forcingHeat[k]/n);externalAbs.add(Math.abs(forcingHeat[k])/n);externalByCell[k]+=forcingHeat[k];}
 }
 if(forceWind){
  const column=label.includes('Column');
  interpolate(forcing.fields[column?'uColumn':'u10'],timeS,year,uTarget);interpolate(forcing.fields[column?'vColumn':'v10'],timeS,year,vTarget);
  const limit=w.config.windMps;
  for(let k=0;k<n;k++)for(const a of [uTarget,vTarget]){windComponents++;const v=a[k];a[k]=Math.max(-limit,Math.min(limit,v));if(v!==a[k]){clippedComponents++;clipped[k]++;maxClipMps=Math.max(maxClipMps,Math.abs(v-a[k]));}}
  e.atmosphere!.eastMps.set(uTarget);e.atmosphere!.northMps.set(vTarget);w.setWinds(uTarget,vTarget);
 }else atmosphereStep(dt,timeS);
};
const obsRaw=await readFile('docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json','utf8'),obs=JSON.parse(obsRaw);
const regions:{name:string;bounds:Bounds}[]=[
 {name:'East Asia',bounds:{south:30,north:45,west:110,east:135}},
 {name:'South China',bounds:{south:20,north:27,west:105,east:120}},
 {name:'Yangtze',bounds:{south:27,north:33,west:110,east:122}},
 {name:'North China',bounds:{south:34,north:41,west:110,east:120}},
 {name:'Northeast China',bounds:{south:41,north:49,west:119,east:133}},
 {name:'Korea Japan',bounds:{south:30,north:45,west:125,east:145}},
 {name:'Europe',bounds:{south:45,north:60,west:-10,east:30}},
 {name:'East North America',bounds:{south:30,north:45,west:-90,east:-65}},
 {name:'India',bounds:{south:8,north:28,west:70,east:90}},
 {name:'Australia southwest',bounds:{south:-36,north:-28,west:112,east:122}},
 {name:'Australia north',bounds:{south:-20,north:-10,west:120,east:145}},
 {name:'Amazon',bounds:{south:-10,north:5,west:-75,east:-50}},
 {name:'Congo',bounds:{south:-5,north:5,west:10,east:30}},
];
const supports=regions.map(r=>matchedSupport(rt.grid,w.land,r.bounds,obs.cells));
const rain=new CalendarFlux(n,year),coverage=new CalendarFlux(1,year);
const names=['relativeHumidity','airC','landC','seaC','windEastMps','windNorthMps','vaporKgM2','vaporEastKgMs','vaporNorthKgMs','externalWm2','clippedComponents','evaporationMmDay','netVaporImportMmDay','columnRainMmDay'] as const;
const diagnostics=Object.fromEntries(names.map(k=>[k,new CalendarFlux(regions.length,year)])) as Record<typeof names[number],CalendarFlux>;
const gridNames=['airC','landC','seaC','windEastMps','windNorthMps','vaporKgM2','vaporEastKgMs','vaporNorthKgMs','externalWm2','clippedComponents','evaporationMmDay','netVaporImportMmDay','columnRainMmDay'];
const gridDiagnostics=Object.fromEntries(gridNames.map(k=>[k,new CalendarFlux(n,year)]));
const initialVapor=w.atmosphereKgM2.slice(),vaporE=new Float64Array(n),vaporP=new Float64Array(n),vaporImport=new Float64Array(n);
const parts=Object.fromEntries(Object.keys(w.precipitationComponents).map(k=>[k,new CalendarFlux(regions.length,year)])) as Record<string,CalendarFlux>;
const step=w.step.bind(w);
w.step=(dt,t,q,c)=>{
 const at=m.timeS,span=Math.min(dt,Math.max(0,year-at));
 if(span<=0){step(dt,t,q,c);return;}
 // Wind, temperature and humidity entering this water step; not observations.
 for(const [key,values] of Object.entries({relativeHumidity:w.atmosphereKgM2.map((v,k)=>v/moistureCapacity(t[k])),airC:Array.from(t,v=>v-273.15),landC:m.landTemperatureK.map(v=>v-273.15),seaC:m.oceanTemperatureK.map(v=>v-273.15),windEastMps:w.windEastMps,windNorthMps:w.windNorthMps,vaporKgM2:w.atmosphereKgM2,vaporEastKgMs:w.atmosphereKgM2.map((v,k)=>v*w.windEastMps[k]),vaporNorthKgMs:w.atmosphereKgM2.map((v,k)=>v*w.windNorthMps[k]),externalWm2:forcingHeat.map(v=>v/dt),clippedComponents:clipped})) {
  diagnostics[key as typeof names[number]].add(at,span,supports.map(s=>s.mean(values)));gridDiagnostics[key]?.add(at,span,values);
 }
 step(dt,t,q,c);
 const landRain=w.config.moistureScheme==='transport'?w.landPrecipitationKgM2S.map((v,k)=>w.land[k]>0?v/w.land[k]:0):w.precipitationKgM2S;
 rain.add(at,span,landRain);coverage.add(at,span,[1]);
 for(const [key,values] of Object.entries({evaporationMmDay:w.evaporationKgM2S.map(v=>v*86400),netVaporImportMmDay:w.vaporTransportKgM2.map(v=>v/dt*86400),columnRainMmDay:w.precipitationKgM2S.map(v=>v*86400)})) {
  diagnostics[key as typeof names[number]].add(at,span,supports.map(s=>s.mean(values)));gridDiagnostics[key].add(at,span,values);
 }
 for(let k=0;k<n;k++){vaporE[k]+=w.evaporationKgM2S[k]*dt;vaporP[k]+=w.precipitationKgM2S[k]*dt;vaporImport[k]+=w.vaporTransportKgM2[k];}
 for(const [key,flux] of Object.entries(parts)) {
  const values=w.config.moistureScheme==='transport'?w.landPrecipitationComponents[key as keyof typeof w.landPrecipitationComponents].map((v,k)=>w.land[k]>0?v/w.land[k]:0):w.precipitationComponents[key as keyof typeof w.precipitationComponents];
  flux.add(at,span,supports.map(s=>s.mean(values)));
 }
};
const records:any[]=[];
for(const day of [0,90,180,270,year/86400]) {
 const end=Math.ceil(day*86400/m.stepS);while(m.steps<end)rt.sync(p,o,Math.min(end,m.steps+32)*m.stepS+.001,null);
 const budget={waterMm:w.diagnostics().residualMm,heatJm2:e.enthalpy()-e.initialEnthalpy-m.radiationJm2-external.total,externalJm2:external.total,externalAbsJm2:externalAbs.total,routingM3:w.routing!.diagnostics(w).partitionResidualM3};
 assert(Math.abs(budget.waterMm)<5e-6&&Math.abs(budget.heatJm2)<.005&&Math.abs(budget.routingM3)<1);
 records.push({day:m.timeS/86400,seconds:(performance.now()-start)/1000,budget});console.log(JSON.stringify({label,...records.at(-1)}));
}
assert(Math.abs(coverage.total[0]-year)<1e-6);
const gpcc=regions.map((r,i)=>({...r,modelCells:supports[i].weights.filter(v=>v>0).length,observedAnnualMm:supports[i].observedMonthlyMm.reduce((a,b)=>a+b,0),observedMonthlyMm:Array.from(supports[i].observedMonthlyMm),modelAnnualMm:supports[i].mean(rain.total),monthlyMm:rain.months.map(a=>supports[i].mean(a)),diagnostics:Object.fromEntries(names.map(k=>[k,diagnostics[k].months.map((a,j)=>a[i]/coverage.months[j][0])])),componentsMonthlyMm:Object.fromEntries(Object.entries(parts).map(([key,v])=>[key,v.months.map(a=>a[i])]))}));
for(const r of gpcc)for(let j=0;j<12;j++)assert(Math.abs(Object.values(r.componentsMonthlyMm).reduce((s,a)=>s+a[j],0)-r.monthlyMm[j])<1e-7);
const maxVaporResidualMm=Math.max(...w.atmosphereKgM2.map((v,k)=>Math.abs(v-initialVapor[k]-vaporE[k]+vaporP[k]-vaporImport[k])));
assert(maxVaporResidualMm<1e-7);
await mkdir(out,{recursive:true});
await writeFile(`${out}/${label}.json`,JSON.stringify({stage:'exploratory-complete-terrain-first-orbit',label,parameters:profile,intervention:{forceWind,forceThermal,tauSeconds:forceThermal?86400:null,oceanTargetFloorK:SEA_FREEZE_K,clippedComponents,windComponents,maxClipMps},grid:{width:rt.grid.width,height:rt.grid.height},meshTriangles:mesh.numTriangles,dt:m.stepS,yearS:year,startCalendar:'March 20, non-leap Gregorian months mapped to orbital year',formalSha256:sha(raw),observationSha256:sha(obsRaw),forcingSha256:sha(forcingRaw.toString()),initialStockSha,initialInventoriesSha,bundleSha256:sha(await readFile(process.argv[1],'utf8')),strictContinuation:false,continuationNote:'Offline forcing is not represented by the production snapshot schema; not exported as a production save.',maxVaporResidualMm,records,gpcc},null,2)+'\n');
await writeFile(`${out}/${label}-grid.json.gz`,gzipSync(JSON.stringify({land:Array.from(w.land),support: supports.map(s=>Array.from(s.weights)),coverageSeconds:coverage.months.map(a=>a[0]),rainMonthlyMm:rain.months.map(a=>Array.from(a)),externalByCellJm2:Array.from(externalByCell),fields:Object.fromEntries(Object.entries(gridDiagnostics).map(([key,v])=>[key,v.months.map((a,j)=>Array.from(a,x=>x/coverage.months[j][0]))]))})));
