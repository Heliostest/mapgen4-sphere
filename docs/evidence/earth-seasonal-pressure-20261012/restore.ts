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
const folder='docs/evidence/earth-seasonal-pressure-20261012',out='build/earth-seasonal-pressure',label=process.env.PARAM_PROFILE??'control',dt=Number(process.env.PARAM_DT??1800),start=performance.now();
const sha=(v:string)=>createHash('sha256').update(v).digest('hex'),sum=(a:Iterable<number>)=>Array.from(a).reduce((s,v)=>s+v,0);
const profiles=JSON.parse(await readFile(`${folder}/profiles.json`,'utf8'));assert(profiles[label]);
config.spacing=HIGH_DETAIL_SPACING;const {mesh,t_peaks}=await makeMesh(),identity=meshIdentity(mesh,config);
const raw=await readFile('scenes/earth-land-sea/earth-simulation.json','utf8'),inputRaw=await readFile('build/earth-lakes-freeze-temperate/lake-day0.json','utf8'),d=decodeSimulationDocument(inputRaw,identity,128),p=d.terrain.settings.planet,o=d.terrain.settings.orbit;
const map=new Map(mesh,t_peaks,config);map.assignElevation(d.terrain.parameters.elevation,{size:128,constraints:new Float32Array(d.terrain.constraints.values)},new Float32Array(d.terrain.offsets!));map.assignRainfall(d.terrain.parameters.biomes);map.assignRivers(d.terrain.parameters.rivers,true);
const elevation=new Float32Array(mesh.numRegions+mesh.numTriangles);elevation.set(map.elevation_r);elevation.set(map.elevation_t,mesh.numRegions);
const quads=new Int32Array(mesh.numSolidSides*3);Geometry.setMapGeometry(map,0,quads,new Float32Array(elevation.length*2));
const source={mesh,directions:mesh.xyz_r,elevation,quadElements:quads,drainage:d.terrain.drainage};
const terrain=sampleTerrainGrid(makeThermalGrid(),mesh.xyz_r,elevation),checks=[];
const json=v=>JSON.stringify(v,(_,x)=>ArrayBuffer.isView(x)?Array.from(x):x);
for(const profile of ['control','balanced','boundaryMix1']){
 const raw=await readFile(out+'/full-'+profile+'-day365.json','utf8'),saved=decodeSimulationDocument(raw,identity,128),stats=JSON.parse(await readFile(out+'/full-'+profile+'.json','utf8'));
 const a=ThermalRuntime.fromSnapshot(saved.runtime,p,o);a.attachRestoredTerrain(terrain.landFraction,terrain.landElevation,source);
 assert.deepEqual(Array.from(a.water.atmosphereKgM2),stats.vaporBudget.final);assert.deepEqual(Array.from(a.water.snowKgM2),stats.causal.snowLedger.final);
 const round=decodeSimulationDocument(encodeSimulationDocument({...saved,runtime:a.snapshot()}),identity,128),b=ThermalRuntime.fromSnapshot(round.runtime,p,o);b.attachRestoredTerrain(terrain.landFraction,terrain.landElevation,source);
 assert.deepEqual(a.snapshot(),b.snapshot());const target=a.model.timeS+a.model.stepS;a.sync(p,o,target,null);b.sync(p,o,target,null);assert.deepEqual(a.snapshot(),b.snapshot());
 const budget={waterMm:a.water.diagnostics().residualMm,enthalpyJm2:a.environment.enthalpy()-a.environment.initialEnthalpy-a.model.radiationJm2};assert(Math.abs(budget.waterMm)<5e-6&&Math.abs(budget.enthalpyJm2)<.005);
 checks.push({profile,serializedSavedEndpointEqualsIntegratedLedgers:true,jsonRoundtripNextStepExact:true,budget});
}
await writeFile(folder+'/serialized-restore.json',JSON.stringify(checks,null,2)+'\n');console.log(JSON.stringify(checks));
