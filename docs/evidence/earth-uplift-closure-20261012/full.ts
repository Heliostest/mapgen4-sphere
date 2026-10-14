/** Same-stock full mesh Earth integration with retained lake inventory. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {makeMesh} from '../../../mesh.ts';
import config,{HIGH_DETAIL_SPACING} from '../../../config.js';
import Map from '../../../map.ts';
import Geometry from '../../../geometry.ts';
import {decodeSimulationDocument,encodeSimulationDocument} from '../../../simulation-document.ts';
import {meshIdentity} from '../../../terrain-document.ts';
import {sampleTerrainGrid} from '../../../thermal.ts';
import {moistureCapacity} from '../../../water.ts';
import {circulationWinds} from '../../../climate.ts';
import {makeThermalGrid} from '../../../thermal.ts';
import {ThermalRuntime} from '../../../thermal-runtime.ts';
import {deriveOrbit} from '../../../astronomy.ts';
import {matchedSupport,CalendarFlux,VaporLedger,type Bounds} from '../../../climate-diagnostics.ts';
const folder='docs/evidence/earth-uplift-closure-20261012',out='build/earth-uplift-closure',label=process.env.PARAM_PROFILE??'control',dt=Number(process.env.PARAM_DT??1800),start=performance.now();
const sha=(v:string)=>createHash('sha256').update(v).digest('hex'),sum=(a:Iterable<number>)=>Array.from(a).reduce((s,v)=>s+v,0);
const profiles=JSON.parse(await readFile(`${folder}/profiles.json`,'utf8'));assert(profiles[label]);
config.spacing=HIGH_DETAIL_SPACING;const {mesh,t_peaks}=await makeMesh(),identity=meshIdentity(mesh,config);
const raw=await readFile('scenes/earth-land-sea/earth-simulation.json','utf8'),inputRaw=await readFile('build/earth-lakes-freeze-temperate/lake-day0.json','utf8'),d=decodeSimulationDocument(inputRaw,identity,128),p=d.terrain.settings.planet,o=d.terrain.settings.orbit;
const map=new Map(mesh,t_peaks,config);map.assignElevation(d.terrain.parameters.elevation,{size:128,constraints:new Float32Array(d.terrain.constraints.values)},new Float32Array(d.terrain.offsets!));map.assignRainfall(d.terrain.parameters.biomes);map.assignRivers(d.terrain.parameters.rivers,true);
const elevation=new Float32Array(mesh.numRegions+mesh.numTriangles);elevation.set(map.elevation_r);elevation.set(map.elevation_t,mesh.numRegions);
const quads=new Int32Array(mesh.numSolidSides*3);Geometry.setMapGeometry(map,0,quads,new Float32Array(elevation.length*2));
const source={mesh,directions:mesh.xyz_r,elevation,quadElements:quads,drainage:d.terrain.drainage};
const initial=structuredClone(d.runtime);initial.state!.stepS=dt;
initial.waterConfig.moistureScheme='transport';initial.waterConfig.compensatedOceanTransfers=true;initial.config.airRadiationFraction=.5;initial.environmentConfig.conductiveSeaIce=true;initial.environmentConfig.underIceOcean=true;
Object.assign(initial.config,profiles[label].thermal);Object.assign(initial.waterConfig,profiles[label].water);Object.assign(initial.environmentConfig,profiles[label].environment);
if(initial.environmentConfig.dynamicCirculation===false)initial.state!.circulation=null;
// Rebase saved template offsets while preserving every applied initial wind.
// This is a checkpoint convention change, not re-initialization of climate.
if(profiles[label].water?.windMps!==undefined){
 assert(initial.state!.thermal.steps===0);const limit=Math.abs(initial.waterConfig.windMps),base=circulationWinds(makeThermalGrid(),p,o,initial.state!.epochS,initial.state!.land,initial.waterConfig.windMps);
 const saved=initial.state!.water!,memory=initial.state!.circulation!.atmosphere;
 for(let k=0;k<base.eastMps.length;k++){assert(Math.abs(saved.windEastMps[k])<=limit&&Math.abs(saved.windNorthMps[k])<=limit,'New wind bound cannot preserve applied initial winds');memory.eastMps[k]=saved.windEastMps[k]-base.eastMps[k];memory.northMps[k]=saved.windNorthMps[k]-base.northMps[k];}
}
const rt=ThermalRuntime.fromSnapshot(initial,p,o),terrain=sampleTerrainGrid(rt.grid,mesh.xyz_r,elevation);rt.attachRestoredTerrain(terrain.landFraction,terrain.landElevation,source);rt.configureSurfacePhysics({separateSurfaceAlbedo:true,liquidOceanEvaporation:true});
await mkdir(out,{recursive:true});
await writeFile(`${out}/full-${label}-day0.json`,encodeSimulationDocument({...d,runtime:rt.snapshot()}));
const m=rt.model!,w=rt.water!,e=rt.environment!,n=rt.grid.count,year=deriveOrbit(p,o).yearS;
const initialStockSha=sha(JSON.stringify({air:m.temperatureK,land:m.landTemperatureK,sea:m.oceanTemperatureK,water:Object.fromEntries(['atmosphereKgM2','soilKgM2','surfaceKgM2','snowKgM2','seaIceKgM2','landIceKgM2','shelfLandIceKgM2','shelfSeaIceKgM2','oceanGlobalKgM2'].map(k=>[k,(w as any)[k]])),routing:w.routing!.volumeM3,heat:m.energy(),enthalpy:e.enthalpy()}));
const obs=JSON.parse(await readFile('docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json','utf8'));
const regions:{name:string;bounds:Bounds;fit:boolean}[]=[
 {name:'Europe',bounds:{south:45,north:55,west:-5,east:25},fit:true},
 {name:'East North America',bounds:{south:35,north:45,west:-95,east:-75},fit:true},
 {name:'East Asia',bounds:{south:30,north:45,west:110,east:135},fit:true},
 {name:'West Siberia',bounds:{south:50,north:60,west:60,east:90},fit:true},
 {name:'India',bounds:{south:18,north:25,west:74,east:86},fit:false},
 {name:'Himalaya foreland',bounds:{south:26,north:30,west:76,east:88},fit:false},
 {name:'Tibet',bounds:{south:29,north:35,west:80,east:95},fit:false},
 {name:'Australia southwest',bounds:{south:-35,north:-29,west:113,east:120},fit:false},
 {name:'Australia north',bounds:{south:-18,north:-10,west:125,east:140},fit:false},
 {name:'Amazon',bounds:{south:-10,north:2,west:-70,east:-50},fit:false},
 {name:'Congo',bounds:{south:-5,north:5,west:15,east:30},fit:false}
];
const supports=regions.map(r=>matchedSupport(rt.grid,w.land,r.bounds,obs.cells)),rain=new CalendarFlux(n,year),ice=new CalendarFlux(n,year),snow=new CalendarFlux(n,year),coverage=new CalendarFlux(1,year),temp=new CalendarFlux(2,year),vapor=new VaporLedger(w.atmosphereKgM2);
const mechanisms=['saturation','convection','front','convergence','orographic'] as const;
const mechanismFlux=mechanisms.map(()=>new CalendarFlux(n,year));
const transportKeys=['orographicAdvection','orographicDiffusion','frontAdvection','frontDiffusion','coldFrontAdvection'] as const;
const transportFlux=transportKeys.map(()=>new CalendarFlux(n,year));
const snowInput=new CalendarFlux(n,year),snowMelt=new CalendarFlux(n,year),snowCompact=new CalendarFlux(n,year),drivers=new CalendarFlux(n*8,year);
const initialSnow=w.snowKgM2.slice(),snowfallActual=new Float64Array(n),meltActual=new Float64Array(n),compactActual=new Float64Array(n);
const phase=e.phase.bind(e);e.phase=delta=>{const before=w.snowKgM2.slice();phase(delta);before.forEach((v,k)=>meltActual[k]+=Math.max(0,v-w.snowKgM2[k]));const s=Math.max(0,Math.min(delta,year-m.timeS));if(s>0)snowMelt.add(m.timeS,s,before.map((v,k)=>Math.max(0,v-w.snowKgM2[k])/delta));};
if(e.surfaceSolver){const solver=e.surfaceSolver,compact=solver.compact.bind(solver);solver.compact=delta=>{const before=w.snowKgM2.slice();compact(delta);before.forEach((v,k)=>compactActual[k]+=Math.max(0,v-w.snowKgM2[k]));const s=Math.max(0,Math.min(delta,year-m.timeS));if(s>0)snowCompact.add(m.timeS,s,before.map((v,k)=>Math.max(0,v-w.snowKgM2[k])/delta));};}
if(w.glacier){const glacier=w.glacier,advance=glacier.step.bind(glacier);glacier.step=(delta,t)=>{const before=w.snowKgM2.slice();advance(delta,t);before.forEach((v,k)=>compactActual[k]+=Math.max(0,v-w.snowKgM2[k]));};}
const step=w.step.bind(w);w.step=(delta,t,q,c)=>{step(delta,t,q,c);w.snowfallKgM2S!.forEach((v,k)=>snowfallActual[k]+=v*delta);vapor.add(delta,w.evaporationKgM2S,w.precipitationKgM2S,w.vaporTransportKgM2);const s=Math.max(0,Math.min(delta,year-m.timeS));if(s>0){rain.add(m.timeS,s,w.landPrecipitationKgM2S.map((v,k)=>w.land[k]>0?v/w.land[k]:0));mechanisms.forEach((key,j)=>mechanismFlux[j].add(m.timeS,s,w.landPrecipitationComponents[key].map((v,k)=>w.land[k]>0?v/w.land[k]:0)));transportKeys.forEach((key,j)=>transportFlux[j].add(m.timeS,s,w.transportRain[key]));snowInput.add(m.timeS,s,w.snowfallKgM2S!);const values=new Float64Array(n*8);for(let k=0;k<n;k++){values[k]=m.temperatureK[k];values[n+k]=m.landTemperatureK[k];values[2*n+k]=w.atmosphereKgM2[k];values[3*n+k]=w.windEastMps[k];values[4*n+k]=w.windNorthMps[k];values[5*n+k]=w.atmosphereKgM2[k]/moistureCapacity(m.temperatureK[k]);values[6*n+k]=(w as any).convergence[k]*86400;values[7*n+k]=m.oceanTemperatureK[k];}drivers.add(m.timeS,s,values);coverage.add(m.timeS,s,[1]);}};
const envStep=e.step.bind(e);e.step=delta=>{envStep(delta);const s=Math.max(0,Math.min(delta,year-m.timeS));if(s>0){ice.add(m.timeS,s,e.iceCover);snow.add(m.timeS,s,e.snowCover);let total=0,tropicalSea=0,wet=0;for(let k=0;k<n;k++){total+=w.land[k]*m.landTemperatureK[k]+(1-w.land[k])*m.oceanTemperatureK[k];if(k>=n/4&&k<3*n/4){tropicalSea+=(1-w.land[k])*m.oceanTemperatureK[k];wet+=1-w.land[k];}}temp.add(m.timeS,s,[total/n,tropicalSea/wet]);}};
const records:any[]=[];let waterMax=0,heatMax=0,vaporMax=0,routingMax=0,auditCount=0,lastAuditDay=-1;
const audit=()=>{
 const day=Math.floor(m.timeS/86400);if(day===lastAuditDay)return;lastAuditDay=day;auditCount++;
 const waterError=Math.abs(w.diagnostics().residualMm),heatError=Math.abs(e.enthalpy()-e.initialEnthalpy-m.radiationJm2),vaporError=Math.max(...vapor.residual(w.atmosphereKgM2).map(Math.abs));
 const routingError=Math.abs(w.routing!.diagnostics(w).partitionResidualM3);
 waterMax=Math.max(waterMax,waterError);heatMax=Math.max(heatMax,heatError);vaporMax=Math.max(vaporMax,vaporError);routingMax=Math.max(routingMax,routingError);
 assert(waterError<5e-6&&heatError<.005&&vaporError<1e-8&&routingError<1,'Daily budget check failed');
};
for(const days of [0,90,180,270,year/86400]){const end=Math.ceil(days*86400/dt);while(m.steps<end){rt.sync(p,o,Math.min(end,m.steps+32)*dt+.001,null);audit();}
 const budget={waterResidualMm:w.diagnostics().residualMm,enthalpyResidualJm2:e.enthalpy()-e.initialEnthalpy-m.radiationJm2,vaporResidualMm:Math.max(...vapor.residual(w.atmosphereKgM2).map(Math.abs)),routingResidualM3:w.routing!.diagnostics(w).partitionResidualM3};
 waterMax=Math.max(waterMax,Math.abs(budget.waterResidualMm));heatMax=Math.max(heatMax,Math.abs(budget.enthalpyResidualJm2));vaporMax=Math.max(vaporMax,budget.vaporResidualMm);assert(waterMax<5e-6&&heatMax<.005&&vaporMax<1e-8);
 records.push({day:m.timeS/86400,seconds:(performance.now()-start)/1000,budget});console.log(JSON.stringify({label,...records.at(-1)}));
}
assert(Math.abs(sum(coverage.total)-year)<1e-6);
const reference=JSON.parse(await readFile('docs/evidence/earth-seaice-causal-20261011/nsidc-same-grid.json','utf8')),weights=reference.supportM2;
const concentration=ice.months.map((a,j)=>Array.from(a,v=>v/coverage.months[j][0]));
const polar=(c:number[],h:string)=>{let extent=0,area=0;for(let k=0;k<n;k++)if(h==='north'?k<n/2:k>=n/2){if(c[k]>=.15)extent+=weights[k]/1e12;area+=c[k]*weights[k]/1e12;}return {extentMillionKm2:extent,areaMillionKm2:area};};
const hemispheres=Object.fromEntries(['north','south'].map(h=>{const monthly=concentration.map((c,j)=>({month:j+1,...polar(c,h),observed:polar(reference.concentration[j],h)}));return [h,{monthly,extentMAE:sum(monthly.map(v=>Math.abs(v.extentMillionKm2-v.observed.extentMillionKm2)))/12,areaMAE:sum(monthly.map(v=>Math.abs(v.areaMillionKm2-v.observed.areaMillionKm2)))/12}];}));
const gpcc=regions.map((r,i)=>({...r,observedAnnualMm:sum(supports[i].observedMonthlyMm),observedMonthlyMm:Array.from(supports[i].observedMonthlyMm),modelAnnualMm:supports[i].mean(rain.total),annualMechanismsMm:Object.fromEntries(mechanisms.map((key,j)=>[key,supports[i].mean(mechanismFlux[j].total)])),monthlyMm:rain.months.map(a=>supports[i].mean(a)),monthlySnowCover:snow.months.map((a,j)=>supports[i].mean(a)/coverage.months[j][0])}));
for(const r of gpcc)assert(Math.abs(sum(Object.values(r.annualMechanismsMm))-r.modelAnnualMm)<1e-7,'Precipitation mechanism partition failed');
await mkdir(out,{recursive:true});
const snowLedger={initial:Array.from(initialSnow),final:Array.from(w.snowKgM2),snowfall:Array.from(snowfallActual),melt:Array.from(meltActual),compaction:Array.from(compactActual)};
const snowResidual=initialSnow.map((v,k)=>w.snowKgM2[k]-v-snowfallActual[k]+meltActual[k]+compactActual[k]);
assert(Math.max(...snowResidual.map(Math.abs))<1e-6,'Snow transfer ledger mismatch');
const causal={transport:transportKeys.map((key,j)=>({key,annual:Array.from(transportFlux[j].total),monthly:transportFlux[j].months.map(a=>Array.from(a))})),snowLedger,snowResidualMax:Math.max(...snowResidual.map(Math.abs)),drivers:{keys:['airK','landK','vaporKgM2','windEastMps','windNorthMps','relativeHumidity','convergenceDay','oceanK'],monthly:drivers.months.map((a,j)=>Array.from(a,v=>v/coverage.months[j][0]))}};
const vaporBudget={initial:Array.from(vapor.initial),final:Array.from(w.atmosphereKgM2),evaporation:Array.from(vapor.evaporation),precipitation:Array.from(vapor.precipitation),netTransport:Array.from(vapor.transport)};
const final=rt.snapshot(),restored=ThermalRuntime.fromSnapshot(final,p,o),next=m.timeS+dt;restored.attachRestoredTerrain(terrain.landFraction,terrain.landElevation,source);
const lakeVolumeM3=sum(Array.from(w.routing!.volumeM3).filter((v,t)=>(w.routing!.network.inlandLakeId?.[t]??0)>0));
await writeFile(`${out}/full-${label}-day365.json`,encodeSimulationDocument({...d,runtime:final,terrain:{...d.terrain,settings:{...d.terrain.settings,timeS:final.state!.lastTarget}}}));
rt.sync(p,o,next,null);restored.sync(p,o,next,null);assert.deepEqual(restored.snapshot(),rt.snapshot());
await mkdir(out,{recursive:true});await writeFile(`${out}/full-${label}.json`,JSON.stringify({stage:'full-earth',lakeVolumeM3,inputSha256:sha(inputRaw),meshTriangles:mesh.numTriangles,label,parameters:profiles[label],formalSha256:sha(raw),initialStockSha,initialEnthalpy:e.initialEnthalpy,dt,bundleSha256:sha(await readFile(process.argv[1],'utf8')),records,causal,vaporBudget,numerics:'compensated-ocean-transfers',budgetMax:{waterMax,heatMax,vaporMax,routingMax},budgetAudit:{cadence:'at least once per physical day, after completed sync block',auditCount},strictContinuation:true,hemispheres,gpcc,annualSurfaceMeanC:temp.total[0]/year-273.15,annualTropicalSeaMeanC:temp.total[1]/year-273.15,monthlyTemperatureC:temp.months.map((a,j)=>Array.from(a,v=>v/coverage.months[j][0]-273.15))},null,2)+'\n');
