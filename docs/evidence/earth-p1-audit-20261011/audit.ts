/** Read-only P1 follow-up. Reuses bound real-integration checkpoints; no new annual run. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {makeMesh} from '../../../mesh.ts';
import config,{HIGH_DETAIL_SPACING} from '../../../config.js';
import Map from '../../../map.ts';
import Geometry from '../../../geometry.ts';
import {decodeSimulationDocument,encodeSimulationDocument} from '../../../simulation-document.ts';
import {meshIdentity} from '../../../terrain-document.ts';
import {ThermalRuntime} from '../../../thermal-runtime.ts';
import {sampleTerrainGrid} from '../../../thermal.ts';
import {terrainWaterView} from '../../../terrain-water-view.ts';
const folder='docs/evidence/earth-p1-audit-20261011';
await mkdir(folder,{recursive:true});
const sha=(x:any)=>createHash('sha256').update(x).digest('hex');
const sum=(xs:Iterable<number>)=>{let s=0,c=0;for(const x of xs){const y=x-c,t=s+y;c=(t-s)-y;s=t;}return s;};
config.spacing=HIGH_DETAIL_SPACING;
const {mesh,t_peaks}=await makeMesh(),identity=meshIdentity(mesh,config);
const formalPath='scenes/earth-land-sea/earth-simulation.json',raw=await readFile(formalPath,'utf8');
const d=decodeSimulationDocument(raw,identity,128),planet=d.terrain.settings.planet,orbit=d.terrain.settings.orbit;
const map=new Map(mesh,t_peaks,config);
map.assignElevation(d.terrain.parameters.elevation,{size:128,constraints:new Float32Array(d.terrain.constraints.values)},new Float32Array(d.terrain.offsets!));
map.assignRainfall(d.terrain.parameters.biomes);map.assignRivers(d.terrain.parameters.rivers,true);
const elevation=new Float32Array(mesh.numRegions+mesh.numTriangles);elevation.set(map.elevation_r);elevation.set(map.elevation_t,mesh.numRegions);
const quads=new Int32Array(mesh.numSolidSides*3);Geometry.setMapGeometry(map,0,quads,new Float32Array(elevation.length*2));
const source={mesh,directions:mesh.xyz_r,elevation,quadElements:quads,drainage:d.terrain.drainage};
const terrain=sampleTerrainGrid(ThermalRuntime.fromSnapshot(d.runtime,planet,orbit).grid,mesh.xyz_r,elevation);
function restore(snapshot:any){const rt=ThermalRuntime.fromSnapshot(snapshot,planet,orbit);rt.attachRestoredTerrain(terrain.landFraction,terrain.landElevation,source);rt.refinedSurface?.validate();return rt;}
function budget(rt:ThermalRuntime){
 const m=rt.model!,w=rt.water!,r=rt.refinedSurface,n=rt.grid.count;
 const stores=['snow','ice','grounded','shelfLand','shelfSea','soil','surface'] as const;
 let mass=sum(w.atmosphereKgM2),latent=2450000*sum(w.atmosphereKgM2),heat=sum(m.temperatureK.map((t,k)=>t*m.capacity[k]));
 if(r){for(let t=0;t<r.partition.parent.length;t++){for(const key of stores)mass+=r[key][t];heat+=r.partition.land[t]*m.config.landHeatCapacity*r.landK[t]+r.partition.sea[t]*m.config.oceanDepthM*4200000*r.seaK[t];latent-=334000*(r.snow[t]+r.ice[t]+r.grounded[t]+r.shelfLand[t]+r.shelfSea[t]);}}
 else {for(let k=0;k<n;k++){mass+=w.snowKgM2[k]+w.seaIceKgM2[k]+w.landIceKgM2[k]+w.shelfLandIceKgM2[k]+w.shelfSeaIceKgM2[k]+w.soilKgM2[k]+w.surfaceKgM2[k];heat+=m.landCapacity[k]*m.landTemperatureK[k]+m.oceanCapacity[k]*m.oceanTemperatureK[k];latent-=334000*(w.snowKgM2[k]+w.seaIceKgM2[k]+w.landIceKgM2[k]+w.shelfLandIceKgM2[k]+w.shelfSeaIceKgM2[k]);}}
 return {waterResidualMm:w.oceanGlobalKgM2+mass/n-w.initialTotalMm,enthalpyResidualJm2:(heat+latent)/n-rt.environment!.initialEnthalpy-m.radiationJm2};
}
function polar(rt:ThermalRuntime,h=.5,threshold=.15){
 const w=rt.water!,out={north:{extentMillionKm2:0,areaMillionKm2:0},south:{extentMillionKm2:0,areaMillionKm2:0}};
 for(let k=0;k<w.grid.count;k++){const wet=1-w.land[k],marine=Math.max(0,wet-w.inlandWaterFraction[k]),c=wet>0?Math.min(1,w.seaIceKgM2[k]/(917*h*wet)):0,area=marine*w.cellAreaM2/1e12,v=k<w.grid.count/2?out.north:out.south;if(c>=threshold)v.extentMillionKm2+=area;v.areaMillionKm2+=c*area;}
 return {proxyThicknessM:h,threshold,seaIceGlobalEquivalentMm:sum(w.seaIceKgM2)/w.grid.count,...out};
}
const base='e3222280a0ceddd597245f3c45d75f75d2def9f5';
const files=['environment.ts','thermal.ts','ocean.ts','sea-ice.ts','terrain-water-view.ts','surface-grid.ts','climate.ts','config.js',formalPath];
const bindings=[];
for(const path of files){const bytes=await readFile(path),before=execFileSync('git',['show',`${base}:${path}`],{maxBuffer:32*1024*1024});bindings.push({path,sha256:sha(bytes),unchangedFromBase:bytes.equals(before)});}
const result:any={generatedAtUtc:new Date().toISOString(),nodeVersion:process.version,base,formalSha256:sha(raw),meshTriangles:mesh.numTriangles,sourceSha256:sha(await readFile(`${folder}/audit.ts`)),bindings,
 notes:['Annual checkpoints are reused actual integrations, restored by current strict loader with authored terrain; no fresh annual or repeated-year run.', 'Sea-ice extent/area are mass-derived coverage proxies (0.5 m equals 100%, extent threshold 15%), not satellite concentration. Confirmed inland water and land excluded; shelf-occupied marine area not independently removed.','Short sequential Node CPU sample: 2 warmup + 5 timed single physical steps from same formal day-zero stock; not foreground browser FPS, GPU time, or a before/after performance comparison.'],checkpoints:[]};
assert(bindings.every(x=>x.unchangedFromBase));
for(const [series,prefix] of [['formal-legacy','build/refinement/before'],['p0-experimental-450','build/earth-moisture-structural/coastal-deposition-v2-450']]){
 for(const day of [0,90,180,270,365]){
  const path=`${prefix}-day${day}.json`,bytes=await readFile(path),doc=decodeSimulationDocument(bytes.toString('utf8'),identity,128),rt=restore(doc.runtime);
  const row:any={series,path,sha256:sha(bytes),actualDay:rt.model!.timeS/86400,stepS:rt.model!.stepS,moistureScheme:rt.waterConfig.moistureScheme??'legacy',airRadiationFraction:rt.config.airRadiationFraction??0,budget:budget(rt),proxy:polar(rt),sensitivity:[.25,.5,1].flatMap(h=>[.1,.15,.3].map(t=>polar(rt,h,t)))};
  if(day===365){const copy=restore(rt.snapshot()),target=rt.model!.timeS+rt.model!.stepS;rt.sync(planet,orbit,target,null);copy.sync(planet,orbit,target,null);assert.deepEqual(rt.snapshot(),copy.snapshot());row.restoreNextStepExact=true;row.nextStepBudget=budget(rt);}
  result.checkpoints.push(row);console.log(JSON.stringify({series,day,proxy:row.proxy,budget:row.budget}));
  (globalThis as any).gc?.();
 }
}
const scene=JSON.parse(await readFile('scenes/earth-land-sea/scene-config.json','utf8')),render=scene.render;
const style={enabled:!!render.fused_rivers,minFlowM3S:render.fused_river_min_flow,widthCoefficient:render.fused_river_width,maxWidthRatio:render.fused_river_max_width};
result.performance={style,records:[]};
const median=(a:number[])=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)];
for(const mode of ['classic','balanced','high']){
 const rt=restore(d.runtime);if(mode!=='classic'){rt.enableRefinement(mode as any);rt.sync(planet,orbit,0,null);}
 const m=rt.model!,advance=m.advanceTo.bind(m);let physicalMs=0;
 m.advanceTo=(...args:Parameters<typeof advance>)=>{const start=performance.now();try{return advance(...args);}finally{physicalMs+=performance.now()-start;}};
 const samples=[];
 for(let i=0;i<7;i++){physicalMs=0;const a=performance.now();rt.sync(planet,orbit,m.timeS+m.stepS,null);const b=performance.now();terrainWaterView(rt,style);const c=performance.now();if(i>1)samples.push({physicalMs,syncMappingMs:b-a-physicalMs,waterGeometryMs:c-b,totalMs:c-a});}
 const snapshot=rt.snapshot(),a=performance.now(),encoded=encodeSimulationDocument({...d,runtime:snapshot,terrain:{...d.terrain,settings:{...d.terrain.settings,timeS:m.timeS}}}),b=performance.now();
 const decoded=decodeSimulationDocument(encoded,identity,128),c=performance.now();assert.deepEqual(decoded.runtime,snapshot);
 const cachedStart=performance.now();terrainWaterView(rt,style);const cachedMs=performance.now()-cachedStart;
 const row={mode,stepS:m.stepS,samples,median:Object.fromEntries(['physicalMs','syncMappingMs','waterGeometryMs','totalMs'].map(key=>[key,median(samples.map(x=>(x as any)[key]))])),encodeMs:b-a,decodeMs:c-b,documentBytes:Buffer.byteLength(encoded),sameTimeCachedWaterGeometryMs:cachedMs,budget:budget(rt)};
 result.performance.records.push(row);console.log(JSON.stringify({performance:row}));(globalThis as any).gc?.();
}
assert.equal(sha(await readFile(formalPath)),result.formalSha256);
await writeFile(`${folder}/audit.json`,JSON.stringify(result,null,2)+'\n');
