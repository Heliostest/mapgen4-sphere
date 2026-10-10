/** Independent read-only review probes. Mutations below affect fixtures only. */
import {writeFile} from 'node:fs/promises';
import {TerrainWater} from '../../../terrain-water.ts';
import {ThermalRuntime} from '../../../thermal-runtime.ts';
import {makeThermalGrid} from '../../../thermal.ts';
import {DEFAULT_PLANET} from '../../../planet.ts';
import {DEFAULT_ORBIT} from '../../../astronomy.ts';
import {uvToDirection} from '../../../sphere.ts';

function routingFixture(triangles=1) {
    const water={grid:{count:1},cellAreaM2:1000,surfaceKgM2:new Float64Array([10]),dischargeM3S:new Float64Array(1),oceanGlobalKgM2:0};
    const network={cell:new Int32Array(triangles),areaM2:new Float64Array(triangles).fill(1000/triangles),bedM:new Float64Array(triangles),neighbors:Array.from({length:triangles},()=>[])};
    return {water,route:new TerrainWater(network,water)};
}
function runtimeFixture(coast=false) {
    const grid=makeThermalGrid(8,4),rt=new ThermalRuntime(grid);
    rt.enabled=rt.waterEnabled=true;rt.config.separateReservoirs=true;
    const directions:number[]=[],elevation:number[]=[];
    for(let j=0;j<32;j++)for(let x=0;x<64;x++) {
        directions.push(...uvToDirection((x+.5)/64,Math.acos(1-2*(j+.5)/32)/Math.PI));
        elevation.push(x%8>=4?(coast?-.2:.65):.005);
    }
    const source={directions,elevation},land=new Float64Array(grid.count).fill(coast?.5:1),height=new Float64Array(grid.count).fill(coast?.005:.3275);
    rt.setTerrain(land,height,source);rt.refinement='balanced';rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);
    return {rt,source,land,height};
}
const results:any={};
{
    const {water,route}=routingFixture(),mass=new Float64Array([0,10]);
    route.setPartition(new Int32Array([0]),mass,new Int32Array([0,0]));
    route.route(water,1800,1);
    let restore='accepted';try{route.restore(route.checkpoint(),water);}catch(e){restore=String(e);}
    results.unrepresentedWithZeroDonor={coarse:water.surfaceKgM2[0],triangleVolume:Array.from(route.volumeM3),diagnostics:route.diagnostics(water),restore};
}
{
    const {water,route}=routingFixture(2),mass=new Float64Array([2]);
    water.surfaceKgM2[0]=2;route.volumeM3.set([2,0]);
    route.setPartition(new Int32Array([0,0]),mass,new Int32Array([0]));
    const saved=route.checkpoint();
    water.surfaceKgM2[0]=mass[0]=1;route.route(water,1800,1);
    water.surfaceKgM2[0]=mass[0]=2;route.restore(saved,water);
    const restored=Array.from(route.volumeM3);route.route(water,1800,1);
    results.restoreThenNoopRoute={saved:Array.from(saved.volumeM3),restored,afterNoop:Array.from(route.volumeM3)};
}
{
    const {rt}=runtimeFixture(),m=rt.model!,r=rt.refinedSurface!,p=r.partition,k=12;
    m.config.emissivity=0; // Isolate turbulent exchange; not a proposed app setting.
    m.temperatureK.fill(280);
    for(let t=0;t<p.parent.length;t++)r.landK[t]=r.airK(t);
    r.aggregate();const before=r.landK.slice(),airBefore=Array.from(before.slice(p.offset[k],p.offset[k+1])),initialEnergy=m.energy();
    r.stepSurface(k,1800,0);
    results.localAirEquilibrium={patchAirBefore:airBefore,patchSurfaceBefore:airBefore,patchSurfaceAfter:Array.from(r.landK.slice(p.offset[k],p.offset[k+1])),maxTemperatureChange:Math.max(...Array.from(r.landK.slice(p.offset[k],p.offset[k+1]),(v,i)=>Math.abs(v-before[p.offset[k]+i]))),energyResidual:m.energy()-initialEnergy};
}
{
    const {rt,source,land,height}=runtimeFixture(),saved=rt.snapshot(),r=saved.state!.refined!,t=r.partition.offset[12];
    const before=rt.refinedSurface!.sample(r.partition.u[t],r.partition.v[t]);
    r.partition.heightM[t]+=1000;
    let outcome='accepted',after:any=null;
    try{const restored=ThermalRuntime.fromSnapshot(saved,DEFAULT_PLANET,DEFAULT_ORBIT);restored.attachRestoredTerrain(land,height,source);after=restored.refinedSurface!.sample(r.partition.u[t],r.partition.v[t]);}catch(e){outcome=String(e);}
    results.alteredTopology={outcome,before:{heightM:before.heightM,airK:before.airK},after:after&&{heightM:after.heightM,airK:after.airK}};
}
{
    const {rt}=runtimeFixture();
    // A valid evolving state may have different adjacent polar-cap columns.
    // Every (u, 0) is nonetheless the same geometric north-pole direction.
    for(let k=0;k<rt.grid.width;k++)rt.model!.temperatureK[k]=270+k;
    const samples=[0,.125,.25,.375,.5,.625,.75,.875].map(u=>({u,...rt.refinedSurface!.sample(u,0)}));
    results.exactPole={airSpread:Math.max(...samples.map(s=>s.airK))-Math.min(...samples.map(s=>s.airK)),landSpread:Math.max(...samples.map(s=>s.landK))-Math.min(...samples.map(s=>s.landK)),samples:samples.map(s=>({u:s.u,airK:s.airK,landK:s.landK,snowMm:s.snowMm,heightM:s.heightM}))};
}
{
    const {rt}=runtimeFixture(true),r=rt.refinedSurface!,w=rt.water!,p=r.partition,k=12;
    const seaPatches=Array.from({length:p.offset[k+1]-p.offset[k]},(_,i)=>p.offset[k]+i).filter(t=>p.sea[t]>0),knownLakePatches=seaPatches.slice(0,seaPatches.length/2),knownOceanPatches=seaPatches.slice(seaPatches.length/2);
    // In this coastal parent, one half of the sea mask is a confirmed finite
    // inland lake. Only its lake surface is below the seawater freeze point.
    w.inlandWaterFraction[k]=.25;r.ice.fill(0);r.seaK.fill(280);r.landK.fill(273.15);
    for(const t of knownLakePatches)r.seaK[t]=270;
    r.aggregate();const oceanBefore=w.oceanGlobalKgM2;r.phase(1800);
    results.coldInlandLake={parentLand:w.land[k],inlandLakeArea:w.inlandWaterFraction[k],knownLakePatches,knownOceanPatches,lakeSeaIceKgM2Parent:knownLakePatches.reduce((s,t)=>s+r.ice[t],0),openOceanSeaIceKgM2Parent:knownOceanPatches.reduce((s,t)=>s+r.ice[t],0),globalOceanLossKgM2:oceanBefore-w.oceanGlobalKgM2};
}
console.log(JSON.stringify(results,null,2));
await writeFile('docs/evidence/earth-climate-refinement-20261011/code-review-probes.json',JSON.stringify(results,null,2)+'\n');
