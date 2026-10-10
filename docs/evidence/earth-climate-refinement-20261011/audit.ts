import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {makeMesh} from '../../../mesh.ts';
import config,{HIGH_DETAIL_SPACING} from '../../../config.js';
import Map from '../../../map.ts';
import Geometry from '../../../geometry.ts';
import {decodeSimulationDocument,encodeSimulationDocument} from '../../../simulation-document.ts';
import {meshIdentity} from '../../../terrain-document.ts';
import {ThermalRuntime} from '../../../thermal-runtime.ts';
import {sampleTerrainGrid,thermalCell} from '../../../thermal.ts';
import {terrainWaterView} from '../../../terrain-water-view.ts';
import {FUSION_J_KG as LF,VAPORIZATION_J_KG as LV} from '../../../water.ts';
const folder='docs/evidence/earth-climate-refinement-20261011';
await mkdir('build/refinement',{recursive:true});config.spacing=HIGH_DETAIL_SPACING;
const {mesh,t_peaks}=await makeMesh(),identity=meshIdentity(mesh,config);
const d=decodeSimulationDocument(await readFile('build/refinement/baseline.json','utf8'),identity,128);
const map=new Map(mesh,t_peaks,config);map.assignElevation(d.terrain.parameters.elevation,{size:128,constraints:new Float32Array(d.terrain.constraints.values)},new Float32Array(d.terrain.offsets!));map.assignRainfall(d.terrain.parameters.biomes);map.assignRivers(d.terrain.parameters.rivers,true);
const elevation=new Float32Array(mesh.numRegions+mesh.numTriangles);elevation.set(map.elevation_r);elevation.set(map.elevation_t,mesh.numRegions);
const quads=new Int32Array(mesh.numSolidSides*3);Geometry.setMapGeometry(map,0,quads,new Float32Array(elevation.length*2));
const source={mesh,directions:mesh.xyz_r,elevation,quadElements:quads,drainage:d.terrain.drainage},planet=d.terrain.settings.planet,orbit=d.terrain.settings.orbit;
const targets=[['Himalaya foothill',28,86],['Himalaya ridge',28.25,86.85],['Ganges',27,86],['Tibet',30,86.85],['Andes east',-12,-70],['Andes crest',-12,-73],['Andes west',-12,-76],['Atacama coast',-24,-70.5],['Atacama highland',-24,-68],['Australia coast',-30,153],['Australia slope',-30,151],['Australia inland',-30,147],['Greenland edge',68,-50],['Greenland interior',72,-40],['Antarctica edge',-70,20],['Antarctica interior',-85,0],['Arctic coast',70,-150]] as const;
function independent(rt:ThermalRuntime) {
    const m=rt.model!,w=rt.water!,r=rt.refinedSurface;let mass=w.oceanGlobalKgM2,energy=0;
    for(let k=0;k<rt.grid.count;k++){mass+=w.atmosphereKgM2[k]/rt.grid.count;energy+=(m.capacity[k]*m.temperatureK[k]+LV*w.atmosphereKgM2[k])/rt.grid.count;}
    if(r){const p=r.partition;for(let t=0;t<p.parent.length;t++){mass+=(r.snow[t]+r.ice[t]+r.grounded[t]+r.shelfLand[t]+r.shelfSea[t]+r.soil[t]+r.surface[t])/rt.grid.count;energy+=(p.land[t]*m.config.landHeatCapacity*r.landK[t]+p.sea[t]*m.config.oceanDepthM*4.2e6*r.seaK[t]-LF*(r.snow[t]+r.ice[t]+r.grounded[t]+r.shelfLand[t]+r.shelfSea[t]))/rt.grid.count;}}
    else for(let k=0;k<rt.grid.count;k++){mass+=(w.soilKgM2[k]+w.surfaceKgM2[k]+w.snowKgM2[k]+w.seaIceKgM2[k]+w.landIceKgM2[k]+w.shelfLandIceKgM2[k]+w.shelfSeaIceKgM2[k])/rt.grid.count;energy+=(m.landCapacity[k]*m.landTemperatureK[k]+m.oceanCapacity[k]*m.oceanTemperatureK[k]-LF*(w.snowKgM2[k]+w.seaIceKgM2[k]+w.landIceKgM2[k]+w.shelfLandIceKgM2[k]+w.shelfSeaIceKgM2[k]))/rt.grid.count;}
    return {mass,energy,waterResidualMm:mass-w.initialTotalMm,enthalpyResidualJm2:energy-rt.environment!.initialEnthalpy-m.radiationJm2};
}
const modes=process.argv.includes('--quick')?['before','balanced','high']:process.argv.includes('--before')?['before']:process.argv.includes('--high')?['high']:['balanced'];
for(const mode of modes) {
    const rt=ThermalRuntime.fromSnapshot(d.runtime,planet,orbit),sample=sampleTerrainGrid(rt.grid,mesh.xyz_r,elevation);rt.attachRestoredTerrain(sample.landFraction,sample.landElevation,source);
    const initial=independent(rt),start=performance.now();if(mode!=='before')rt.enableRefinement(mode as 'high'|'balanced');rt.sync(planet,orbit,0,null);const setupMs=performance.now()-start;
    const migration=independent(rt);assert(Math.abs(migration.mass-initial.mass)<1e-6);assert(Math.abs(migration.energy-initial.energy)<.001);
    const p=rt.refinedSurface?.partition;console.log('partition',mode,p?{count:p.parent.length,zero:Array.from(p.land).map((l,i)=>l+p.sea[i]).filter(a=>a===0).length,albedo:Array.from(rt.model!.albedo).filter(a=>!Number.isFinite(a)).length}:null);
    const points=()=>targets.map(([name,lat,lon])=>{const u=(lon+180)/360,v=(90-lat)/180,s=rt.sampleSurface(u,v)!,water=rt.sampleWater(u,v)!,k=thermalCell(rt.grid,u,v);return {name,lat,lon,parent:k,parentLand:rt.water!.land[k],parentHeightM:rt.water!.heightM[k],...rt.refinedSurface?.sample(u,v),airC:s.localTemperatureK-273.15,surfaceC:s.surfaceTemperatureK-273.15,landIceM:s.landIceM,snowFraction:s.snowFraction,...water};});
    const samples=[];for(let i=0;i<7;i++){const a=performance.now();rt.sync(planet,orbit,rt.model!.timeS+rt.model!.stepS,null);const b=performance.now();terrainWaterView(rt);const c=performance.now();if(i>1)samples.push({simulationAndMappingMs:b-a,waterGeometryMs:c-b});}
    const measurements={mode,triangles:mesh.numTriangles,coarseCells:rt.grid.count,patches:p?.parent.length??rt.grid.count,levelCounts:p?Array.from(p.level).reduce((a,q)=>(a[q]=(a[q]??0)+1,a),{} as Record<number,number>):null,stepS:rt.model!.stepS,setupMs,samples,note:'Node CPU, 2 warmup +5 timed actual sync steps; not browser FPS'};
    await writeFile(`${folder}/${mode}-performance.json`,JSON.stringify(measurements,null,2));
    // Return to the identical day0 checkpoint after timing; never pretend that
    // warmup steps are part of the initial-state comparison.
    const clean=ThermalRuntime.fromSnapshot(d.runtime,planet,orbit);clean.attachRestoredTerrain(sample.landFraction,sample.landElevation,source);if(mode!=='before')clean.enableRefinement(mode as 'high'|'balanced');clean.sync(planet,orbit,0,null);
    const records=[];const days=process.argv.includes('--quick')?[0]:process.argv.includes('--24')?[0,24]:[0,24,90,180,270,365];
    for(const day of days) {
        const a=performance.now();while(clean.model!.timeS<day*86400-clean.model!.stepS/2){const now=clean.model!.timeS;clean.sync(planet,orbit,Math.min(day*86400,now+clean.maxAdvanceS),now);}
        const w=clean.water!,m=clean.model!,r=clean.refinedSurface;const budget=independent(clean);r?.validate();assert(Math.abs(budget.waterResidualMm)<1e-6);assert(Math.abs(budget.enthalpyResidualJm2)<.003);
        const snapshot=clean.snapshot(),saved={...d,runtime:snapshot,terrain:{...d.terrain,settings:{...d.terrain.settings,timeS:m.timeS}}};const encoded=encodeSimulationDocument(saved);decodeSimulationDocument(encoded,identity,128);
        await writeFile(`build/refinement/${mode}-day${day}.json`,encoded);
        const pointData=targets.map(([name,lat,lon])=>{const u=(lon+180)/360,v=(90-lat)/180,s=clean.sampleSurface(u,v)!,water=clean.sampleWater(u,v)!,k=thermalCell(clean.grid,u,v);return {name,lat,lon,parent:k,parentLand:w.land[k],parentHeightM:w.heightM[k],...r?.sample(u,v),airC:s.localTemperatureK-273.15,surfaceC:s.surfaceTemperatureK-273.15,landIceM:s.landIceM,snowFraction:s.snowFraction,...water};});
        const record={day:m.timeS/86400,steps:m.steps,integrationWallMs:performance.now()-a,budget,modelBudget:w.diagnostics(),energy:clean.environment!.diagnostics(),partition:w.routing!.diagnostics(w),saveBytes:Buffer.byteLength(encoded),arrayBytes:r?(Object.values(r.checkpoint()).filter(a=>ArrayBuffer.isView(a)) as Float64Array[]).reduce((s,a)=>s+a.byteLength,0):0,points:pointData,strictRestore:true};records.push(record);
        console.log(JSON.stringify({mode,day:record.day,steps:record.steps,budget:record.budget,saveBytes:record.saveBytes}));
        await writeFile(`${folder}/${mode}${process.argv.includes('--quick')?'-quick':''}-continuous.json`,JSON.stringify({measurements,migration:{initial,migration},records},null,2));
    }
}
