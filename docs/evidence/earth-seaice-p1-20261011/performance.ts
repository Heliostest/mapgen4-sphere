import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

import {makeMesh} from '../../../mesh.ts';
import config,{HIGH_DETAIL_SPACING} from '../../../config.js';
import Map from '../../../map.ts';
import Geometry from '../../../geometry.ts';
import {decodeSimulationDocument,encodeSimulationDocument} from '../../../simulation-document.ts';
import {meshIdentity} from '../../../terrain-document.ts';
import {ThermalRuntime} from '../../../thermal-runtime.ts';
import {sampleTerrainGrid} from '../../../thermal.ts';
import {terrainWaterView} from '../../../terrain-water-view.ts';
const folder='docs/evidence/earth-seaice-p1-20261011';
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
const {terrainWaterView:beforeView}=await import('../../../build/earth-seaice-p1/terrain-water-view-before.ts');
const scene=JSON.parse(await readFile('scenes/earth-land-sea/scene-config.json','utf8')),render=scene.render;
const style={enabled:!!render.fused_rivers,minFlowM3S:render.fused_river_min_flow,widthCoefficient:render.fused_river_width,maxWidthRatio:render.fused_river_max_width};
const median=(a:number[])=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)];
const result:any={formalSha256:sha(raw),meshTriangles:mesh.numTriangles,style,records:[],note:'Sequential Node CPU, 2 warmup and 10 timed actual single steps. Before and after geometry use identical evolved states, alternated call order. Not browser FPS or GPU timing.'};
for(const mode of ['classic','balanced','high']){
 const rt=restore(d.runtime);if(mode!=='classic'){rt.enableRefinement(mode as any);rt.sync(planet,orbit,0,null);}
 const m=rt.model!,advance=m.advanceTo.bind(m);let physicalMs=0;
 m.advanceTo=(...args:Parameters<typeof advance>)=>{const start=performance.now();try{return advance(...args);}finally{physicalMs+=performance.now()-start;}};
 const samples=[];let held:any,heldRivers:Float32Array,heldLakes:Float32Array;
 for(let i=0;i<12;i++){
  physicalMs=0;const a=performance.now();rt.sync(planet,orbit,m.timeS+m.stepS,null);const b=performance.now();
  const stateBefore=rt.snapshot(),times:{[key:string]:number}={},views:any={};
  for(const key of i%2?['after','before']:['before','after']){const start=performance.now();views[key]=(key==='after'?terrainWaterView:beforeView)(rt,style);times[key]=performance.now()-start;}
  assert.deepEqual(views.after,views.before,'All river/lake/shore atlas output must equal frozen implementation');
  assert.deepEqual(rt.snapshot(),stateBefore,'Display must not change physical state');
  if(held){assert.deepEqual(held.rivers,heldRivers!);assert.deepEqual(held.lakes,heldLakes!);}
  held=views.after;heldRivers=held.rivers.slice();heldLakes=held.lakes.slice();
  if(i>1)samples.push({physicalMs,syncMappingMs:b-a-physicalMs,beforeGeometryMs:times.before,afterGeometryMs:times.after});
 }
 // Changes in style must invalidate the view and preserve exact geometry.
 for(const alternate of [{...style,widthCoefficient:.11,maxWidthRatio:.6},{...style,enabled:false},{...style,minFlowM3S:30}])assert.deepEqual(terrainWaterView(rt,alternate),beforeView(rt,alternate));
 const row={mode,stepS:m.stepS,samples,median:Object.fromEntries(['physicalMs','syncMappingMs','beforeGeometryMs','afterGeometryMs'].map(key=>[key,median(samples.map(x=>(x as any)[key]))])),exactOutputAndStock:true,queuedFramesImmutable:true};
 result.records.push(row);console.log(JSON.stringify(row));(globalThis as any).gc?.();
}
assert.equal(sha(await readFile(formalPath)),result.formalSha256);
await writeFile(`${folder}/performance.json`,JSON.stringify(result,null,2)+'\n');
