import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {makeMesh} from '../../mesh.ts';
import config, {HIGH_DETAIL_SPACING} from '../../config.js';
import Map from '../../map.ts';
import {defaultTerrainParameters} from '../../terrain-parameters.ts';
import {meshIdentity,encodeTerrainDocument} from '../../terrain-document.ts';
import {DEFAULT_PLANET} from '../../planet.ts';
import {DEFAULT_ORBIT} from '../../astronomy.ts';
const folder='scenes/earth-land-sea',cache='build/earth-relief';
const sceneConfig=JSON.parse(await readFile(`${folder}/scene-config.json`,'utf8'));
await mkdir(cache,{recursive:true});
config.spacing=HIGH_DETAIL_SPACING;
const {mesh,t_peaks}=await makeMesh(),identity=meshIdentity(mesh,config);
if(process.argv.includes('--coordinates')) {
    await writeFile(`${cache}/mesh.json`,JSON.stringify({mesh:identity,xyz:Array.from(mesh.xyz_t)}));
    await writeFile(`${cache}/mesh-neighbors.json`,JSON.stringify({mesh:identity,neighbors:Array.from({length:mesh.numSides},(_,s)=>mesh.t_outer_s(s))}));
} else {
    const samples=JSON.parse(await readFile(`${folder}/elevation-samples.json`,'utf8'));
    if(samples.mesh.fingerprint!==identity.fingerprint||samples.heightsM.length!==mesh.numTriangles)throw new Error('Elevation samples use a different mesh');
    const old=JSON.parse(await readFile(`${folder}/earth-terrain.json`,'utf8'));
    const values:number[]=old.constraints.values,parameters=defaultTerrainParameters();
    parameters.elevation.noisy_coastlines=0;parameters.elevation.mountain_folds=0;
    parameters.render.x=820;parameters.render.y=420;parameters.render.zoom=.26;
    // About 12x vertical relief (the old scene was about 106x). Physics still
    // consumes the unscaled metre heights; these are presentation settings.
    parameters.render.mountain_height=Number((sceneConfig.render.exaggeration*parameters.render.sphere_radius*DEFAULT_PLANET.reliefM/DEFAULT_PLANET.radiusM).toFixed(3));
    parameters.render.overhead=sceneConfig.render.overhead;
    parameters.render.outline_strength=sceneConfig.render.outline_strength;parameters.render.outline_water=sceneConfig.render.outline_water;
    for(const key of ['fused_rivers','fused_river_min_flow','fused_river_width','fused_river_max_width'])parameters.render[key]=sceneConfig.render[key];
    const drainageSamples=JSON.parse(await readFile(`${folder}/drainage-samples.json`,'utf8'));
    if(JSON.stringify(drainageSamples.mesh)!==JSON.stringify(identity))throw new Error('Drainage samples use a different mesh');
    const drainage={source:'HydroBASINS v1.c level 4 + Natural Earth closed inland water, integrated classification',basinId:drainageSamples.basinId,terminal:drainageSamples.terminal,inlandLakeId:drainageSamples.inlandLakeId};
    const planet={...DEFAULT_PLANET},map=new Map(mesh,t_peaks,config);
    map.assignElevation(parameters.elevation,{size:128,constraints:new Float32Array(values)});
    // The persistent terrain layer replaces the procedural result at every
    // triangle. Rivers, climate and rendering all consume this same field.
    const target=new Float32Array(samples.heightsM.map((h:number)=>h/(h>=0?planet.reliefM:planet.oceanDepthM)));
    const offsets=new Float32Array(target.map((e,t)=>e-map.baseElevation_t[t]));
    map.assignElevation(parameters.elevation,{size:128,constraints:new Float32Array(values)},offsets);
    const before=map.elevation_t.slice();map.assignRainfall(parameters.biomes);map.assignRivers(parameters.rivers,true);
    let maxErrorM=0;
    for(let t=0;t<mesh.numTriangles;t++){
        const h=map.elevation_t[t]*(target[t]>=0?planet.reliefM:planet.oceanDepthM);
        maxErrorM=Math.max(maxErrorM,Math.abs(h-samples.heightsM[t]));
        if(map.elevation_t[t]!==before[t])throw new Error('Rivers changed imported heights');
    }
    if(maxErrorM>.01)throw new Error(`Elevation changed by ${maxErrorM} metres`);
    const report={years:0,sourceTimeS:0,clipped:0,mobileKm3:0,oceanKm3:0,importedFrom:'NOAA ETOPO 2022 (ice surface), sampled to mesh'};
    const doc={format:'mapgen4-sphere-terrain' as const,version:1 as const,mesh:identity,constraints:{size:128,painted:true,values},offsets:Array.from(offsets),report,parameters,drainage,settings:{planet,orbit:{...DEFAULT_ORBIT},timeS:0,camera:'surface' as const}};
    await writeFile(`${folder}/earth-terrain.json`,encodeTerrainDocument(doc));
    console.log(JSON.stringify({triangles:mesh.numTriangles,minM:samples.heightsM.reduce((a,b)=>Math.min(a,b),Infinity),maxM:samples.heightsM.reduce((a,b)=>Math.max(a,b),-Infinity),maxErrorM,landFraction:target.filter(e=>e>=0).length/target.length}));
}
