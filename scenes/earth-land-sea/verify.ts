import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {decodeSimulationDocument} from '../../simulation-document.ts';
import {makeMesh} from '../../mesh.ts';
import {meshIdentity} from '../../terrain-document.ts';
import config, {HIGH_DETAIL_SPACING} from '../../config.js';
import Map from '../../map.ts';
import {uvToDirection,sampleSphere} from '../../sphere.ts';
import {makeSurfaceGrid,surfaceCell,SurfaceTerrainSampler} from '../../surface-grid.ts';
import {ThermalRuntime} from '../../thermal-runtime.ts';
import {decodeIceInventory} from '../../ice-inventory.ts';
const folder='scenes/earth-land-sea';
config.spacing=HIGH_DETAIL_SPACING;
const {mesh,t_peaks}=await makeMesh();
assert(mesh.numTriangles>215000&&mesh.numTriangles<216000);
const d=decodeSimulationDocument(await readFile(`${folder}/earth-simulation.json`,'utf8'),meshIdentity(mesh,config),128);
assert.equal(d.terrain.settings.timeS,0);assert.equal(d.runtime.state!.lastTarget,0);
assert.equal(d.view.layer,'surface');
assert.equal(d.runtime.enabled,true);assert.equal(d.runtime.waterEnabled,true);
assert.equal(d.runtime.config.separateReservoirs,true);
const observed=decodeIceInventory(JSON.parse(await readFile(`${folder}/ice-samples.json`,'utf8')))!;
assert.deepEqual(d.runtime.iceInventory,observed);
const runtime=ThermalRuntime.fromSnapshot(d.runtime,d.terrain.settings.planet,d.terrain.settings.orbit);
assert(runtime.water!.glacier!.checkpoint().bedrockM);
const cryospherePoints=[['Antarctica',-85,0,2000],['Greenland',72,-40,2000],['Tibet',33,88,0],['Himalaya',28.25,86.85,0]].map(([name,lat,lon,minIce])=>{
    const cover=runtime.sampleSurface((Number(lon)+180)/360,(90-Number(lat))/180)!;
    if(minIce===0)assert.equal(cover.landIceM,0,String(name));else assert(cover.landIceM>Number(minIce),String(name));
    if(cover.landIceM>0)assert(cover.surfaceTemperatureK<=273.15+1e-10);
    return {name,landIceM:cover.landIceM,shelfIceM:cover.shelfIceM,airC:cover.localTemperatureK-273.15,surfaceC:cover.surfaceTemperatureK-273.15};
});
assert(Math.abs(runtime.water!.diagnostics().residualMm)<1e-6);
assert(Math.abs(runtime.environment!.diagnostics().energyResidualJm2)<1e-3);
for(const key of ['vegetation','iceAlbedo','terrainWater','glaciers','dynamicCirculation'])assert.equal(d.runtime.environmentConfig[key],true);
const values=new Float32Array(d.terrain.constraints.values),map=new Map(mesh,t_peaks,config);
assert(d.terrain.report?.importedFrom?.includes('ETOPO 2022'));
assert(d.terrain.offsets);
map.assignElevation(d.terrain.parameters.elevation,{size:128,constraints:values},new Float32Array(d.terrain.offsets));
const imported=map.elevation_t.slice();map.assignRainfall(d.terrain.parameters.biomes);map.assignRivers(d.terrain.parameters.rivers,true);
assert.deepEqual(map.elevation_t,imported);
const samples=JSON.parse(await readFile(`${folder}/elevation-samples.json`,'utf8'));
let maxHeightErrorM=0;
for(let t=0;t<mesh.numTriangles;t++){
    const e=map.elevation_t[t],heightM=e*(e>=0?d.terrain.settings.planet.reliefM:d.terrain.settings.planet.oceanDepthM);
    maxHeightErrorM=Math.max(maxHeightErrorM,Math.abs(heightM-samples.heightsM[t]));
}
assert(maxHeightErrorM<.01);
const grid=makeSurfaceGrid(),local=new SurfaceTerrainSampler(mesh.xyz_r,grid).sample(map.elevation_r);
// Match the production restore tolerance across browser/Node math libraries.
const maxClimateHeightDifference=Math.max(...local.height.map((h,k)=>Math.abs(h-d.runtime.state!.localHeight[k])));
assert(maxClimateHeightDifference<1e-12);
assert.deepEqual(Array.from(local.land),Array.from(d.runtime.state!.localLand));
const heightSource=JSON.parse(await readFile(`${folder}/elevation-source.json`,'utf8'));
const heightChecks=heightSource.checks.map(p=>{
    const u=(p.longitude+180)/360,v=(90-p.latitude)/180,dir=uvToDirection(u,v);
    let nearest=0,dot=-Infinity;
    for(let t=0;t<mesh.numTriangles;t++){
        const xyz=mesh.xyz_t.subarray(3*t,3*t+3),q=(xyz[0]*dir[0]+xyz[1]*dir[1]+xyz[2]*dir[2])/Math.hypot(...xyz);
        if(q>dot){dot=q;nearest=t;}
    }
    const e=map.elevation_t[nearest],meshM=e*(e>=0?d.terrain.settings.planet.reliefM:d.terrain.settings.planet.oceanDepthM);
    return {...p,nearestTriangleM:Math.round(meshM),climateLocalHeightM:Math.round(local.height[surfaceCell(grid,u,v)]*d.terrain.settings.planet.reliefM)};
});
const point=(name:string)=>heightChecks.find(p=>p.name===name);
assert(point('Tibetan Plateau').nearestTriangleM>4000);
assert(point('Altiplano').nearestTriangleM>3000);
for(const name of ['Amazon Plain','Ganges Plain','West Siberian Plain'])assert(point(name).nearestTriangleM<400);
assert(point('Tibetan Plateau').climateLocalHeightM>4000);
assert(point('North Pacific Basin').nearestTriangleM< -3000);
const source=JSON.parse(await readFile(`${folder}/source.json`,'utf8'));
const locations=source.checks.map(p=>{
  const dir=uvToDirection((p.longitude+180)/360,(90-p.latitude)/180);
  let best=-Infinity,index=-1;
  for(let t=0;t<mesh.numTriangles;t++){
    const xyz=mesh.xyz_t.subarray(3*t,3*t+3),dot=(xyz[0]*dir[0]+xyz[1]*dir[1]+xyz[2]*dir[2])/Math.hypot(...xyz);
    if(dot>best){best=dot;index=t;}
  }
  assert.equal(map.elevation_t[index]>0,p.land,p.name);
  return {name:p.name,land:p.land,triangle:index,elevation:map.elevation_t[index]};
});
for(const v of [0,.1,.25,.5,.75,.9,1])assert.equal(sampleSphere(values,128,0,v),sampleSphere(values,128,1,v));
assert(values.slice(0,128).every(e=>e<0));assert(values.slice(-128).every(e=>e>0));
assert(Array.from(map.elevation_t).every(Number.isFinite));
const result={savedSimulationValid:true,initialDay:0,separateReservoirs:true,observedIceSource:observed.source,cryospherePoints,water:runtime.water!.diagnostics(),energy:runtime.environment!.diagnostics(),systems:d.runtime.environmentConfig,knownLocations:locations,maxHeightErrorM,maxClimateHeightDifference,importedHeightsPreservedByRivers:true,savedClimateMatchesImportedTerrain:true,heightChecks,longitudeWrap:true,northPoleOcean:true,southPoleLand:true,finiteTerrain:true,note:'ETOPO 2022 ice-surface terrain preserved. Independent observed ice thickness initializes conserved reservoirs; terrain is not increased by ice thickness. Climate, seasonal sea ice and vegetation remain uncalibrated model estimates.'};
await writeFile(`${folder}/validation.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
