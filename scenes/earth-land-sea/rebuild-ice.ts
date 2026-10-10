import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {makeMesh} from '../../mesh.ts';
import config,{HIGH_DETAIL_SPACING} from '../../config.js';
import Map from '../../map.ts';
import Geometry from '../../geometry.ts';
import {meshIdentity} from '../../terrain-document.ts';
import {decodeSimulationDocument,encodeSimulationDocument} from '../../simulation-document.ts';
import {ThermalRuntime} from '../../thermal-runtime.ts';
import {sampleTerrainGrid,makeThermalGrid} from '../../thermal.ts';
import {decodeIceInventory} from '../../ice-inventory.ts';

const folder='scenes/earth-land-sea';
await mkdir('build/earth-ice-inventory',{recursive:true});
config.spacing=HIGH_DETAIL_SPACING;
const {mesh,t_peaks}=await makeMesh(),identity=meshIdentity(mesh,config);
// Use the frozen pre-change document on repeat builds so the input never
// silently switches from the baseline to an already changed initialization.
const source=await readFile('build/earth-ice-inventory/before-day0.json','utf8');
const d=decodeSimulationDocument(source,identity,128);
const map=new Map(mesh,t_peaks,config);
map.assignElevation(d.terrain.parameters.elevation,{size:128,constraints:new Float32Array(d.terrain.constraints.values)},new Float32Array(d.terrain.offsets!));
const indices=new Int32Array(3*mesh.numSolidSides),em=new Float32Array(2*(mesh.numRegions+mesh.numTriangles));
Geometry.setMapGeometry(map,0,indices,em);
const elevation=new Float32Array(mesh.numRegions+mesh.numTriangles);elevation.set(map.elevation_r);elevation.set(map.elevation_t,mesh.numRegions);
const sample=sampleTerrainGrid(makeThermalGrid(),mesh.xyz_r,elevation);
const rt=ThermalRuntime.fromSnapshot(d.runtime,d.terrain.settings.planet,d.terrain.settings.orbit);
rt.attachRestoredTerrain(sample.landFraction,sample.landElevation,{mesh,directions:mesh.xyz_r,elevation,quadElements:indices});
rt.iceInventory=decodeIceInventory(JSON.parse(await readFile(`${folder}/ice-samples.json`,'utf8')));
rt.config.separateReservoirs=true;
rt.invalidate();rt.sync(d.terrain.settings.planet,d.terrain.settings.orbit,0,null);
const document={...d,runtime:rt.snapshot(),comparison:{baseline:null,history:[]}};
const encoded=encodeSimulationDocument(document);
await writeFile(`${folder}/earth-simulation.json`,encoded);
await writeFile('build/earth-ice-inventory/after-day0.json',encoded);
console.log(JSON.stringify({day:rt.model!.timeS/86400,steps:rt.model!.steps,water:rt.water!.diagnostics(),energy:rt.environment!.diagnostics(),source:rt.iceInventory?.source}));
