/** Actual, same-stock annual integration. Defaults and authored Earth stay fixed. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {makeMesh} from '../../../mesh.ts';
import config,{HIGH_DETAIL_SPACING} from '../../../config.js';
import Map from '../../../map.ts';
import Geometry from '../../../geometry.ts';
import {decodeSimulationDocument,encodeSimulationDocument} from '../../../simulation-document.ts';
import {meshIdentity} from '../../../terrain-document.ts';
import {ThermalRuntime} from '../../../thermal-runtime.ts';
import {sampleTerrainGrid} from '../../../thermal.ts';
import {deriveOrbit} from '../../../astronomy.ts';
import {matchedSupport,CalendarFlux,VaporLedger,type Bounds} from '../../../climate-diagnostics.ts';
const out='build/earth-lakes-freeze-temperate',arm=process.env.EARTH_ARM??'before',dt=1800,start=performance.now();
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
const sum=(v:Iterable<number>)=>{let s=0,c=0;for(const x of v){const y=x-c,t=s+y;c=(t-s)-y;s=t;}return s;};
await mkdir(out,{recursive:true});
config.spacing=HIGH_DETAIL_SPACING;const {mesh,t_peaks}=await makeMesh(),identity=meshIdentity(mesh,config);
const raw=await readFile('scenes/earth-land-sea/earth-simulation.json','utf8'),d=decodeSimulationDocument(raw,identity,128),planet=d.terrain.settings.planet,orbit=d.terrain.settings.orbit;
const map=new Map(mesh,t_peaks,config);map.assignElevation(d.terrain.parameters.elevation,{size:128,constraints:new Float32Array(d.terrain.constraints.values)},new Float32Array(d.terrain.offsets!));map.assignRainfall(d.terrain.parameters.biomes);map.assignRivers(d.terrain.parameters.rivers,true);
const elevation=new Float32Array(mesh.numRegions+mesh.numTriangles);elevation.set(map.elevation_r);elevation.set(map.elevation_t,mesh.numRegions);
const quads=new Int32Array(mesh.numSolidSides*3);Geometry.setMapGeometry(map,0,quads,new Float32Array(elevation.length*2));
const source={mesh,directions:mesh.xyz_r,elevation,quadElements:quads,drainage:d.terrain.drainage};
const initial=structuredClone(d.runtime);initial.state!.stepS=dt;
if(arm!=='before'){initial.waterConfig.moistureScheme='transport';initial.config.airRadiationFraction=.5;initial.environmentConfig.conductiveSeaIce=true;initial.environmentConfig.underIceOcean=true;}
const rt=ThermalRuntime.fromSnapshot(initial,planet,orbit),terrain=sampleTerrainGrid(rt.grid,mesh.xyz_r,elevation);rt.attachRestoredTerrain(terrain.landFraction,terrain.landElevation,source);
const m=rt.model!,w=rt.water!,env=rt.environment!,n=rt.grid.count,year=deriveOrbit(planet,orbit).yearS;
const initialStockSha=sha(JSON.stringify({air:m.temperatureK,land:m.landTemperatureK,sea:m.oceanTemperatureK,water:Object.fromEntries(['atmosphereKgM2','soilKgM2','surfaceKgM2','snowKgM2','seaIceKgM2','landIceKgM2','shelfLandIceKgM2','shelfSeaIceKgM2','oceanGlobalKgM2'].map(k=>[k,(w as any)[k]])),routing:w.routing!.volumeM3}));
// Switches are applied only after decoding the identical initial physical state.
if(arm!=='before'&&arm!=='transport')rt.configureSurfacePhysics({separateSurfaceAlbedo:arm.includes('albedo')||arm==='after',liquidOceanEvaporation:arm.includes('evap')||arm==='after'});
env.refresh();
const obsText=await readFile('docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json','utf8'),obs=JSON.parse(obsText);
const regions:{name:string;bounds:Bounds}[]=[
 {name:'Europe',bounds:{south:45,north:55,west:-5,east:25}},
 {name:'East North America',bounds:{south:35,north:45,west:-95,east:-75}},
 {name:'East Asia',bounds:{south:30,north:45,west:110,east:135}},
 {name:'West Siberia',bounds:{south:50,north:60,west:60,east:90}},
 {name:'India',bounds:{south:18,north:25,west:74,east:86}},
 {name:'Australia southwest',bounds:{south:-35,north:-29,west:113,east:120}}
];
const supports=regions.map(r=>matchedSupport(rt.grid,w.land,r.bounds,obs.cells));
const rain=new CalendarFlux(n,year),ice=new CalendarFlux(n,year),coverage=new CalendarFlux(1,year),vapor=new VaporLedger(w.atmosphereKgM2);
const step=w.step.bind(w);w.step=(delta,t,q,c)=>{step(delta,t,q,c);vapor.add(delta,w.evaporationKgM2S,w.precipitationKgM2S,w.vaporTransportKgM2);const s=Math.max(0,Math.min(delta,year-m.timeS));if(s>0){rain.add(m.timeS,s,w.landPrecipitationKgM2S.map((v,k)=>w.land[k]>0?v/w.land[k]:0));coverage.add(m.timeS,s,[1]);}};
const envStep=env.step.bind(env);env.step=delta=>{envStep(delta);const s=Math.max(0,Math.min(delta,year-m.timeS));if(s>0)ice.add(m.timeS,s,env.iceCover);};
const records:any[]=[];
const result:any={arm,dt,inputSha256:sha(raw),initialStockSha,bundleSha256:sha(await readFile(process.argv[1],'utf8')),observations:{product:obs.product,url:obs.url,gridSha256:sha(obsText)},records};
async function checkpoint(){
 const budget={waterResidualMm:w.diagnostics().residualMm,enthalpyResidualJm2:env.enthalpy()-env.initialEnthalpy-m.radiationJm2,maxCellVaporResidualMm:Math.max(...vapor.residual(w.atmosphereKgM2).map(Math.abs)),routingResidualM3:w.routing!.diagnostics(w).partitionResidualM3};
 assert.ok(Math.abs(budget.waterResidualMm)<5e-6);assert.ok(Math.abs(budget.enthalpyResidualJm2)<.005);assert.ok(budget.maxCellVaporResidualMm<1e-8);
 const bands=[[-90,-60],[-60,-30],[-30,30],[30,60],[60,90]].map(([south,north])=>{let snow=0,land=0,iceArea=0,sea=0;for(let k=0;k<n;k++){const lat=Math.asin(rt.grid.sinLat[Math.floor(k/rt.grid.width)])*180/Math.PI;if(lat<south||lat>=north)continue;land+=w.land[k];sea+=1-w.land[k];snow+=w.land[k]*env.snowCover[k];iceArea+=(1-w.land[k])*env.iceCover[k];}return {south,north,snowLandFraction:land?snow/land:0,iceWetFraction:sea?iceArea/sea:0};});
 const route=w.routing!,lake=Array.from(route.volumeM3).map((v,t)=>({v,t})).filter(({t})=>(route.network.inlandLakeId?.[t]??0)>0);
 const record={day:m.timeS/86400,seconds:(performance.now()-start)/1000,budget,bands,lake:{triangles:lake.length,volumeM3:sum(lake.map(p=>p.v)),bedsM:[Math.min(...lake.map(p=>route.network.bedM[p.t])),Math.max(...lake.map(p=>route.network.bedM[p.t]))]},regions:regions.map((r,i)=>({...r,observedAnnualMm:sum(supports[i].observedMonthlyMm),observedMonthlyMm:supports[i].observedMonthlyMm,modelAnnualMm:supports[i].mean(rain.total),monthlyMm:rain.months.map(a=>supports[i].mean(a)),landC:supports[i].mean(m.landTemperatureK)-273.15,snowMm:supports[i].mean(w.snowKgM2.map((v,k)=>w.land[k]>0?v/w.land[k]:0)),soilFraction:supports[i].mean(w.soilKgM2.map((v,k)=>w.land[k]>0?v/(w.land[k]*w.config.soilCapacityKgM2):0))}))};
 records.push(record);result.monthlyMeanMarineIceCover=ice.months.map((a,j)=>Array.from(a,v=>coverage.months[j][0]>0?v/coverage.months[j][0]:0));result.calendarCoverageS=coverage.months.map(a=>a[0]);
 await writeFile(`${out}/${arm}.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(record));
}
await checkpoint();
for(const days of [30,90,180,270,year/86400]){const count=Math.ceil(days*86400/dt);while(m.steps<count){rt.sync(planet,orbit,Math.min(count,m.steps+32)*dt+.001,null);}await checkpoint();}
assert.ok(Math.abs(sum(result.calendarCoverageS)-year)<1e-6);
const final=rt.snapshot(),restored=ThermalRuntime.fromSnapshot(final,planet,orbit);restored.attachRestoredTerrain(terrain.landFraction,terrain.landElevation,source);
const document={...d,runtime:final,terrain:{...d.terrain,settings:{...d.terrain.settings,timeS:final.state!.lastTarget}}};
await writeFile(`${out}/${arm}-day365.json`,encodeSimulationDocument(document));
const next=m.timeS+dt;rt.sync(planet,orbit,next,null);restored.sync(planet,orbit,next,null);assert.deepEqual(restored.snapshot(),rt.snapshot());
result.strictRoundTrip=true;await writeFile(`${out}/${arm}.json`,JSON.stringify(result,null,2)+'\n');
