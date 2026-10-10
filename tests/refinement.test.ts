import test from 'node:test';
import assert from 'node:assert/strict';
import {ThermalRuntime} from '../thermal-runtime.ts';
import {makeThermalGrid,thermalCell} from '../thermal.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';
import {uvToDirection} from '../sphere.ts';
import {TerrainWater} from '../terrain-water.ts';
import {makeSurfacePartition} from '../refinement-topology.ts';
import {sampleTerrainGrid} from '../thermal.ts';
import {makeSphereMesh} from '../sphere-mesh.ts';
function fixture(coast=false) {
    const g=makeThermalGrid(8,4),rt=new ThermalRuntime(g);
    rt.enabled=rt.waterEnabled=true;rt.config.separateReservoirs=true;
    const directions:number[]=[],elevation:number[]=[];
    for(let j=0;j<32;j++)for(let x=0;x<64;x++) {
        directions.push(...uvToDirection((x+.5)/64,Math.acos(1-2*(j+.5)/32)/Math.PI));
        elevation.push(coast&&x%8>=4?-.2:x%8>=4?.65:.005);
    }
    rt.setTerrain(new Float64Array(g.count).fill(coast?.5:1),new Float64Array(g.count).fill(coast?.005:.3275),{directions,elevation});
    (rt as any).refinement='balanced';rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);return rt;
}
test('resolved highland and lowland keep independent evolving surface temperatures and snow',()=>{
    const rt=fixture(),v=Math.acos(.25)/Math.PI,u0=.28,u1=.34;
    assert.equal(thermalCell(rt.grid,u0,v),thermalCell(rt.grid,u1,v));
    assert.ok((rt as any).refinedSurface,'A real independent surface solver is required');
    assert.ok(rt.sampleSurface(u0,v)!.surfaceTemperatureK-rt.sampleSurface(u1,v)!.surfaceTemperatureK>15);
    for(let i=0;i<96;i++)rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,rt.model!.timeS+rt.model!.stepS,null);
    assert.ok(rt.sampleWater(u1,v)!.snowMm>rt.sampleWater(u0,v)!.snowMm+10);
    assert.ok(Math.abs(rt.water!.diagnostics().residualMm)<1e-7);
    assert.ok(Math.abs(rt.environment!.diagnostics().energyResidualJm2)<.001);
});
test('refined mixed coast keeps marine and land phases distinct',()=>{
    const rt=fixture(true),v=Math.acos(.75)/Math.PI;assert.ok((rt as any).refinedSurface);
    assert.notEqual(rt.sampleSurface(.28,v)!.surfaceTemperatureK,rt.sampleSurface(.34,v)!.surfaceTemperatureK);
    assert.ok(Math.abs(rt.water!.diagnostics().residualMm)<1e-7);
    const r=rt.refinedSurface!,p=r.partition,sea=p.land.findIndex(l=>l===0);
    assert.ok(sea>=0);assert.equal(rt.sampleWater(p.u[sea],p.v[sea])!.soilMm,null);assert.equal(rt.sampleWater(p.u[sea],p.v[sea])!.surfaceMm,null);
});
test('refined snapshot restores all independent stores and continues identically',()=>{
    const rt=fixture();rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,1800,null);
    const restored=ThermalRuntime.fromSnapshot(rt.snapshot(),DEFAULT_PLANET,DEFAULT_ORBIT);assert.ok((restored as any).refinedSurface);
    const target=rt.model!.timeS+rt.model!.stepS;
    rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,target,null);restored.sync(DEFAULT_PLANET,DEFAULT_ORBIT,target,null);
    assert.deepEqual(restored.snapshot(),rt.snapshot());
});
test('a pure parent with resolved relief and a missed triangle coast has no zero-area patch',()=>{
    const rt=fixture(),source=rt.terrainSource!,mixed={...source,elevation:Array.from(source.elevation,(v,i)=>i%8>=6?-.2:v)},p=makeSurfacePartition(rt.grid,new Float64Array(rt.grid.count).fill(1),new Float64Array(rt.grid.count).fill(.3275),mixed,DEFAULT_PLANET.reliefM,'high');
    assert.ok(p.level.some(q=>q===8));assert.ok(p.land.every((v,i)=>v+p.sea[i]>0));
});
test('sparse refined runoff remains finite and restored routing preserves its exact position',()=>{
    const water={grid:{count:1},cellAreaM2:1000,surfaceKgM2:new Float64Array([10]),dischargeM3S:new Float64Array(1),oceanGlobalKgM2:0};
    const route=new TerrainWater({cell:new Int32Array(2),areaM2:new Float64Array([500,500]),bedM:new Float64Array(2),neighbors:[[],[]]},water),mass=new Float64Array([0,10]);
    route.setPartition(new Int32Array([0,0]),mass,new Int32Array([0,0]));route.route(water,1800,1);
    assert.equal(route.volumeM3[0]+route.volumeM3[1],10);assert.equal(route.diagnostics(water).partitionResidualM3,0);
    mass[0]=water.surfaceKgM2[0]=2;mass[1]=0;route.volumeM3.set([2,0]);route.setPartition(new Int32Array([0,0]),mass,new Int32Array([0,0]));const saved=route.checkpoint();
    mass[0]=water.surfaceKgM2[0]=1;route.route(water,1800,1);mass[0]=water.surfaceKgM2[0]=2;route.restore(saved,water);route.route(water,1800,1);assert.deepEqual(route.volumeM3,saved.volumeM3);
});
test('local turbulent exchange has zero flux when surface equals its local air',()=>{
    const rt=fixture(),r=rt.refinedSurface!,m=rt.model!,k=12;m.config.emissivity=0;m.temperatureK.fill(280);
    for(let t=0;t<r.landK.length;t++)r.landK[t]=r.landAirK(t);r.aggregate();const before=r.landK.slice();r.stepSurface(k,1800,0);assert.deepEqual(r.landK,before);
});
test('longitude seam and exact polar queries have shared geometric limits',()=>{
    const rt=fixture(),r=rt.refinedSurface!;for(let k=0;k<rt.grid.width;k++)rt.model!.temperatureK[k]=270+k;
    for(const v of [0,1])for(const u of [.125,.25,.75])assert.deepEqual(r.sample(u,v),r.sample(0,v));
    const a=r.sample(.02,.5),b=r.sample(1.02,.5);assert.deepEqual(a,b);
});
test('terrain mask/relief changes and quality rebuilds conserve history and restore',()=>{
    const rt=fixture();for(let i=0;i<8;i++)rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,rt.model!.timeS+1800,null);
    const time=rt.model!.timeS,mass=rt.water!.diagnostics().totalMm,energy=rt.environment!.enthalpy(),initial=rt.water!.initialTotalMm;
    const source=rt.terrainSource!,changed={...source,elevation:Array.from(source.elevation,(v,i)=>i%8>=4?-.2:v)};
    rt.setTerrain(new Float64Array(rt.grid.count).fill(.5),new Float64Array(rt.grid.count).fill(.005),changed);
    assert.equal(rt.model!.timeS,time);assert.equal(rt.water!.initialTotalMm,initial);assert.ok(Math.abs(rt.water!.diagnostics().totalMm-mass)<1e-7);assert.ok(Math.abs(rt.environment!.enthalpy()-energy)<.001);
    rt.enableRefinement('high');assert.equal(rt.model!.timeS,time);assert.ok(Math.abs(rt.water!.diagnostics().totalMm-mass)<1e-7);assert.ok(Math.abs(rt.environment!.enthalpy()-energy)<.001);
    const restored=ThermalRuntime.fromSnapshot(rt.snapshot(),DEFAULT_PLANET,DEFAULT_ORBIT);restored.attachRestoredTerrain(new Float64Array(rt.grid.count).fill(.5),new Float64Array(rt.grid.count).fill(.005),changed);
    rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,time+1800,null);restored.sync(DEFAULT_PLANET,DEFAULT_ORBIT,time+1800,null);assert.deepEqual(restored.snapshot(),rt.snapshot());
});
test('restoration rejects changed geographic registration, ownership, and authored fine heights',()=>{
    const rt=fixture(),source=rt.terrainSource!,saved=rt.snapshot(),p=saved.state!.refined!.partition;
    p.u[0]+=.001;assert.throws(()=>ThermalRuntime.fromSnapshot(saved,DEFAULT_PLANET,DEFAULT_ORBIT),/registration/);
    p.u[0]-=.001;p.heightM[0]+=1000;
    const restored=ThermalRuntime.fromSnapshot(saved,DEFAULT_PLANET,DEFAULT_ORBIT);assert.throws(()=>restored.attachRestoredTerrain(new Float64Array(rt.grid.count).fill(1),new Float64Array(rt.grid.count).fill(.3275),source),/topology/);
});
test('a confirmed cold inland lake cannot freeze water from the global ocean',()=>{
    const rt=fixture(true),r=rt.refinedSurface!,p=r.partition,w=rt.water!,k=12,sea=Array.from({length:p.offset[k+1]-p.offset[k]},(_,i)=>p.offset[k]+i).filter(t=>p.sea[t]>0);
    r.landK.fill(273.15);r.seaK.fill(280);r.ice.fill(0);
    for(const t of sea.slice(0,sea.length/2)){r.lakeArea[t]=p.sea[t];r.seaK[t]=270;}
    r.aggregate();const before=w.oceanGlobalKgM2;r.phase(1800);assert.equal(w.oceanGlobalKgM2,before);assert.ok(r.ice.every(v=>v===0));
});
for(const classic of [false,true])test(`${classic?'classic migration':'fine quality'} preserves finite authored lakes and exact saved continuation`,()=>{
    const {mesh}=makeSphereMesh(1600,35,12345),grid=makeThermalGrid(8,4),rt=new ThermalRuntime(grid),elevation=new Float64Array(mesh.numRegions+mesh.numTriangles),inlandLakeId=new Int32Array(mesh.numTriangles);
    for(let a=0;a<mesh.numRegions;a++)elevation[a]=mesh.xyz_r[3*a]>0?-.2:.03;
    for(let t=0;t<mesh.numTriangles;t++){elevation[mesh.numRegions+t]=mesh.xyz_t[3*t]>0?-.2:.03;if(elevation[mesh.numRegions+t]<0&&mesh.xyz_t[3*t+1]>0&&mesh.xyz_t[3*t+2]>0)inlandLakeId[t]=1;}
    const source={mesh,directions:mesh.xyz_r,elevation,drainage:{inlandLakeId,basinId:new Int32Array(mesh.numTriangles),terminal:new Uint8Array(mesh.numTriangles)}},sample=sampleTerrainGrid(grid,mesh.xyz_r,elevation);
    rt.enabled=rt.waterEnabled=true;rt.config.separateReservoirs=true;rt.environmentConfig.terrainWater=true;rt.setTerrain(sample.landFraction,sample.landElevation,source);if(!classic)rt.refinement='balanced';rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);
    const w=rt.water!;
    if(classic){const route=w.routing!,t=route.network.inlandLakeId!.findIndex((id,t)=>id>0&&route.network.cell[t]>=0&&w.land[route.network.cell[t]]===0);assert.ok(t>=0);w.surfaceKgM2[route.network.cell[t]]+=10;w.oceanGlobalKgM2-=10/grid.count;route.synchronize(w);}
    else{const r=rt.refinedSurface!,t=r.lakeArea.findIndex((v,i)=>v>0&&r.partition.land[i]===0);assert.ok(t>=0);r.surface[t]+=10;w.oceanGlobalKgM2-=10/grid.count;r.aggregate();r.route(0);}
    const volume=()=>{const route=rt.water!.routing!;return route.volumeM3.reduce((sum,v,i)=>sum+((route.network.inlandLakeId?.[i]??0)>0?v:0),0);};
    const before=volume(),ocean=w.oceanGlobalKgM2,energy=rt.model!.energy(),air=rt.model!.temperatureK.slice();rt.enableRefinement('high');
    assert.ok(Math.abs(volume()-before)<before*1e-14);assert.equal(rt.water!.oceanGlobalKgM2,ocean);assert.deepEqual(rt.model!.temperatureK,air);assert.ok(Math.abs(rt.model!.energy()-energy)<.001);
    const restored=ThermalRuntime.fromSnapshot(rt.snapshot(),DEFAULT_PLANET,DEFAULT_ORBIT);restored.attachRestoredTerrain(sample.landFraction,sample.landElevation,source);
    const target=rt.model!.timeS+rt.model!.stepS;rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,target,null);restored.sync(DEFAULT_PLANET,DEFAULT_ORBIT,target,null);assert.deepEqual(restored.snapshot(),rt.snapshot());
});
test('extreme procedural relief keeps nonnegative heat and a saveable stable step',()=>{
    const rt=fixture();rt.invalidate();const planet={...DEFAULT_PLANET,reliefM:100000};rt.sync(planet,DEFAULT_ORBIT,0,0);
    assert.ok(rt.refinedSurface!.landK.every(t=>Number.isFinite(t)&&t>=0));
    const saved=rt.snapshot(),restored=ThermalRuntime.fromSnapshot(saved,planet,DEFAULT_ORBIT);assert.deepEqual(restored.snapshot(),saved);
});
test('surface budgets reject an unsaveable generic refinement before allocation',()=>{
    const grid=makeThermalGrid(128,32);assert.throws(()=>makeSurfacePartition(grid,new Float64Array(4096).fill(.5),new Float64Array(4096),null,10000,'high'),/budget/);
});
