// Reproducible parameter probes on the authored Earth terrain (no DEM edits).
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {makeMesh} from '../../mesh.ts';
import config,{HIGH_DETAIL_SPACING} from '../../config.js';
import Map from '../../map.ts';
import Geometry from '../../geometry.ts';
import {meshIdentity} from '../../terrain-document.ts';
import {decodeSimulationDocument,encodeSimulationDocument} from '../../simulation-document.ts';
import {ThermalRuntime} from '../../thermal-runtime.ts';
import {sampleTerrainGrid,makeThermalGrid} from '../../thermal.ts';
import {sunState} from '../../astronomy.ts';
import assert from 'node:assert/strict';
import {surfaceCell,makeSurfaceGrid} from '../../surface-grid.ts';
import {aggregateSurface} from '../../surface-reservoirs.ts';

const folder='scenes/earth-land-sea',output='build/earth-realism';
await mkdir(output,{recursive:true});config.spacing=HIGH_DETAIL_SPACING;
const {mesh,t_peaks}=await makeMesh();
const text=await readFile(`${folder}/earth-simulation.json`,'utf8');
const d=decodeSimulationDocument(text,meshIdentity(mesh,config),128);
const map=new Map(mesh,t_peaks,config);
map.assignElevation(d.terrain.parameters.elevation,{size:128,constraints:new Float32Array(d.terrain.constraints.values)},new Float32Array(d.terrain.offsets!));
const indices=new Int32Array(3*mesh.numSolidSides),em=new Float32Array(2*(mesh.numRegions+mesh.numTriangles));
Geometry.setMapGeometry(map,0,indices,em);
const elevation=new Float32Array(mesh.numRegions+mesh.numTriangles);elevation.set(map.elevation_r);elevation.set(map.elevation_t,mesh.numRegions);
const sample=sampleTerrainGrid(makeThermalGrid(),mesh.xyz_r,elevation);
const source={mesh,directions:mesh.xyz_r,elevation,quadElements:indices};
const locations=[['Amazon',-3,-60],['Sahara',24,15],['Congo',0,23],['Europe',50,10],['Siberia',62,100],['Tibet',33,88],['Himalaya south foot',28,86],['Himalaya ridge',28.25,86.85],['Altiplano',-18,-68],['Atacama',-24,-69],['Australia interior',-25,134],['Australia east',-30,152],['Greenland',72,-40],['Antarctica',-85,0],['Arctic ocean',85,0],['Southern ocean',-65,0]] as const;
function readings(rt:ThermalRuntime,day:number) {
 const grid=makeSurfaceGrid(),state=rt.surfaceState()!,heights=rt.snapshot().state!.localHeight;
 return {day,steps:rt.model!.steps,seasonDeg:sunState(rt.model!.planet,rt.model!.orbit,day*86400).orbitAngleRad*180/Math.PI,globalMeanC:rt.model!.diagnostics().meanK-273.15,waterResidualMm:rt.water!.diagnostics().residualMm,energyResidualJm2:rt.environment!.diagnostics().energyResidualJm2,
 points:locations.map(([name,lat,lon])=>{const u=(lon+180)/360,v=(90-lat)/180,k=surfaceCell(grid,u,v),s=rt.sampleSurface(u,v)!,w=rt.sampleWater(u,v)!;return {name,lat,lon,localLandFraction:state.land[k],localHeightM:heights[k]*d.terrain.settings.planet.reliefM,meanC:s.meanTemperatureK-273.15,warmestC:s.warmestTemperatureK-273.15,localC:s.localTemperatureK-273.15,rainMmYear:s.annualRainMm,biome:s.biome,vegetation:s.vegetationFraction,snowFraction:s.snowFraction,seaIce:s.seaIceFraction,landIceM:s.landIceM,precipMmDay:w.precipitationMmDay,soilMm:w.soilMm,snowMm:w.snowMm,iceM:w.iceM};})};
}
function coverage(rt:ThermalRuntime){
 const grid=makeSurfaceGrid(),s=rt.surfaceState()!,r=d.terrain.settings.planet.radiusM;
 const sum={arcticSeaExtentKm2:0,antarcticSeaExtentKm2:0,antarcticLandKm2:0,antarcticGroundedIceKm2:0,antarcticSnowOrGroundedKm2:0};
 for(let j=0;j<grid.height;j++)for(let x=0;x<grid.width;x++){
  const k=j*grid.width+x,v=j/(grid.height-1),lat=90-180*v,a=2*Math.PI*r*r/grid.width*(Math.cos(Math.max(0,(j-.5)/(grid.height-1))*Math.PI)-Math.cos(Math.min(1,(j+.5)/(grid.height-1))*Math.PI))/1e6;
  const ice=rt.sampleSurface((x+.5)/grid.width,v)!.seaIceFraction,land=s.land[k];
  if(ice>=.15&&lat>0)sum.arcticSeaExtentKm2+=a*(1-land);
  if(ice>=.15&&lat<0)sum.antarcticSeaExtentKm2+=a*(1-land);
  if(lat< -60){sum.antarcticLandKm2+=a*land;if(s.landIceKgM2![k]>917)sum.antarcticGroundedIceKm2+=a*land;if(s.landIceKgM2![k]>917||s.snowMm![k]>30)sum.antarcticSnowOrGroundedKm2+=a*land;}
 }
 return {...sum,antarcticGroundedFraction:sum.antarcticGroundedIceKm2/sum.antarcticLandKm2,antarcticVisibleFrozenFraction:sum.antarcticSnowOrGroundedKm2/sum.antarcticLandKm2,note:'Approximate 96×49 display-grid area quadrature, fraction threshold 15%; not a satellite product. Sea ice samples over land are masked out.'};
}
if(process.argv.includes('--summary')){
 const files=['baseline','transport-0.8','emissivity-0.64','mixed-layer-30m','land-capacity-20mj','native-playback','browser-before-day24','browser-after-day24'];
 const summaries=[];
 for(const file of files){
  const raw=JSON.parse(await readFile(`${output}/${file}.json`,'utf8'));let doc;
  try{doc=decodeSimulationDocument(JSON.stringify(raw),meshIdentity(mesh,config),128);}catch(error){
   const s=raw.runtime.state,w=s.water,c=raw.runtime.environmentConfig,clamp=(v:number)=>Math.max(0,Math.min(1,v));
   const v=aggregateSurface(makeThermalGrid(),makeSurfaceGrid(),s.vegetation.cover,s.localLand);
   const expected=s.land.map((f:number,i:number)=>{const frozen=f*Math.max(f>0?clamp(w.snowKgM2[i]/(f*30)):0,f>0?clamp(w.landIceKgM2[i]/(f*917*5)):0)+(1-f)*(f<1?clamp(w.seaIceKgM2[i]/((1-f)*917*.5)):0),base=clamp(raw.terrain.settings.orbit.bondAlbedo+(c.vegetation?f*.06*(.5-v[i]):0));return c.iceAlbedo?base+(Math.max(base,.65)-base)*frozen:base;});
   const maxAlbedoDifference=Math.max(...expected.map((a:number,i:number)=>Math.abs(a-s.thermal.albedo[i])));
   console.log(JSON.stringify({name:file,strictNodeDecodeError:String(error),maxAlbedoDifference}));
   summaries.push({name:file,clockDay:raw.terrain.settings.timeS/86400,strictNodeDecodeError:String(error),maxAlbedoDifference,rawGlobalMeanC:s.thermal.temperatureK.reduce((a:number,b:number)=>a+b,0)/s.thermal.temperatureK.length-273.15});continue;
  }
  const rt=ThermalRuntime.fromSnapshot(doc.runtime,doc.terrain.settings.planet,doc.terrain.settings.orbit);rt.attachRestoredTerrain(sample.landFraction,sample.landElevation,source);summaries.push({name:file,clockDay:doc.terrain.settings.timeS/86400,config:rt.config,reading:readings(rt,rt.model!.timeS/86400),coverage:coverage(rt)});
 }
 const before=JSON.parse(await readFile(`${output}/browser-before-day24.json`,'utf8')),after=JSON.parse(await readFile(`${output}/browser-after-day24.json`,'utf8'));
 assert.deepEqual(before.runtime,after.runtime);assert.deepEqual(before.terrain.offsets,after.terrain.offsets);assert.deepEqual(before.terrain.constraints,after.terrain.constraints);
 await writeFile('docs/evidence/earth-realism-20261010/summary.json',JSON.stringify({physicalStateExactlyEqualBeforeAfter:true,terrainExactlyEqualBeforeAfter:true,summaries},null,2));
 console.log(JSON.stringify(summaries.map(s=>({name:s.name,clockDay:s.clockDay,...s.coverage}))));
}else{
const experiments=[{name:'baseline',thermal:{}},{name:'transport-0.8',thermal:{diffusion:.8}},{name:'emissivity-0.64',thermal:{emissivity:.64}},{name:'mixed-layer-30m',thermal:{oceanDepthM:30}},{name:'land-capacity-20mj',thermal:{landHeatCapacity:20e6}}];
const results=[];
for(const experiment of experiments.filter(e=>!process.env.PROBE||e.name===process.env.PROBE)){
 const rt=ThermalRuntime.fromSnapshot(d.runtime,d.terrain.settings.planet,d.terrain.settings.orbit);rt.attachRestoredTerrain(sample.landFraction,sample.landElevation,source);
 if(experiment.name!=='baseline'){Object.assign(rt.config,experiment.thermal);rt.invalidate();rt.sync(d.terrain.settings.planet,d.terrain.settings.orbit,0,null);}
 const initial=readings(rt,0);
 const doc={...d,runtime:rt.snapshot(),comparison:{baseline:null,history:[]}};
 await writeFile(`${output}/${experiment.name}.json`,encodeSimulationDocument(doc));
 // Integrate real fixed physical steps, rather than seeking to a new reference.
 const targets=process.argv.includes('--initial-only')?[]:process.argv.includes('--annual')?[24,91,182,273,365]:[24];
 const evolution=[];
 for(const day of targets){const count=Math.floor(day*86400/rt.model!.stepS);for(let step=rt.model!.steps+1;step<=count;step++)rt.sync(d.terrain.settings.planet,d.terrain.settings.orbit,step*rt.model!.stepS+.001,null);if(rt.model!.steps!==count)throw new Error('Step scheduling failed');evolution.push(readings(rt,rt.model!.timeS/86400));}
 results.push({name:experiment.name,config:rt.config,initial,evolution});
 console.log(JSON.stringify({name:experiment.name,initial,evolution}));
}
await writeFile(`docs/evidence/earth-realism-20261010/${process.env.PROBE??'parameter-probes'}.json`,JSON.stringify({baseCommit:'a4ec11e3ed1c8df5b7a1bfe0e75cc4bfc4d34b41',experiments:results},null,2));
}
