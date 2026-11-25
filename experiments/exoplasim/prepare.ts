import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {makeMesh} from '../../mesh.ts';
import config from '../../config.js';
import Map from '../../map.ts';
import Geometry from '../../geometry.ts';
import {decodeSimulationDocument} from '../../simulation-document.ts';
import {meshIdentity} from '../../terrain-document.ts';
import {ThermalRuntime} from '../../thermal-runtime.ts';
import {sampleTerrainGrid} from '../../thermal.ts';
import {SurfaceTerrainSampler,makeSurfaceGrid} from '../../surface-grid.ts';
import {deriveOrbit} from '../../astronomy.ts';
import {derivePlanet} from '../../planet.ts';
import type {TerrainDocument} from '../../terrain-document.ts';
import type {Mesh} from '../../types.d.ts';
import {validateSupportedWorld} from './data.ts';

export function restoreMap(mesh:Mesh,t_peaks:number[],terrain:Pick<TerrainDocument,'parameters'|'constraints'|'offsets'|'report'>){
 const map=new Map(mesh,t_peaks,config);
 map.assignElevation(terrain.parameters.elevation,{size:terrain.constraints.size,constraints:new Float32Array(terrain.constraints.values)},terrain.offsets?new Float32Array(terrain.offsets):undefined);
 map.assignRainfall(terrain.parameters.biomes);
 map.assignRivers(terrain.parameters.rivers,!!terrain.report?.importedFrom);
 return map;
}

export async function loadWorld(worldPath:string){
 const raw=await readFile(worldPath,'utf8'),peek=JSON.parse(raw);validateSupportedWorld({mesh:peek.terrain?.mesh,runtime:peek.runtime});config.spacing=peek.terrain.mesh.spacing;
 const {mesh,t_peaks}=await makeMesh(),d=decodeSimulationDocument(raw,meshIdentity(mesh,config),128);
 const p=d.terrain.settings.planet,o=d.terrain.settings.orbit,map=restoreMap(mesh,t_peaks,d.terrain);
 const elevation=new Float32Array(mesh.numRegions+mesh.numTriangles);elevation.set(map.elevation_r);elevation.set(map.elevation_t,mesh.numRegions);
 const quads=new Int32Array(mesh.numSolidSides*3);Geometry.setMapGeometry(map,0,quads,new Float32Array(elevation.length*2));
 const source={mesh,directions:mesh.xyz_r,elevation,quadElements:quads,drainage:d.terrain.drainage};
 const rt=ThermalRuntime.fromSnapshot(d.runtime,p,o),terrain=sampleTerrainGrid(rt.grid,mesh.xyz_r,elevation);
 rt.attachRestoredTerrain(terrain.landFraction,terrain.landElevation,source);
 return {raw,d,p,o,source,rt,worldSha256:createHash('sha256').update(raw).digest('hex')};
}
if(process.argv[2]==='prepare'){
 const worldPath=resolve(process.argv[3]??'scenes/earth-land-sea/earth-simulation.json');
 const {d,p,o,source,worldSha256}=await loadWorld(worldPath),derived=deriveOrbit(p,o);
 if(p.retrograde||Math.abs(derived.solarDayS/86400-1)>.02)throw new Error('This first prototype requires an Earth-like one-day prograde rotation');
 const width=360,height=180,s=new SurfaceTerrainSampler(source.directions,makeSurfaceGrid(width,height+1)).sample(source.elevation);
 const land=[],elevationM=[];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const a=y*width+x,b=a+width,f=(s.land[a]+s.land[b])/2;
  land.push(f);elevationM.push(f>0?(s.land[a]*s.height[a]+s.land[b]*s.height[b])*p.reliefM/(2*f):0);
 }
 const input={format:'mapgen4-exoplasim-input',version:1,worldPath,worldSha256,mesh:d.terrain.mesh,
  planet:p,orbit:o,baselineConfig:{thermal:d.runtime.config,water:d.runtime.waterConfig,environment:d.runtime.environmentConfig},
  terrain:{name:'Mapgen4 authored terrain',width,height,land,elevationM,orientation:{poleLatitudeDeg:90,poleLongitudeDeg:0,spinDeg:0}},
  config:{gravityMs2:derivePlanet(p).gravityMps2,radiusEarth:p.radiusM/6371220,obliquityDeg:p.obliquityRad*180/Math.PI,fluxWm2:derived.fluxWm2,oceanDepthM:d.runtime.config.oceanDepthM,yearDays:365,eccentricity:0,rotationPeriodDays:1},
  calendar:{start:'January 1',equinoxDay:80.5,localPhysicalYearS:derived.yearS,comparisonYearDays:365},
  terrainNote:'360×180 geographic raster sampled from the actual authored physical terrain; coast fractions and heights are approximate, no artistic height exaggeration.'};
 await mkdir('build/exoplasim',{recursive:true});await writeFile('build/exoplasim/input.json',JSON.stringify(input));
 console.log(JSON.stringify({prepared:worldSha256,mesh:d.terrain.mesh,width,height,gravity:input.config.gravityMs2}));
}
