import test from 'node:test';
import assert from 'node:assert/strict';
import {TerrainWater,terrainRoutingNetwork,type RoutingNetwork} from '../terrain-water.ts';
import {makeSphereMesh} from '../sphere-mesh.ts';
import {ThermalRuntime} from '../thermal-runtime.ts';
import {makeThermalGrid,sampleTerrainGrid} from '../thermal.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';
import {triangleStorageDepth,lakeSurfaceLevel} from '../terrain-water-view.ts';
import {WaterModel,DEFAULT_WATER} from '../water.ts';

function fixture() {
    const network:RoutingNetwork={cell:new Int32Array([0,1]),areaM2:new Float64Array([100,100]),bedM:new Float64Array([0,0]),neighbors:[[{to:1,sillM:2,distanceM:10,side:0}],[{to:0,sillM:2,distanceM:10,side:1},{to:-1,sillM:3,distanceM:10,side:2}]]};
    const water={grid:{count:2},cellAreaM2:100,surfaceKgM2:new Float64Array([1000,0]),dischargeM3S:new Float64Array(2),oceanGlobalKgM2:0};
    return {network,water,route:new TerrainWater(network,water)};
}
const total=(w:ReturnType<typeof fixture>['water'])=>w.oceanGlobalKgM2+(w.surfaceKgM2[0]+w.surfaceKgM2[1])/2;
test('closed terrain depressions hold real water until their sill is reached',()=>{
    const {route,water}=fixture();route.route(water,10,1);
    assert.equal(water.surfaceKgM2[0],1000);assert.equal(water.surfaceKgM2[1],0);assert.equal(water.oceanGlobalKgM2,0);
    water.surfaceKgM2[0]=5000;const initial=total(water);
    for(let i=0;i<100;i++)route.route(water,10,1);
    assert.ok(water.surfaceKgM2[1]>0);assert.equal(water.oceanGlobalKgM2,0);
    assert.ok(Math.abs(total(water)-initial)<1e-9);
    water.surfaceKgM2[0]+=10000;const wet=total(water);
    for(let i=0;i<500;i++)route.route(water,10000,10);
    assert.ok(water.oceanGlobalKgM2>0);assert.ok(water.surfaceKgM2.every(v=>v>=0));assert.ok(route.volumeM3.every(v=>v>=0));
    assert.ok(Math.abs(total(water)-wet)<1e-8);
});
test('rain, melt and evaporation reconcile the partition without a second water inventory',()=>{
    const {route,water}=fixture();water.surfaceKgM2[0]=3000;route.route(water,1,1);
    assert.ok(Math.abs(route.volumeM3.reduce((s,v)=>s+v,0)-water.surfaceKgM2.reduce((s,v)=>s+v,0)*.1)<1e-10);
    water.surfaceKgM2.fill(0);route.route(water,1,1);assert.equal(route.volumeM3.reduce((s,v)=>s+v,0),0);
});
test('terrain water checkpoint resumes exact volumes and fluxes independently',()=>{
    const a=fixture();a.water.surfaceKgM2[0]=10000;a.route.route(a.water,1,1);
    const b=fixture();Object.assign(b.water,structuredClone(a.water));b.route.restore(a.route.checkpoint(),b.water);
    for(let i=0;i<20;i++){a.route.route(a.water,10,1);b.route.route(b.water,10,1);}
    assert.deepEqual(a.route.checkpoint(),b.route.checkpoint());assert.deepEqual(a.water,b.water);
    b.route.volumeM3[0]+=1;assert.notEqual(a.route.volumeM3[0],b.route.volumeM3[0]);
});
test('authored mesh routing remains a conserved partition through climate evolution, rollback and reload',()=>{
    const {mesh}=makeSphereMesh(120,35,12345),grid=makeThermalGrid(8,4),elevation=new Float32Array(mesh.numRegions+mesh.numTriangles);
    for(let r=0;r<mesh.numRegions;r++)elevation[r]=.1+.25*mesh.xyz_r[3*r+1];
    for(let t=0;t<mesh.numTriangles;t++)elevation[mesh.numRegions+t]=.1+.25*mesh.xyz_t[3*t+1];
    const source={mesh,directions:mesh.xyz_r,elevation},sample=sampleTerrainGrid(grid,mesh.xyz_r,elevation),a=new ThermalRuntime(grid);
    a.enabled=a.waterEnabled=true;a.environmentConfig.terrainWater=true;a.setTerrain(sample.landFraction,sample.landElevation,source);a.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);
    for(let j=0;j<40;j++)a.sync(DEFAULT_PLANET,DEFAULT_ORBIT,a.model!.timeS+a.maxAdvanceS,a.model!.timeS);
    const saved=a.snapshot(),time=a.model!.timeS;
    const b=ThermalRuntime.fromSnapshot(JSON.parse(JSON.stringify(saved,(_,v)=>ArrayBuffer.isView(v)?Array.from(v as Float64Array):v)),DEFAULT_PLANET,DEFAULT_ORBIT);
    b.attachRestoredTerrain(sample.landFraction,sample.landElevation,source);assert.deepEqual(b.snapshot(),saved);
    a.sync(DEFAULT_PLANET,DEFAULT_ORBIT,time+a.maxAdvanceS,time);a.sync(DEFAULT_PLANET,DEFAULT_ORBIT,time,null);assert.deepEqual(a.snapshot(),saved);
    for(let j=0;j<40;j++)for(const rt of [a,b])rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,rt.model!.timeS+rt.maxAdvanceS,rt.model!.timeS);
    assert.deepEqual(a.snapshot(),b.snapshot());assert.ok(Math.abs(a.water!.diagnostics().residualMm)<1e-6);
    const d=a.water!.routing!.diagnostics(a.water!);assert.ok(Math.abs(d.partitionResidualM3)*1000/(grid.count*a.water!.cellAreaM2)<1e-9);
});
test('lake shoreline levels follow available volume and sloping terrain',()=>{
    assert.equal(triangleStorageDepth(12,10,10,10),2);
    assert.ok(Math.abs(triangleStorageDepth(1,0,1,2)-1/6)<1e-12);
    assert.equal(triangleStorageDepth(-1,0,1,2),0);
    assert.ok(Math.abs(lakeSurfaceLevel(2,[10,10,10],10)-12)<1e-5);
    const low=lakeSurfaceLevel(.01,[0,2,4],2),high=lakeSurfaceLevel(1,[0,2,4],2);
    assert.ok(high>low&&low>0&&low<2);
});
test('an authored center-to-center valley cannot become an invented ridge dam',()=>{
    const {mesh}=makeSphereMesh(120,35,12345),grid=makeThermalGrid(8,4),elevation=new Float32Array(mesh.numRegions+mesh.numTriangles).fill(.01),s=60,t=mesh.t_inner_s(s),to=mesh.t_outer_s(s),indices=new Int32Array(3*mesh.numSides);
    for(let j=0;j<mesh.numSides;j++)indices.set([mesh.r_begin_s(j),mesh.r_begin_s(mesh.s_opposite_s(j)),mesh.numRegions+mesh.t_inner_s(j)],3*j);
    elevation[mesh.numRegions+t]=.001;elevation[mesh.numRegions+to]=.0005;
    for(const j of [s,mesh.s_opposite_s(s)])indices.set([mesh.r_begin_s(j),mesh.numRegions+mesh.t_outer_s(j),mesh.numRegions+mesh.t_inner_s(j)],3*j);
    const network=terrainRoutingNetwork(mesh,elevation,grid,6371008.4,10000,indices),edge=network.neighbors[t].find(e=>e.side===s)!;
    assert.ok(edge.sillM<10&&edge.sillM>5,`Visible 10→5 m valley blocked by sill ${edge.sillM}`);
    assert.equal(network.bedPatches![t].length,4,'Valley sector must use the same split physical bed');
});
test('ocean, dry land and unresolved coastal cells keep their own inventory',()=>{
    for(const cell of [new Int32Array([-1,-1]),new Int32Array([0,0])]) {
        const {network,water}=fixture();network.cell=cell;network.neighbors=[[{to:1,sillM:0,distanceM:1,side:0}],[{to:0,sillM:0,distanceM:1,side:1}]];
        water.surfaceKgM2.set(cell[0]<0?[0,0]:[10,20]);const initial=total(water),route=new TerrainWater(network,water);
        for(let i=0;i<100;i++)route.route(water,1000,10);
        assert.equal(water.oceanGlobalKgM2,0);assert.ok(Math.abs(total(water)-initial)<1e-10);
        if(cell[0]<0)assert.equal(route.volumeM3.reduce((a,b)=>a+b,0),0);
        else {assert.equal(water.surfaceKgM2[1],20);assert.equal(route.diagnostics(water).unresolvedM3,2);}
    }
});
test('corrupt fine stores and out-of-network receivers cannot replace routing state',()=>{
    const {route,water}=fixture(),before=route.checkpoint();
    for(const mutate of [s=>s.volumeM3[0]++,s=>s.volumeM3[0]=-1,s=>s.receiverSide[0]=100]) {
        const bad=route.checkpoint();mutate(bad);assert.throws(()=>route.restore(bad,water));assert.deepEqual(route.checkpoint(),before);
    }
});
test('a pending restored fine partition cannot silently advance through coarse routing',()=>{
    const grid=makeThermalGrid(8,4),w=new WaterModel(grid,6371008.4,new Float64Array(32).fill(1),new Float64Array(32),new Float64Array(32).fill(280),DEFAULT_WATER);
    const state=w.checkpoint();state.routing={volumeM3:new Float64Array(1),fluxM3S:new Float64Array(1),receiverSide:new Int32Array([-1])};w.restore(state);
    assert.throws(()=>w.step(1,new Float64Array(32).fill(280),new Float64Array(32)),/attach.*terrain/i);
    w.restore({...state,routing:null});assert.doesNotThrow(()=>w.step(1,new Float64Array(32).fill(280),new Float64Array(32)));
});
