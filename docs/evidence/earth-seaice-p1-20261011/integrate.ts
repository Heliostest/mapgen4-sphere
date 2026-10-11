/** Full authored Earth. Telemetry wraps the existing water step without
 * changing its inputs, outputs, ordering, or snapshot fields. sync batches
 * render mapping every 32 steps; every physical flux is recorded once. */
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
import {sampleTerrainGrid,thermalCell} from '../../../thermal.ts';
import {surfaceCell} from '../../../surface-grid.ts';
import {deriveOrbit} from '../../../astronomy.ts';
import {cellBounds,sphericalOverlap,matchedSupport,CalendarFlux,VaporLedger,type Bounds} from '../../../climate-diagnostics.ts';
const folder='docs/evidence/earth-seaice-p1-20261011',out='build/earth-seaice-p1',label=process.env.P1_LABEL??'after',dt=Number(process.env.P1_DT??1800);
await mkdir(out,{recursive:true});const start=performance.now(),sha=(s:any)=>createHash('sha256').update(s).digest('hex');
config.spacing=HIGH_DETAIL_SPACING;const {mesh,t_peaks}=await makeMesh(),identity=meshIdentity(mesh,config);
const raw=await readFile('scenes/earth-land-sea/earth-simulation.json','utf8'),d=decodeSimulationDocument(raw,identity,128),planet=d.terrain.settings.planet,orbit=d.terrain.settings.orbit;
const map=new Map(mesh,t_peaks,config);map.assignElevation(d.terrain.parameters.elevation,{size:128,constraints:new Float32Array(d.terrain.constraints.values)},new Float32Array(d.terrain.offsets!));map.assignRainfall(d.terrain.parameters.biomes);map.assignRivers(d.terrain.parameters.rivers,true);
const elevation=new Float32Array(mesh.numRegions+mesh.numTriangles);elevation.set(map.elevation_r);elevation.set(map.elevation_t,mesh.numRegions);
const quads=new Int32Array(mesh.numSolidSides*3);Geometry.setMapGeometry(map,0,quads,new Float32Array(elevation.length*2));
const source={mesh,directions:mesh.xyz_r,elevation,quadElements:quads,drainage:d.terrain.drainage};
const initial=structuredClone(d.runtime);initial.config.airRadiationFraction=.5;initial.waterConfig.moistureScheme='transport';initial.state!.stepS=dt;
if(process.env.P1_LEGACY==='1'){delete initial.config.airRadiationFraction;delete initial.waterConfig.moistureScheme;}
if(process.env.P1_ICE!=='0')initial.environmentConfig.conductiveSeaIce=true;
const terrain=sampleTerrainGrid(ThermalRuntime.fromSnapshot(initial,planet,orbit).grid,mesh.xyz_r,elevation);
function restore(s:any){const r=ThermalRuntime.fromSnapshot(s,planet,orbit);r.attachRestoredTerrain(terrain.landFraction,terrain.landElevation,source);return r;}
const rt=restore(initial),w=rt.water!,m=rt.model!,n=rt.grid.count,year=deriveOrbit(planet,orbit).yearS;
const rain=new CalendarFlux(n,year),vapor=new VaporLedger(w.atmosphereKgM2),initialOcean=w.oceanGlobalKgM2;
const eastWind=new CalendarFlux(n,year),northWind=new CalendarFlux(n,year),coverage=new CalendarFlux(1,year),coast=new CalendarFlux(4,year);
const coastWeights=rt.grid.edges.map(e=>{
 const a=cellBounds(rt.grid,e.a),b=cellBounds(rt.grid,e.b),lat=(Math.asin(rt.grid.sinLat[Math.floor(e.a/rt.grid.width)])+Math.asin(rt.grid.sinLat[Math.floor(e.b/rt.grid.width)]))*90/Math.PI,lon=(a.west+a.east+b.west+b.east)/4;
 return {branch:lon<80?0:1,weight:lat>=5&&lat<=27&&lon>=60&&lon<=100?(w.land[e.b]-w.land[e.a])*rt.grid.solidAngle*planet.radiusM**2/1e12:0};
});
const componentAmounts=Object.fromEntries(['saturation','convection','front','convergence','orographic'].map(k=>[k,new Float64Array(n)]));
const regions:{name:string;bounds:Bounds}[]=[
 {name:'Amazon',bounds:{south:-7,north:1,west:-68,east:-52}},
 {name:'Congo',bounds:{south:-4,north:4,west:15,east:31}},
 {name:'India',bounds:{south:18,north:25,west:74,east:86}},
 {name:'Himalaya foreland',bounds:{south:25,north:29,west:79,east:91}},
 {name:'Tibet',bounds:{south:31,north:36,west:80,east:94}},
 {name:'Australia interior',bounds:{south:-29,north:-21,west:126,east:142}},
 {name:'Australia north',bounds:{south:-18,north:-10,west:123,east:139}},
 {name:'Australia east',bounds:{south:-34,north:-26,west:148,east:154}},
 {name:'Australia southwest',bounds:{south:-35,north:-29,west:113,east:120}}
];
const observations=JSON.parse(await readFile('docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json','utf8'));
const supports=regions.map(r=>matchedSupport(rt.grid,w.land,r.bounds,observations.cells));
const wholeWeights=regions.map(r=>Float64Array.from({length:n},(_,k)=>sphericalOverlap(r.bounds,cellBounds(rt.grid,k))));
const sum=(a:Iterable<number>)=>{let s=0,c=0;for(const v of a){const y=v-c,t=s+y;c=(t-s)-y;s=t;}return s;};
const mean=(weights:Float64Array,a:ArrayLike<number>)=>sum(weights.map((x,k)=>x*a[k]))/sum(weights);
// Fixed imported shelf geometry, excluding land and confirmed inland lakes.
const wetMeshArea=new Float64Array(n),shelfMeshArea=new Float64Array(n),net=w.routing!.network;
for(let t=0;t<mesh.numTriangles;t++) {
 if(source.elevation[mesh.numRegions+t]>0||(net.inlandLakeId?.[t]??0)>0)continue;
 const xyz=mesh.xyz_t.subarray(3*t,3*t+3),u=.5+Math.atan2(xyz[0],xyz[2])/(2*Math.PI),v=Math.acos(Math.max(-1,Math.min(1,xyz[1])))/Math.PI,k=thermalCell(rt.grid,u,v),sc=surfaceCell(rt.surfaceGrid,u,v);
 wetMeshArea[k]+=net.areaM2[t];if((initial.iceInventory?.shelfThicknessM[sc]??0)>0)shelfMeshArea[k]+=net.areaM2[t];
}
const marine=Float64Array.from(w.land,(l,k)=>Math.max(0,1-l-w.inlandWaterFraction[k]));
const shelfFraction=marine.map((area,k)=>wetMeshArea[k]>0?area*shelfMeshArea[k]/wetMeshArea[k]:0),support=marine.map((area,k)=>Math.max(0,area-shelfFraction[k]));
function polar() {
 const out={north:{extentMillionKm2:0,areaMillionKm2:0,iceGlobalMm:0},south:{extentMillionKm2:0,areaMillionKm2:0,iceGlobalMm:0}};
 for(let k=0;k<n;k++){const h=k<n/2?out.north:out.south,wet=1-w.land[k],cover=wet>0?Math.min(1,w.seaIceKgM2[k]/(917*.5*wet)):0,area=support[k]*w.cellAreaM2/1e12;if(cover>=.15)h.extentMillionKm2+=area;h.areaMillionKm2+=cover*area;h.iceGlobalMm+=w.seaIceKgM2[k]/n;}
 return out;
}
const seaIceDaily:any[]=[{day:0,...polar()}],seaIceMonthlyFlux=new CalendarFlux(8,year),seaIceCoverage=new CalendarFlux(1,year);
const env=rt.environment!,envStep=env.step.bind(env);let maxSkinResidual=0;
env.step=(delta:number)=>{
 envStep(delta);const end=m.timeS+delta;
 if(Math.floor(end/86400)>seaIceDaily.at(-1).day)seaIceDaily.push({day:end/86400,...polar()});
 if(env.seaIceHeat){const d=env.seaIceHeat,rates=new Float64Array(8);for(let k=0;k<n;k++){const h=k<n/2?0:4;rates[h]+=d.conductiveWm2[k]/(n/2);rates[h+1]+=d.airWm2[k]/(n/2);rates[h+2]+=d.oceanWm2[k]/(n/2);rates[h+3]+=env.ocean.heatWm2[k]/(n/2);maxSkinResidual=Math.max(maxSkinResidual,Math.abs(d.balanceResidualWm2[k]));}seaIceMonthlyFlux.add(m.timeS,delta,rates);seaIceCoverage.add(m.timeS,delta,[1]);}
};
const waterStep=w.step.bind(w);w.step=(delta,t,q,coupling)=>{waterStep(delta,t,q,coupling);vapor.add(delta,w.evaporationKgM2S,w.precipitationKgM2S,w.vaporTransportKgM2);
 const landRate=(w as any).landPrecipitationKgM2S?Float64Array.from(w.landPrecipitationKgM2S,(p,k)=>w.land[k]>0?p/w.land[k]:0):w.precipitationKgM2S;
 rain.add(m.timeS,delta,landRate);
 eastWind.add(m.timeS,delta,w.windEastMps);northWind.add(m.timeS,delta,w.windNorthMps);coverage.add(m.timeS,delta,[1]);
 if((w as any).faceVaporTransportKgM2){
  const rates=new Float64Array(4),incidence=new Float64Array(n);
  rt.grid.edges.forEach((e,k)=>{const flux=w.faceVaporTransportKgM2[k];incidence[e.a]-=flux;incidence[e.b]+=flux;const cw=coastWeights[k],landward=flux*cw.weight/delta;rates[cw.branch]+=landward;if(landward>0)rates[2]+=landward;else rates[3]-=landward;});
  for(let k=0;k<n;k++)assert.ok(Math.abs(incidence[k]-w.vaporTransportKgM2[k])<1e-9,'Independent face vapor incidence');
  coast.add(m.timeS,delta,rates);
 }
 const components=(w as any).precipitationComponents,landComponents=(w as any).landPrecipitationComponents;
 if(components)for(let k=0;k<n;k++){let total=0,landTotal=0;for(const name of Object.keys(componentAmounts)){const p=components[name][k];assert.ok(Number.isFinite(p)&&p>=0);total+=p;const lp=landComponents?(w.land[k]>0?landComponents[name][k]/w.land[k]:0):p;componentAmounts[name][k]+=delta*lp;landTotal+=lp;}assert.ok(Math.abs(total-w.precipitationKgM2S[k])<1e-12,'Actual column precipitation partition');assert.ok(Math.abs(landTotal-landRate[k])<1e-12,'Actual deposited land precipitation partition');}
};
function budget(){
 const stores=['atmosphereKgM2','soilKgM2','surfaceKgM2','snowKgM2','seaIceKgM2','landIceKgM2','shelfLandIceKgM2','shelfSeaIceKgM2'] as const;
 const total=w.oceanGlobalKgM2+sum(stores.map(k=>sum(w[k])/n));
 const sensible=sum(m.temperatureK.map((t,k)=>m.capacity[k]*t+m.landCapacity[k]*m.landTemperatureK[k]+m.oceanCapacity[k]*m.oceanTemperatureK[k]))/n;
 const latent=(2450000*sum(w.atmosphereKgM2)-334000*sum(['snowKgM2','seaIceKgM2','landIceKgM2','shelfLandIceKgM2','shelfSeaIceKgM2'].map(k=>sum((w as any)[k]))))/n;
 const residual=vapor.residual(w.atmosphereKgM2);
 return {waterResidualMm:total-w.initialTotalMm,enthalpyResidualJm2:sensible+latent-rt.environment!.initialEnthalpy-m.radiationJm2,maxCellVaporResidualMm:Math.max(...residual.map(Math.abs)),globalNetVaporTransportMm:sum(vapor.transport)/n,totalMm:total,oceanChangeGlobalMm:w.oceanGlobalKgM2-initialOcean};
}
const results:any={label,dt,inputSha256:sha(raw),initialStocksSha256:sha(JSON.stringify({air:m.temperatureK,land:m.landTemperatureK,sea:m.oceanTemperatureK,water:Object.fromEntries(['atmosphereKgM2','soilKgM2','surfaceKgM2','snowKgM2','seaIceKgM2','landIceKgM2','shelfLandIceKgM2','shelfSeaIceKgM2','oceanGlobalKgM2'].map(k=>[k,(w as any)[k]]))})),bundleSha256:sha(await readFile(process.argv[1])),method:'Identical strict-restored day-zero stocks. Actual ThermalRuntime.sync, full terrain routing/glaciers/dynamic atmosphere. No seasonal seek or climate regeneration. Every water step instrumented; Gregorian-normalized calendar starts March20. GPCC and model use exactly the same valid land intersection. Land precipitation is the actual deposited land amount divided by land fraction; old baseline deposition was uniform column rain. Whole-area vapor ledger retains TOTAL column precipitation.',coastalMethod:'Signed net vapor face transfer weighted by the change in land fraction within 5–27N,60–100E. West/east of 80E separate Arabian/Bay branches. Amount in Gt. Includes recipient coastal mountain/front rain; excludes rain intercepted on donor land. Measures coastal transfer, not historical marine provenance. Gross in/out refer to positive/negative NET face transfers, not counter-exchange parcel totals.',observations:{product:observations.product,url:observations.url,sha256:observations.sha256},records:[]};
async function checkpoint(day:number){
 const snapshot=rt.snapshot(),save={...d,terrain:{...d.terrain,settings:{...d.terrain.settings,timeS:snapshot.state!.lastTarget}},runtime:snapshot,comparison:{baseline:null,history:[]}};
 const encoded=encodeSimulationDocument(save);decodeSimulationDocument(encoded,identity,128);
 const file=`${out}/${label}-${dt}-day${day}.json`;await writeFile(file,encoded);
 const b=budget();assert.ok(Math.abs(b.waterResidualMm)<5e-6,'Independent water ledger');assert.ok(Math.abs(b.enthalpyResidualJm2)<.005,'Independent enthalpy ledger');assert.ok(b.maxCellVaporResidualMm<1e-8,'Independent vapor ledger');
 const record={day:m.timeS/86400,steps:m.steps,file,sha256:sha(encoded),budget:b,seconds:(performance.now()-start)/1000,calendarCoverageS:coverage.months.map(a=>a[0]),coastalGt:(w as any).faceVaporTransportKgM2?{total:Array.from(coast.total),months:coast.months.map(a=>Array.from(a))}:null,regions:regions.map((r,i)=>({name:r.name,bounds:r.bounds,validLandAreaKm2:supports[i].solidAngle*planet.radiusM**2/1e6,observedMonthlyMm:supports[i].observedMonthlyMm,observedAnnualMm:sum(supports[i].observedMonthlyMm),modelMonthlyMm:rain.months.map(a=>supports[i].mean(a)),modelCumulativeMm:supports[i].mean(rain.total),monthlyWindMps:{east:eastWind.months.map((a,j)=>coverage.months[j][0]>0?supports[i].mean(a)/coverage.months[j][0]:null),north:northWind.months.map((a,j)=>coverage.months[j][0]>0?supports[i].mean(a)/coverage.months[j][0]:null)},precipitationComponentsMm:(w as any).precipitationComponents?Object.fromEntries(Object.entries(componentAmounts).map(([name,a])=>[name,supports[i].mean(a)])):null,wholeArea:{P:mean(wholeWeights[i],vapor.precipitation),E:mean(wholeWeights[i],vapor.evaporation),netTransport:mean(wholeWeights[i],vapor.transport),storageDelta:mean(wholeWeights[i],w.atmosphereKgM2.map((v,k)=>v-vapor.initial[k])),residual:mean(wholeWeights[i],vapor.residual(w.atmosphereKgM2))},airC:mean(wholeWeights[i],m.temperatureK)-273.15,landC:supports[i].mean(m.landTemperatureK)-273.15}))};
 const ice={conductiveSeaIce:!!initial.environmentConfig.conductiveSeaIce,proxy:'seaIce/(wet*917*0.5m), clipped; 15% extent threshold; fixed imported shelf area excluded from marine support',supportMillionKm2:sum(support)*w.cellAreaM2/1e12,shelfExcludedMillionKm2:sum(shelfFraction)*w.cellAreaM2/1e12,daily:seaIceDaily,fluxNames:['N conduction up','N ice sensible to air','N ice heat to ocean','N ocean advection','S conduction up','S ice sensible to air','S ice heat to ocean','S ocean advection'],fluxMonthlyJm2:seaIceMonthlyFlux.months,coverageMonthlyS:seaIceCoverage.months,maxSkinResidualWm2:maxSkinResidual};
 await writeFile(`${folder}/${label}-${dt}-seaice.json`,JSON.stringify(ice,null,2)+'\n');
 results.records.push({...record,seaIce:polar()});await writeFile(`${folder}/${label}-${dt}-continuous.json`,JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify({label,dt,day:record.day,seconds:record.seconds,budget:b,seaIce:polar(),P:record.regions.map(r=>[r.name,r.modelCumulativeMm])}));
}
await checkpoint(0);
for(const day of (process.env.P1_DAYS??'24,90,180,270,365').split(',').map(Number)){
 const count=Math.floor(day*86400/dt);while(m.steps<count){const end=Math.min(count,m.steps+32);rt.sync(planet,orbit,end*dt+.001,null);if(m.steps%1024===0)console.log(JSON.stringify({label,dt,progressDay:m.timeS/86400,seconds:(performance.now()-start)/1000}));}await checkpoint(day);
}
const restored=restore(rt.snapshot()),next=m.timeS+dt;rt.sync(planet,orbit,next,null);restored.sync(planet,orbit,next,null);assert.deepEqual(restored.snapshot(),rt.snapshot());results.strictRestoreNextStepExact=true;await writeFile(`${folder}/${label}-${dt}-continuous.json`,JSON.stringify(results,null,2)+'\n');


