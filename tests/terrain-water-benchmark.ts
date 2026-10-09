// Opt-in timing gate: run on an otherwise idle machine, outside the test suite.
// Exercises the same full-resolution shoreline update used during playback.
import {makeSphereMesh} from '../sphere-mesh.ts';
import {ThermalRuntime} from '../thermal-runtime.ts';
import {makeThermalGrid,sampleTerrainGrid} from '../thermal.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';
import {terrainWaterView} from '../terrain-water-view.ts';

const {mesh}=makeSphereMesh(12000,35,12345),rt=new ThermalRuntime(makeThermalGrid(24,12));
const elevation=Float32Array.from({length:mesh.numRegions+mesh.numTriangles},(_,i)=>{
    const p=i<mesh.numRegions?mesh.xyz_r:mesh.xyz_t,j=i<mesh.numRegions?i:i-mesh.numRegions;
    return .02+.008*p[3*j+1]+.003*p[3*j];
});
const sample=sampleTerrainGrid(rt.grid,mesh.xyz_r,elevation);
rt.enabled=rt.waterEnabled=true;rt.environmentConfig.terrainWater=true;
rt.setTerrain(sample.landFraction,sample.landElevation,{mesh,directions:mesh.xyz_r,elevation});rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);
const route=rt.water!.routing!,times:number[]=[];
for(let frame=0;frame<12;frame++) {
    for(let t=0;t<mesh.numTriangles;t++)route.volumeM3[t]=(.02+.005*frame)*route.network.areaM2[t];
    rt.model!.steps++;
    const start=performance.now(),view=terrainWaterView(rt)!;
    const duration=performance.now()-start;
    if(frame>=3)times.push(duration);
    if(!view.lakes.length||view.lakes.some(v=>!Number.isFinite(v)))throw new Error('Missing or invalid lake geometry');
}
times.sort((a,b)=>a-b);
const medianMs=times[Math.floor(times.length/2)],budgetMs=50;
console.log(JSON.stringify({triangles:mesh.numTriangles,medianMs,maxMs:Math.max(...times),budgetMs,status:medianMs<budgetMs?'PASS':'FAIL'}));
if(medianMs>=budgetMs)process.exitCode=1;
