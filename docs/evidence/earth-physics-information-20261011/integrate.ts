/** Information ablation on an unchanged surface partition and unchanged stocks.
 * This modifies only the evidence runtime, never the authored Earth/defaults. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {makeMesh} from '../../../mesh.ts';
import config,{HIGH_DETAIL_SPACING} from '../../../config.js';
import Map from '../../../map.ts';
import Geometry from '../../../geometry.ts';
import {decodeSimulationDocument} from '../../../simulation-document.ts';
import {meshIdentity} from '../../../terrain-document.ts';
import {ThermalRuntime} from '../../../thermal-runtime.ts';
import {sampleTerrainGrid} from '../../../thermal.ts';
import {deriveOrbit} from '../../../astronomy.ts';
import {cellBounds,sphericalOverlap,matchedSupport,CalendarFlux,VaporLedger,type Bounds} from '../../../climate-diagnostics.ts';
const folder='docs/evidence/earth-physics-information-20261011',out='build/earth-physics-information';
const label=process.env.INFO_ARM??'relief',dt=1800,start=performance.now();
assert.ok(['relief','flat'].includes(label));
const sha=(s:any)=>createHash('sha256').update(s).digest('hex');
const sum=(a:Iterable<number>)=>{let s=0,c=0;for(const v of a){const y=v-c,t=s+y;c=(t-s)-y;s=t;}return s;};
await mkdir(out,{recursive:true});
config.spacing=HIGH_DETAIL_SPACING;const {mesh,t_peaks}=await makeMesh(),identity=meshIdentity(mesh,config);
const raw=await readFile('scenes/earth-land-sea/earth-simulation.json','utf8'),d=decodeSimulationDocument(raw,identity,128),planet=d.terrain.settings.planet,orbit=d.terrain.settings.orbit;
const map=new Map(mesh,t_peaks,config);map.assignElevation(d.terrain.parameters.elevation,{size:128,constraints:new Float32Array(d.terrain.constraints.values)},new Float32Array(d.terrain.offsets!));map.assignRainfall(d.terrain.parameters.biomes);map.assignRivers(d.terrain.parameters.rivers,true);
const elevation=new Float32Array(mesh.numRegions+mesh.numTriangles);elevation.set(map.elevation_r);elevation.set(map.elevation_t,mesh.numRegions);
const quads=new Int32Array(mesh.numSolidSides*3);Geometry.setMapGeometry(map,0,quads,new Float32Array(elevation.length*2));
const source={mesh,directions:mesh.xyz_r,elevation,quadElements:quads,drainage:d.terrain.drainage};
const initial=structuredClone(d.runtime);initial.config.airRadiationFraction=.5;initial.waterConfig.moistureScheme='transport';initial.state!.stepS=dt;
initial.environmentConfig.conductiveSeaIce=true;initial.environmentConfig.underIceOcean=true;
const terrain=sampleTerrainGrid(ThermalRuntime.fromSnapshot(initial,planet,orbit).grid,mesh.xyz_r,elevation);
// Negative height has no input path into the thermal/circulation equations.
const differentBathy=elevation.map(e=>e<=0?e*3:e),bathySample=sampleTerrainGrid(ThermalRuntime.fromSnapshot(initial,planet,orbit).grid,mesh.xyz_r,differentBathy);
assert.deepEqual(bathySample,terrain);
const rt=ThermalRuntime.fromSnapshot(initial,planet,orbit);rt.attachRestoredTerrain(terrain.landFraction,terrain.landElevation,source);
const m=rt.model!,w=rt.water!,env=rt.environment!,n=rt.grid.count,year=deriveOrbit(planet,orbit).yearS;
const stocks=()=>({air:m.temperatureK,land:m.landTemperatureK,sea:m.oceanTemperatureK,water:Object.fromEntries(['atmosphereKgM2','soilKgM2','surfaceKgM2','snowKgM2','seaIceKgM2','landIceKgM2','shelfLandIceKgM2','shelfSeaIceKgM2','oceanGlobalKgM2'].map(k=>[k,(w as any)[k]]))});
const coarseInitial=structuredClone(stocks()),originalInventorySha=sha(JSON.stringify(coarseInitial));
rt.enableRefinement('balanced');const fine=rt.refinedSurface!,p=fine.partition;
// Identical patch temperatures in both arms: no relief-dependent initial heat.
for(let t=0;t<p.parent.length;t++){fine.landK[t]=(coarseInitial.land as Float64Array)[p.parent[t]];fine.seaK[t]=(coarseInitial.sea as Float64Array)[p.parent[t]];}
fine.aggregate();
for(const k of ['air','land','sea'] as const)assert.ok((stocks()[k] as Float64Array).every((v,i)=>Math.abs(v-(coarseInitial[k] as Float64Array)[i])<1e-10));
for(const key of Object.keys(coarseInitial.water)){const a=(stocks().water as any)[key],b=(coarseInitial.water as any)[key];if(typeof a==='number')assert.equal(a,b);else assert.ok(a.every((v:number,i:number)=>Math.abs(v-b[i])<1e-8),key);}
const fineInventorySha=sha(JSON.stringify({coarse:stocks(),patch:Object.fromEntries(['snow','ice','grounded','shelfLand','shelfSea','soil','surface','landK','seaK'].map(k=>[k,(fine as any)[k]]))}));
const partitionGeometrySha=sha(JSON.stringify(Object.fromEntries(['level','offset','parent','land','sea','u','v'].map(k=>[k,(p as any)[k]]))));
const actualHeightSha=sha(JSON.stringify(p.heightM));
// Same partition, mean elevation, coast and routing in both arms. Only local
// land-height variance is removed, through all fine-surface uses of height.
if(label==='flat'){
 for(let t=0;t<p.parent.length;t++)p.heightM[t]=p.land[t]>0?fine.meanHeight[p.parent[t]]:0;
 fine.maxHeight.set(fine.meanHeight);
}
env.refresh();
const obsText=await readFile('docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json','utf8'),obs=JSON.parse(obsText);
const regions:{name:string;bounds:Bounds}[]=[
 {name:'Amazon',bounds:{south:-7,north:1,west:-68,east:-52}},{name:'Congo',bounds:{south:-4,north:4,west:15,east:31}},
 {name:'India',bounds:{south:18,north:25,west:74,east:86}},{name:'Himalaya foreland',bounds:{south:25,north:29,west:79,east:91}},
 {name:'Tibet',bounds:{south:31,north:36,west:80,east:94}},{name:'Australia interior',bounds:{south:-29,north:-21,west:126,east:142}},
 {name:'Australia north',bounds:{south:-18,north:-10,west:123,east:139}},{name:'Australia east',bounds:{south:-34,north:-26,west:148,east:154}},
 {name:'Australia southwest',bounds:{south:-35,north:-29,west:113,east:120}}
];
const supports=regions.map(r=>matchedSupport(rt.grid,w.land,r.bounds,obs.cells));
const regionWeights=regions.map(r=>Float64Array.from({length:n},(_,k)=>sphericalOverlap(r.bounds,cellBounds(rt.grid,k))));
const rain=new CalendarFlux(n,year),iceCover=new CalendarFlux(n,year),coverage=new CalendarFlux(1,year),vapor=new VaporLedger(w.atmosphereKgM2);
const environmentStep=env.step.bind(env);env.step=(delta)=>{
 environmentStep(delta);const recordS=Math.max(0,Math.min(delta,year-m.timeS));if(recordS===0)return;
 const area=new Float64Array(n),covered=new Float64Array(n);
 for(let t=0;t<p.parent.length;t++){const k=p.parent[t],marine=Math.max(0,p.sea[t]-fine.lakeArea[t]);area[k]+=marine;covered[k]+=marine>0?marine*Math.min(1,fine.ice[t]/(917*.5*marine)):0;}
 iceCover.add(m.timeS,recordS,covered.map((a,k)=>area[k]>0?a/area[k]:0));
};
const waterStep=w.step.bind(w);w.step=(delta,t,q,c)=>{waterStep(delta,t,q,c);vapor.add(delta,w.evaporationKgM2S,w.precipitationKgM2S,w.vaporTransportKgM2);
 const recordS=Math.max(0,Math.min(delta,year-m.timeS));if(recordS===0)return;
 rain.add(m.timeS,recordS,Float64Array.from(w.landPrecipitationKgM2S,(v,k)=>w.land[k]>0?v/w.land[k]:0));coverage.add(m.timeS,recordS,[1]);
};
function budget(){
 const total=w.oceanGlobalKgM2+sum(['atmosphereKgM2','soilKgM2','surfaceKgM2','snowKgM2','seaIceKgM2','landIceKgM2','shelfLandIceKgM2','shelfSeaIceKgM2'].map(k=>sum((w as any)[k])/n));
 const sensible=sum(m.temperatureK.map((v,k)=>m.capacity[k]*v+m.landCapacity[k]*m.landTemperatureK[k]+m.oceanCapacity[k]*m.oceanTemperatureK[k]))/n;
 const latent=(2450000*sum(w.atmosphereKgM2)-334000*sum(['snowKgM2','seaIceKgM2','landIceKgM2','shelfLandIceKgM2','shelfSeaIceKgM2'].map(k=>sum((w as any)[k]))))/n;
 const result={waterResidualMm:total-w.initialTotalMm,enthalpyResidualJm2:sensible+latent-env.initialEnthalpy-m.radiationJm2,maxCellVaporResidualMm:Math.max(...vapor.residual(w.atmosphereKgM2).map(Math.abs))};
 assert.ok(Math.abs(result.waterResidualMm)<5e-6);assert.ok(Math.abs(result.enthalpyResidualJm2)<.005);assert.ok(result.maxCellVaporResidualMm<1e-8);
 for(const key of ['atmosphereKgM2','soilKgM2','surfaceKgM2','snowKgM2','seaIceKgM2'] as const)assert.ok(w[key].every(v=>Number.isFinite(v)&&v>=-1e-10));
 assert.ok([...m.temperatureK,...fine.landK,...fine.seaK].every(v=>Number.isFinite(v)&&v>0));
 return result;
}
const results:any={label,dt,inputSha256:sha(raw),bundleSha256:sha(await readFile(process.argv[1])),meshTriangles:mesh.numTriangles,atmosphereCells:n,surfacePatches:p.parent.length,originalInventorySha,fineInventorySha,partitionGeometrySha,actualHeightSha,activeHeightSha:sha(JSON.stringify(p.heightM)),yearS:year,observations:{product:obs.product,url:obs.url,rawSha256:obs.sha256,gridSha256:sha(obsText)},bathyCoastPreservingInputExact:true,initialBudget:budget(),records:[]};
async function checkpoint(){
 const b=budget();
 const record={day:m.timeS/86400,steps:m.steps,seconds:(performance.now()-start)/1000,budget:b,calendarCoverageS:coverage.months.map(a=>a[0]),regions:regions.map((r,i)=>{
  const wt=regionWeights[i],mean=(a:ArrayLike<number>)=>sum(wt.map((v,k)=>v*a[k]))/sum(wt);
  let land=0,second=0,temp=0,snow=0;for(let t=0;t<p.parent.length;t++){const k=p.parent[t],a=wt[k]*p.land[t];land+=a;temp+=a*fine.landK[t];second+=a*fine.landK[t]**2;snow+=wt[k]*fine.snow[t];}
  const landC=land>0?temp/land-273.15:null,landSpreadK=land>0?Math.sqrt(Math.max(0,second/land-(temp/land)**2)):null;
  return {...r,validLandAreaKm2:supports[i].solidAngle*planet.radiusM**2/1e6,observedMonthlyMm:supports[i].observedMonthlyMm,observedAnnualMm:sum(supports[i].observedMonthlyMm),modelMonthlyMm:rain.months.map(a=>supports[i].mean(a)),modelCumulativeMm:supports[i].mean(rain.total),airC:mean(m.temperatureK)-273.15,landC,landSpreadK,snowMm:land>0?snow/land:0};
 }),globalIceMm:sum(w.seaIceKgM2)/n};
 results.records.push(record);results.monthlyMeanMarineIceCover=iceCover.months.map((a,j)=>Array.from(a,(v)=>coverage.months[j][0]>0?v/coverage.months[j][0]:0));
 results.iceCoverMethod='Actual patch marine-conditional clipped mass/(917*0.5m), area averaged to parent, treated as uniform parent concentration on the fixed NSIDC valid marine support. Ice shelves are excluded by the existing observation support. Not independent ice concentration or exact patch-level observational support.';
 await writeFile(`${folder}/${label}.json`,JSON.stringify(results,null,2)+'\n');
 console.log(JSON.stringify({label,day:record.day,seconds:record.seconds,budget:b,regionalP:record.regions.map(r=>[r.name,r.modelCumulativeMm])}));
}
await checkpoint();
for(const count of [90*86400/dt,180*86400/dt,270*86400/dt,Math.ceil(year/dt)]){
 while(m.steps<count){const end=Math.min(count,m.steps+32);rt.sync(planet,orbit,end*dt+.001,null);}
 await checkpoint();
}
assert.ok(Math.abs(sum(coverage.months.map(a=>a[0]))-year)<1e-6);
const final=rt.snapshot();await writeFile(`${out}/${label}-final.json`,JSON.stringify(final));results.finalSnapshotSha=sha(JSON.stringify(final));
// Flat height is an intentional evidence-only terrain override, so attach of
// the original authored terrain would correctly reject its topology. Restore
// the recorded runtime without replacing its fine partition instead.
const restored=ThermalRuntime.fromSnapshot(final,planet,orbit),next=m.timeS+dt;
// Attaching terrain is needed for routing/glaciers; flat mismatch cannot be
// bypassed without weakening the production validation. Do not claim exact
// full-terrain continuation for that experimental arm.
results.snapshotRuntimeDecoded=true;results.fullTerrainRestoreChecked=false;
if(label==='relief'){
 restored.attachRestoredTerrain(terrain.landFraction,terrain.landElevation,source);
 rt.sync(planet,orbit,next,null);restored.sync(planet,orbit,next,null);assert.deepEqual(restored.snapshot(),rt.snapshot());results.fullTerrainRestoreChecked=true;
}
await writeFile(`${folder}/${label}.json`,JSON.stringify(results,null,2)+'\n');
