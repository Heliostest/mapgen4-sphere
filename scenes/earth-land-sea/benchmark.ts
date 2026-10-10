// Opt-in CPU probe for this exact saved scene. This does not measure GPU FPS.
import {readFile,writeFile} from 'node:fs/promises';
import {makeMesh} from '../../mesh.ts';
import config,{HIGH_DETAIL_SPACING} from '../../config.js';
import Map from '../../map.ts';
import Geometry from '../../geometry.ts';
import {meshIdentity} from '../../terrain-document.ts';
import {decodeSimulationDocument} from '../../simulation-document.ts';
import {ThermalRuntime} from '../../thermal-runtime.ts';
import {sampleTerrainGrid} from '../../thermal.ts';
import {terrainWaterView} from '../../terrain-water-view.ts';

const folder='scenes/earth-land-sea';
config.spacing=HIGH_DETAIL_SPACING;
const start=performance.now(),{mesh,t_peaks}=await makeMesh(),meshMs=performance.now()-start;
const doc=decodeSimulationDocument(await readFile(`${folder}/earth-simulation.json`,'utf8'),meshIdentity(mesh,config),128);
const map=new Map(mesh,t_peaks,config);
map.assignElevation(doc.terrain.parameters.elevation,{size:128,constraints:new Float32Array(doc.terrain.constraints.values)},new Float32Array(doc.terrain.offsets!));
const indices=new Int32Array(3*mesh.numSolidSides),em=new Float32Array(2*(mesh.numRegions+mesh.numTriangles));
Geometry.setMapGeometry(map,0,indices,em);
const elevation=new Float32Array(mesh.numRegions+mesh.numTriangles);elevation.set(map.elevation_r);elevation.set(map.elevation_t,mesh.numRegions);
const rt=ThermalRuntime.fromSnapshot(doc.runtime,doc.terrain.settings.planet,doc.terrain.settings.orbit);
const sample=sampleTerrainGrid(rt.grid,mesh.xyz_r,elevation);
rt.attachRestoredTerrain(sample.landFraction,sample.landElevation,{mesh,directions:mesh.xyz_r,elevation,quadElements:indices});
const samples:{simulationMs:number;waterGeometryMs:number}[]=[];
for(let i=0;i<7;i++) {
    const a=performance.now();rt.sync(doc.terrain.settings.planet,doc.terrain.settings.orbit,rt.model!.timeS+rt.model!.stepS,null);
    const b=performance.now();terrainWaterView(rt);const c=performance.now();
    if(i>1)samples.push({simulationMs:b-a,waterGeometryMs:c-b});
}
const median=(key:keyof typeof samples[number])=>samples.map(s=>s[key]).sort((a,b)=>a-b)[2];
const result={triangles:mesh.numTriangles,meshMs,measuredSamples:5,stepPhysicalMinutes:rt.model!.stepS/60,
    medianSimulationMs:median('simulationMs'),medianWaterGeometryMs:median('waterGeometryMs'),samples,
    waterResidualMm:rt.water!.diagnostics().residualMm,note:'Node CPU timings on this machine, after two warmup steps; not browser frame rate. Climate keeps its existing 1152 cells.'};
if(Math.abs(result.waterResidualMm)>1e-7)throw new Error('Water budget drift');
await writeFile(`${folder}/performance.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
