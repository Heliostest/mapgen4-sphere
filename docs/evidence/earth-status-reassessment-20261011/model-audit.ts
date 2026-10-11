/** Current-code audit only. Product data and historical evidence are read-only.
 * Run from repository root, bundling to build/reassessment/model-audit.mjs.
 * --static: hash bindings, strict restoration, independent ledgers and probes.
 * --combinations: four same-initial-stock playback-operator tests, 2 days.
 * --performance: isolated short Node CPU samples; never browser FPS.
 */
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
import {sampleTerrainGrid,thermalCell} from '../../../thermal.ts';
import {makeSurfaceGrid,surfaceCell} from '../../../surface-grid.ts';
import {generateClimate} from '../../../climate.ts';
import {deriveOrbit} from '../../../astronomy.ts';
import {terrainWaterView} from '../../../terrain-water-view.ts';
import {channelNetwork} from '../../../river-channels.ts';
import {uvToDirection,directionToUV} from '../../../sphere.ts';
const folder='docs/evidence/earth-status-reassessment-20261011',out='build/reassessment';
await mkdir(out,{recursive:true});
const sha=(a:any)=>createHash('sha256').update(a).digest('hex');
const fileHash=async(path:string)=>sha(await readFile(path));
const lf=(a:Buffer)=>Buffer.from(a.toString('utf8').replace(/\r\n/g,'\n'));
const readJson=async(path:string)=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
const result:any=await readJson(`${folder}/model-audit.json`).catch(()=>({}));
result.generatedAtUtc=new Date().toISOString();result.head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
result.nodeVersion=process.version;result.harnessSha256=await fileHash(process.argv[1]);
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
const sum=(a:Iterable<number>)=>{let s=0,c=0;for(const x of a){const y=x-c,t=s+y;c=(t-s)-y;s=t;}return s;};
function ledger(rt:ThermalRuntime){
 const m=rt.model!,w=rt.water!,r=rt.refinedSurface,n=rt.grid.count;
 const water:number[]=[],air:number[]=[],surface:number[]=[],latent:number[]=[];
 for(let k=0;k<n;k++){water.push(w.atmosphereKgM2[k]);air.push(m.capacity[k]*m.temperatureK[k]);latent.push(2450000*w.atmosphereKgM2[k]);}
 const keys=['snow','ice','grounded','shelfLand','shelfSea','soil','surface'] as const;
 const stores:any={atmosphereMm:sum(w.atmosphereKgM2)/n};
 if(r){const p=r.partition;for(const key of keys)stores[key+'Mm']=sum(r[key])/n;
  for(let t=0;t<p.parent.length;t++){water.push(keys.reduce((s,k)=>s+r[k][t],0));surface.push(p.land[t]*m.config.landHeatCapacity*r.landK[t]+p.sea[t]*m.config.oceanDepthM*4200000*r.seaK[t]);latent.push(-334000*(r.snow[t]+r.ice[t]+r.grounded[t]+r.shelfLand[t]+r.shelfSea[t]));}
 }else {const ws=['snowKgM2','seaIceKgM2','landIceKgM2','shelfLandIceKgM2','shelfSeaIceKgM2','soilKgM2','surfaceKgM2'] as const;for(let j=0;j<keys.length;j++)stores[keys[j]+'Mm']=sum(w[ws[j]])/n;
  for(let k=0;k<n;k++){water.push(ws.reduce((s,a)=>s+w[a][k],0));surface.push(m.landCapacity[k]*m.landTemperatureK[k]+m.oceanCapacity[k]*m.oceanTemperatureK[k]);latent.push(-334000*(w.snowKgM2[k]+w.seaIceKgM2[k]+w.landIceKgM2[k]+w.shelfLandIceKgM2[k]+w.shelfSeaIceKgM2[k]));}
 }
 const totalMm=w.oceanGlobalKgM2+sum(water)/n,sensibleJm2=(sum(air)+sum(surface))/n,enthalpyJm2=sensibleJm2+sum(latent)/n;
 return {storesGlobalMm:stores,oceanGlobalMm:w.oceanGlobalKgM2,totalMm,sensibleJm2,enthalpyJm2,initialWaterMm:w.initialTotalMm,initialEnthalpyJm2:rt.environment!.initialEnthalpy,radiationJm2:m.radiationJm2,waterResidualMm:totalMm-w.initialTotalMm,enthalpyResidualJm2:enthalpyJm2-rt.environment!.initialEnthalpy-m.radiationJm2,note:'Compensated independent summation; uses recorded initial ledgers and net-radiation counter, not independent forcing verification.'};
}
const targets=[['北极海洋',85,0],['南极内陆',-85,0],['南极边缘',-70,20],['格陵兰内陆',72,-40],['格陵兰西岸',68,-50],['亚马孙',-3,-60],['刚果',0,23],['撒哈拉',24,15],['萨赫勒',14,0],['德国',50,10],['西伯利亚',62,100],['印度',22,80],['喜马拉雅山前旧点',28,86],['喜马拉雅山脊控点',28.25,86.85],['青藏',33,88],['安第斯东坡',-12,-70],['安第斯旧crest点',-12,-73],['安第斯西侧',-12,-76],['阿塔卡马沿岸',-24,-70.5],['澳洲内陆',-25,134],['澳洲东岸',-30,152],['澳洲北部',-12,131],['澳洲西南',-32,116],['里海',42,51],['咸海',45,59],['塔里木',40,85],['Lake Eyre',-28.5,137.5]] as const;
const gc=()=>{(globalThis as any).gc?.();};
const distance=(lat:number,lon:number,lat2:number,lon2:number)=>{const a=uvToDirection((lon+180)/360,(90-lat)/180),b=uvToDirection((lon2+180)/360,(90-lat2)/180);return Math.acos(Math.max(-1,Math.min(1,a.reduce((s,v,i)=>s+v*b[i],0))))*planet.radiusM/1000;};
const sg=makeSurfaceGrid();
const spatial=targets.map(([name,lat,lon])=>{const u=(lon+180)/360,v=(90-lat)/180,q=uvToDirection(u,v);let nearest=0,best=-Infinity;
 for(let t=0;t<mesh.numTriangles;t++){const dot=q.reduce((s,x,c)=>s+x*mesh.xyz_t[3*t+c],0);if(dot>best){best=dot;nearest=t;}}
 const uv=directionToUV(mesh.xyz_t.subarray(3*nearest,3*nearest+3)),k=thermalCell({width:48,height:24} as any,u,v),sc=surfaceCell(sg,u,v);
 const parentLat=Math.asin(1-2*(Math.floor(k/48)+.5)/24)*180/Math.PI,parentLon=(k%48+.5)*7.5-180,displayLat=90-180*Math.floor(sc/96)/48,displayLon=(sc%96+.5)*3.75-180,e=elevation[mesh.numRegions+nearest];
 return {name,latitude:lat,longitude:lon,u,v,triangle:nearest,terrainLatitude:90-180*uv[1],terrainLongitude:360*uv[0]-180,terrainHeightM:e>=0?e*planet.reliefM:e*planet.oceanDepthM,queryToTerrainKm:Math.acos(Math.max(-1,Math.min(1,best)))*planet.radiusM/1000,parent:k,parentLatitude:parentLat,parentLongitude:parentLon,queryToParentCenterKm:distance(lat,lon,parentLat,parentLon),displayCell:sc,displayLatitude:displayLat,displayLongitude:displayLon,queryToClassicDisplayCenterKm:distance(lat,lon,displayLat,displayLon)};
});
function points(rt:ThermalRuntime){const w=rt.water!,m=rt.model!,st=rt.surfaceState()!,ss=rt.snapshot().state!;return spatial.map(p=>{const k=p.parent,s=rt.sampleSurface(p.u,p.v)!,local=rt.refinedSurface?.sample(p.u,p.v),water=rt.sampleWater(p.u,p.v)!,idx=p.displayCell,patch=local?rt.refinedSurface!.partition:null;
 const t=p.triangle,route=w.routing!,net=route.network;let minSill=Infinity;for(const edge of net.neighbors[t])minSill=Math.min(minSill,edge.sillM);
 return {...p,parentLandFraction:w.land[k],parentLandMeanHeightM:w.heightM[k],classicReferenceLocalHeightM:ss.localHeight[idx]*planet.reliefM,localState:local?{patch:local.patch,patchLatitude:90-patch!.v[local.patch]*180,patchLongitude:patch!.u[local.patch]*360-180,queryToPatchCenterKm:distance(p.latitude,p.longitude,90-patch!.v[local.patch]*180,patch!.u[local.patch]*360-180),heightM:local.heightM,landFraction:local.landFraction,snowMm:local.snowMm,landIceM:local.landIceKgM2/917,seaIceM:local.iceKgM2/917,soilMm:local.landFraction>0?local.soilMm:null,surfaceWholePatchMm:local.surfaceMm}: {displaySnowMm:st.snowMm?.[idx],displayLandIceM:(st.landIceKgM2?.[idx]??0)/917,displaySeaIceM:(st.iceKgM2?.[idx]??0)/917,displayLandFraction:st.land[idx]},reference:{annualRainMm:s.annualRainMm,annualTemperatureC:s.meanTemperatureK-273.15,warmestMonthTemperatureC:s.warmestTemperatureK-273.15,note:'Stored 96x49 reference; legacy analytic mixed/air estimate, not observed climate or integrated annual rainfall.'},instant:{parentAirC:m.temperatureK[k]-273.15,parentLandC:w.land[k]>0?m.landTemperatureK[k]-273.15:null,parentOceanC:w.land[k]<1?m.oceanTemperatureK[k]-273.15:null,localAirC:s.localTemperatureK-273.15,visibleSurfaceC:s.surfaceTemperatureK-273.15,landSurfaceC:local?local.landK-273.15:null,seaSurfaceC:local?local.seaK-273.15:null,biome:s.biome,vegetationFraction:s.vegetationFraction,seaIceFraction:s.seaIceFraction,localLandIceM:s.landIceM,shelfIceM:s.shelfIceM,...water,...rt.sampleWind(p.u,p.v)},parentStores:{atmosphereWholeCellMm:w.atmosphereKgM2[k],soilPerLandMm:w.land[k]>0?w.soilKgM2[k]/w.land[k]:null,snowPerLandMm:w.land[k]>0?w.snowKgM2[k]/w.land[k]:null,groundedPerLandM:w.land[k]>0?w.landIceKgM2[k]/(917*w.land[k]):null,seaIcePerSeaM:w.land[k]<1?w.seaIceKgM2[k]/(917*(1-w.land[k])):null,surfaceWholeCellMm:w.surfaceKgM2[k]},terrainWater:{inlandLakeId:net.inlandLakeId?.[t]??0,endorheicGroup:net.endorheic?.[t]??0,bedM:net.bedM[t],volumeM3:route.volumeM3[t],headM:route.headM[t],minimumAdjacentSillM:Number.isFinite(minSill)?minSill:null,actualFlowM3S:route.fluxM3S[t]}};});}
function polar(rt:ThermalRuntime){const w=rt.water!;const out:any={north:{extentKm2:0,marineExtentKm2:0,seaIceGlobalEquivalentMm:0,capMarineExtentKm2:0},south:{extentKm2:0,marineExtentKm2:0,seaIceGlobalEquivalentMm:0,capMarineExtentKm2:0}};for(let k=0;k<w.grid.count;k++){const north=k<w.grid.count/2,h=north?out.north:out.south,f=1-w.land[k],marine=Math.max(0,f-w.inlandWaterFraction[k]),fraction=f>0?Math.min(1,w.seaIceKgM2[k]/(917*.5*f)):0,j=Math.floor(k/w.grid.width),top=1-2*j/w.grid.height,bottom=1-2*(j+1)/w.grid.height,capOverlap=north?Math.max(0,top-Math.max(bottom,Math.sin(Math.PI/3))):Math.max(0,Math.min(top,Math.sin(-50*Math.PI/180))-bottom);if(fraction>=.15){h.extentKm2+=f*w.cellAreaM2/1e6;h.marineExtentKm2+=marine*w.cellAreaM2/1e6;h.capMarineExtentKm2+=marine*w.cellAreaM2/1e6*capOverlap/(top-bottom);}h.seaIceGlobalEquivalentMm+=w.seaIceKgM2[k]/w.grid.count;}return {threshold:'concentration>=15%; 0.5m inventory corresponds to full concentration; extent fields cover a whole hemisphere; capMarineExtent is >=60N or <=50S, matching historical report regions and excluding confirmed inland lake carrier',...out};}
function lakes(rt:ThermalRuntime){const route=rt.water!.routing!,net=route.network,ids=new Set(Array.from(net.inlandLakeId??[]).filter(x=>x>0));return Array.from(ids).map(id=>{const ts=Array.from(net.cell.keys()).filter(t=>net.inlandLakeId![t]===id);return {id,triangles:ts.length,areaKm2:sum(ts.map(t=>net.areaM2[t]))/1e6,volumeM3:sum(ts.map(t=>route.volumeM3[t])),activeFlowTriangles:ts.filter(t=>route.fluxM3S[t]>0).length,outsideFlowM3S:sum(ts.filter(t=>route.receiverSide[t]>=0&&net.inlandLakeId![mesh.t_outer_s(route.receiverSide[t])]!==id).map(t=>route.fluxM3S[t])),maxDepthM:Math.max(...ts.map(t=>route.volumeM3[t]/net.areaM2[t]))};});}
async function strictNext(rt:ThermalRuntime){const restored=restore(rt.snapshot());assert.deepEqual(restored.snapshot(),rt.snapshot());const next=rt.model!.timeS+rt.model!.stepS;rt.sync(planet,orbit,next,null);restored.sync(planet,orbit,next,null);assert.deepEqual(restored.snapshot(),rt.snapshot());return {strictSourceRestore:true,snapshotExact:true,nextStepExact:true};}
function consistency(rt:ThermalRuntime){const r=rt.refinedSurface,w=rt.water!;if(!r)return {coarseFineInventoryMismatchKgPerParentM2:0,acceptedStepS:rt.model!.stepS,waterMaxStepS:w.maxStepS,refinedMaxStepS:null};let mismatch=0;for(let k=0;k<rt.grid.count;k++)for(const [fine,coarse] of [['snow','snowKgM2'],['ice','seaIceKgM2'],['grounded','landIceKgM2'],['shelfLand','shelfLandIceKgM2'],['shelfSea','shelfSeaIceKgM2'],['soil','soilKgM2'],['surface','surfaceKgM2']])mismatch=Math.max(mismatch,Math.abs(sum((r as any)[fine].slice(r.partition.offset[k],r.partition.offset[k+1]))-(w as any)[coarse][k]));return {coarseFineInventoryMismatchKgPerParentM2:mismatch,acceptedStepS:rt.model!.stepS,waterMaxStepS:w.maxStepS,refinedMaxStepS:r.maxStepS};}
function checkpointRecord(rt:ThermalRuntime):any{return {actualDay:rt.model!.timeS/86400,steps:rt.model!.steps,stepS:rt.model!.stepS,consistency:consistency(rt),mode:rt.refinement??'classic',moistureScheme:rt.waterConfig.moistureScheme??'legacy',airRadiationFraction:rt.config.airRadiationFraction??0,patches:rt.refinedSurface?.partition.parent.length??rt.grid.count,displaySize:[rt.surfaceState()!.texture.width,rt.surfaceState()!.texture.height],budget:ledger(rt),modelWaterBudget:rt.water!.diagnostics(),modelEnergyBudget:rt.environment!.diagnostics(),routeBudget:rt.water!.routing!.diagnostics(rt.water!),polar:polar(rt),lakes:lakes(rt),points:points(rt)};}
if(process.argv.includes('--augment-combinations')){
 for(const c of result.playbackOperatorTest.records)for(const record of c.records){const bytes=await readFile(record.path);assert.equal(sha(bytes),record.sha256);const doc=decodeSimulationDocument(bytes.toString('utf8'),identity,128),rt=restore(doc.runtime);record.consistency=consistency(rt);record.polar=polar(rt);gc();}
}
if(process.argv.includes('--browser')){
 const browserPath=`${out}/browser-saved.json`,bytes=await readFile(browserPath),doc=decodeSimulationDocument(bytes.toString('utf8'),identity,128),rt=restore(doc.runtime);
 result.newBrowserSave={path:browserPath,sha256:sha(bytes),bytes:bytes.length,...checkpointRecord(rt),strictRestore:await strictNext(rt)};
 const restoredDoc=decodeSimulationDocument(await readFile(`${out}/browser-restored.json`,'utf8'),identity,128);assert.deepEqual(restoredDoc.runtime,doc.runtime);assert.deepEqual(restoredDoc.terrain,doc.terrain);assert.deepEqual(restoredDoc.view,doc.view);result.newBrowserSave.browserRestoredFileExact=true;gc();
}
if(process.argv.includes('--static')){
 const manifestPath='docs/evidence/earth-climate-refinement-20261011/manifest.json',manifest=await readJson(manifestPath);
 const bind=async(f:any)=>{const bytes=await readFile(f.path);return {path:f.path,currentSha256:sha(bytes),manifestSha256:f.sha256,rawMatch:sha(bytes)===f.sha256,normalizedMatch:sha(lf(bytes))===(f.repositoryLfSha256??f.sha256)};};
 result.bindings={manifestSha256:await fileHash(manifestPath),primary:await Promise.all(manifest.primaryFiles.map(bind)),reviewed:await Promise.all([...manifest.reviewedFiles,...manifest.otherProductFiles].map(bind)),bundles:await Promise.all(manifest.runtimeBundles.map(bind)),currentCompiledRestoreSha256:await fileHash('build/refinement/model-audit-compat.mjs'),oldRestoreSha256:await fileHash('build/refinement/restore-audit.mjs'),formalInputSha256:sha(raw),baselineInputSha256:await fileHash('build/refinement/baseline.json')};
 const moistureBase='fdf4b6bd95d578d481ef8152c2b03b064225c68c';result.moistureHistoryApplicability={baseline:moistureBase,unchangedClosureFiles:await Promise.all(['reference-moisture.ts','climate.ts','circulation.ts'].map(async path=>{const current=await readFile(path),old=execFileSync('git',['show',`${moistureBase}:${path}`],{maxBuffer:10*1024*1024});return {path,currentLfSha256:sha(lf(current)),historicLfSha256:sha(lf(old)),exactLfMatch:sha(lf(current))===sha(lf(old))};})),waterAndRuntimeChangedSinceHistoricalRun:true,reason:'Finite inland-lake evaporation/precipitation and optional refined-surface hooks were added later. Historic transport failure remains evidence about unmodified closure and initialization, but its annual regional values are not new current-formal-snapshot integrations.'};
 assert(result.bindings.primary.every((a:any)=>a.normalizedMatch));assert(result.bindings.reviewed.every((a:any)=>a.normalizedMatch));assert.equal(result.bindings.currentCompiledRestoreSha256,result.bindings.oldRestoreSha256);
 assert.deepEqual(d.runtime,decodeSimulationDocument(await readFile('build/refinement/baseline.json','utf8'),identity,128).runtime);
 result.formalDefaults={view:d.view,terrainSettings:d.terrain.settings,runtimeConfig:d.runtime.config,waterConfig:d.runtime.waterConfig,environmentConfig:d.runtime.environmentConfig,refinement:d.runtime.refinement??'classic',render:await readJson('scenes/earth-land-sea/scene-config.json'),sceneBytes:Buffer.byteLength(raw),initialRuntimeMatchesRefinementBaseline:true};
 const rt=restore(d.runtime);result.formal=checkpointRecord(rt);result.formal.strictRestore=await strictNext(rt);gc();
 result.resolution={terrainTriangles:mesh.numTriangles,terrainRegions:mesh.numRegions,nominalTriangleAreaKm2:4*Math.PI*planet.radiusM**2/mesh.numTriangles/1e6,equivalentTriangleSideKm:Math.sqrt(4*(4*Math.PI*planet.radiusM**2/mesh.numTriangles)/Math.sqrt(3))/1000,climateCells:1152,parentLongitudeDegrees:7.5,parentEqualAreaKm2:4*Math.PI*planet.radiusM**2/1152/1e6,parentEquatorialBandHeightKm:2*planet.radiusM*Math.asin(1/24)/1000,classicDisplay:[96,49],classicDisplayAngularDegrees:3.75,sourceElevationSpacingDegrees:.1,probes:spatial,note:'Spatial distances are great-circle query-to-center differences; serialization error is a separate quantity.'};
 result.reusedCheckpoints=[];
 for(const f of manifest.checkpoints){const bytes=await readFile(f.path);assert.equal(sha(bytes),f.sha256);const doc=decodeSimulationDocument(bytes.toString('utf8'),identity,128),rt=restore(doc.runtime);const record=checkpointRecord(rt);record.strictRestore=await strictNext(rt);result.reusedCheckpoints.push({path:f.path,sha256:sha(bytes),manifestMatch:true,bytes:bytes.length,...record});console.log(JSON.stringify({stage:'restore',path:f.path,day:record.actualDay,water:record.budget.waterResidualMm,enthalpy:record.budget.enthalpyResidualJm2}));gc();}
 const formal=restore(d.runtime),s=formal.snapshot().state!,year=deriveOrbit(planet,orbit).yearS;
 result.formalMonthlyReference=Array.from({length:12},(_,month)=>{const c=generateClimate(sg,planet,{...orbit,orbitPhaseRad:0,spinPhaseRad:0},formal.config,formal.waterConfig,s.localLand,s.localHeight.map(h=>h*planet.reliefM),(month+.5)*year/12,formal.environmentConfig);return {bin:month,phaseMidDegrees:(month+.5)*30,interpretation:'Analytic reference at seasonal midpoint, bin0 begins vernal equinox; not continuous evolution or Gregorian month',points:spatial.map(p=>({name:p.name,referenceTemperatureC:c.temperatureK[p.displayCell]-273.15,rainMmDay:c.rainMmDay[p.displayCell],soilFraction:c.soilFraction[p.displayCell]}))};});
 const c=channelNetwork(mesh,formal.water!.routing!.network);result.closedDrainage=spatial.filter(p=>['里海','咸海','塔里木','Lake Eyre','亚马孙','刚果'].includes(p.name)).map(p=>{let root=p.triangle,length=0;while(c.receiverSide[root]>=0){root=mesh.t_outer_s(c.receiverSide[root]);assert(++length<mesh.numTriangles);}return {name:p.name,triangle:p.triangle,root,length,oceanRoot:formal.water!.routing!.network.cell[root]<0,rootBedM:formal.water!.routing!.network.bedM[root]};});
 const changed=structuredClone(d.runtime) as any;changed.state.thermal.albedo[0]+=.001;let rejected=false;try{restore(changed);}catch{rejected=true;}assert(rejected);result.albedo={roundoffTolerance:8*Number.EPSILON,point001PerturbationRejected:rejected,source:'thermal-runtime.ts fromSnapshot; budget/source checks run separately and unchanged'};
}
if(process.argv.includes('--combinations')){
 const days=2;result.playbackOperatorTest={nominalDays:days,formalInputSha256:sha(raw),note:'Controlled same-stock playback-operator experiment. Transport switch includes airRadiationFraction=.5 as normal UI does; snapshot restored by current strict public loaders, with original initial climate/vegetation/three temperatures/stores/circulation preserved. It deliberately does not exercise UI reinitialization or prove experimental reference climate. No private key mutation and no forced seasonal seek.',records:[]};
 for(const mode of ['classic','balanced'])for(const moisture of ['off','on']){
  const changed=structuredClone(d.runtime) as any;if(moisture==='on'){changed.waterConfig.moistureScheme='transport';changed.config.airRadiationFraction=.5;}
  const rt=restore(changed);assert.deepEqual(rt.snapshot().state,restore(d.runtime).snapshot().state);
  const initial=ledger(rt);if(mode==='balanced'){rt.enableRefinement('balanced');rt.sync(planet,orbit,0,null);}const migrated=ledger(rt);assert(Math.abs(migrated.totalMm-initial.totalMm)<1e-6);assert(Math.abs(migrated.enthalpyJm2-initial.enthalpyJm2)<.001);
  const rain=new Float64Array(rt.grid.count),evap=new Float64Array(rt.grid.count),records=[];
  for(const day of [0,days]){while(rt.model!.timeS<day*86400-rt.model!.stepS/2){rt.sync(planet,orbit,rt.model!.timeS+rt.model!.stepS,null);for(let k=0;k<rt.grid.count;k++){rain[k]+=rt.water!.precipitationKgM2S[k]*rt.model!.stepS;evap[k]+=rt.water!.evaporationKgM2S[k]*rt.model!.stepS;}}
   const record=checkpointRecord(rt),encoded=encodeSimulationDocument({...d,runtime:rt.snapshot(),terrain:{...d.terrain,settings:{...d.terrain.settings,timeS:rt.model!.timeS}}}),path=`${out}/${mode}-${moisture}-day${day}.json`;decodeSimulationDocument(encoded,identity,128);await writeFile(path,encoded);records.push({path,sha256:sha(encoded),bytes:Buffer.byteLength(encoded),...record,cumulativeParentRainMm:spatial.map(p=>({name:p.name,cell:p.parent,rainMm:rain[p.parent],evapMm:evap[p.parent]}))});console.log(JSON.stringify({stage:'combo',mode,moisture,day:record.actualDay,water:record.budget.waterResidualMm}));
  }
  const nextCheck=await strictNext(rt);result.playbackOperatorTest.records.push({mode,moisture,initialStockStateExact:true,migration:{deltaWaterMm:migrated.totalMm-initial.totalMm,deltaEnthalpyJm2:migrated.enthalpyJm2-initial.enthalpyJm2},nextCheck,records});gc();
 }
}
if(process.argv.includes('--performance')){
 const render=(await readJson('scenes/earth-land-sea/scene-config.json')).render,style={enabled:!!render.fused_rivers,minFlowM3S:render.fused_river_min_flow,widthCoefficient:render.fused_river_width,maxWidthRatio:render.fused_river_max_width};
 result.nodePerformance={note:'Sequential isolated process; current-code sync includes mapping, terrainWaterView separately with formal channel display settings. 2 warmup + 5 timed 1800s physical steps. CPU duration and listed typed-array bytes only, not browser FPS, total RAM or long-run performance.',displayStyle:style,records:[]};
 for(const mode of ['classic','balanced','high']){const rt=restore(d.runtime);if(mode!=='classic'){rt.enableRefinement(mode as any);rt.sync(planet,orbit,0,null);}const samples=[];for(let i=0;i<7;i++){const a=performance.now();rt.sync(planet,orbit,rt.model!.timeS+rt.model!.stepS,null);const b=performance.now();terrainWaterView(rt,style);const c=performance.now();if(i>1)samples.push({syncAndMappingMs:b-a,waterGeometryMs:c-b,totalMs:c-a});}
  const r=rt.refinedSurface,bytes=r?(Object.values(r.checkpoint()).filter(ArrayBuffer.isView) as Float64Array[]).reduce((s,a)=>s+a.byteLength,0)+Object.values(r.partition).reduce((s,a)=>s+(ArrayBuffer.isView(a)?a.byteLength:0),0):0,encoded=encodeSimulationDocument({...d,runtime:rt.snapshot(),terrain:{...d.terrain,settings:{...d.terrain.settings,timeS:rt.model!.timeS}}});const median=(k:string)=>samples.map(a=>(a as any)[k]).sort((a,b)=>a-b)[2];
  result.nodePerformance.records.push({mode,patches:r?.partition.parent.length??1152,stepS:rt.model!.stepS,samples,medianSyncAndMappingMs:median('syncAndMappingMs'),medianWaterGeometryMs:median('waterGeometryMs'),medianTotalMs:median('totalMs'),refinedStateAndTopologyBytes:bytes,saveBytes:Buffer.byteLength(encoded),display:[rt.surfaceState()!.texture.width,rt.surfaceState()!.texture.height],processMemory:process.memoryUsage()});gc();}
}
await writeFile(`${folder}/model-audit.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({output:`${folder}/model-audit.json`,stages:process.argv.slice(2)}));
