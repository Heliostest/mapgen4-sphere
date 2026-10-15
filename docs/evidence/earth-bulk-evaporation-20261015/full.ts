/** Full terrain integration and restart check; this is not climate calibration. */
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
import {ThermalRuntime} from '../../../thermal-runtime.ts';

const out='build/earth-bulk-evaporation',label=process.env.PARAM_PROFILE??'bulk',days=30,start=performance.now();
assert(['control','bulk'].includes(label));
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
config.spacing=HIGH_DETAIL_SPACING;const {mesh,t_peaks}=await makeMesh();
const raw=await readFile('scenes/earth-land-sea/earth-simulation.json','utf8');
const d=decodeSimulationDocument(raw,meshIdentity(mesh,config),128),p=d.terrain.settings.planet,o=d.terrain.settings.orbit;
const map=new Map(mesh,t_peaks,config);
map.assignElevation(d.terrain.parameters.elevation,{size:128,constraints:new Float32Array(d.terrain.constraints.values)},new Float32Array(d.terrain.offsets!));
map.assignRainfall(d.terrain.parameters.biomes);map.assignRivers(d.terrain.parameters.rivers,true);
const elevation=new Float32Array(mesh.numRegions+mesh.numTriangles);elevation.set(map.elevation_r);elevation.set(map.elevation_t,mesh.numRegions);
const quads=new Int32Array(mesh.numSolidSides*3);Geometry.setMapGeometry(map,0,quads,new Float32Array(elevation.length*2));
const source={mesh,directions:mesh.xyz_r,elevation,quadElements:quads,drainage:d.terrain.drainage};
const rt=ThermalRuntime.fromSnapshot(d.runtime,p,o),terrain=sampleTerrainGrid(rt.grid,mesh.xyz_r,elevation);
rt.attachRestoredTerrain(terrain.landFraction,terrain.landElevation,source);
const initialStockSha=sha(JSON.stringify(rt.snapshot().state));
if(label==='bulk')rt.configureSurfacePhysics({oceanEvaporationCoefficient:.0012});
assert.equal(sha(JSON.stringify(rt.snapshot().state)),initialStockSha);
const m=rt.model!,w=rt.water!,e=rt.environment!,records:any[]=[];
await mkdir(out,{recursive:true});
for(const day of [0,10,days]) {
    const end=Math.ceil(day*86400/m.stepS);while(m.steps<end)rt.sync(p,o,Math.min(end,m.steps+32)*m.stepS+.001,null);
    const budget={waterMm:w.diagnostics().residualMm,heatJm2:e.enthalpy()-e.initialEnthalpy-m.radiationJm2,routingM3:w.routing!.diagnostics(w).partitionResidualM3};
    assert(Math.abs(budget.waterMm)<5e-6&&Math.abs(budget.heatJm2)<.005&&Math.abs(budget.routingM3)<1);
    const state=rt.snapshot();
    records.push({day:m.timeS/86400,seconds:(performance.now()-start)/1000,budget});console.log(JSON.stringify({label,...records.at(-1)}));
    await writeFile(`${out}/full-${label}-day${day}.json`,encodeSimulationDocument({...d,runtime:state,terrain:{...d.terrain,settings:{...d.terrain.settings,timeS:state.state!.lastTarget}}}));
}
const restored=ThermalRuntime.fromSnapshot(rt.snapshot(),p,o);restored.attachRestoredTerrain(terrain.landFraction,terrain.landElevation,source);
const next=m.timeS+m.stepS;rt.sync(p,o,next,null);restored.sync(p,o,next,null);assert.deepEqual(restored.snapshot(),rt.snapshot());
await writeFile(`${out}/full-${label}.json`,JSON.stringify({label,days,meshTriangles:mesh.numTriangles,initialStockSha,inputSha256:sha(raw),bundleSha256:sha(await readFile(process.argv[1],'utf8')),strictContinuation:true,records},null,2)+'\n');
