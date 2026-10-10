import test from 'node:test';
import assert from 'node:assert/strict';
import {TerrainWater,terrainRoutingNetwork,type RoutingNetwork} from '../terrain-water.ts';
import {makeSphereMesh} from '../sphere-mesh.ts';
import {ThermalRuntime} from '../thermal-runtime.ts';
import {makeThermalGrid,sampleTerrainGrid} from '../thermal.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';
import {triangleStorageDepth,lakeSurfaceLevel,terrainWaterView} from '../terrain-water-view.ts';
import {WaterModel,DEFAULT_WATER} from '../water.ts';
import {channelNetwork,channelDischarge,riverChannelField} from '../river-channels.ts';

test('channel tributaries accumulate area-weighted runoff through a dry downstream cell',()=>{
    const {mesh}=makeSphereMesh(4,35,12345),side=(from:number,to:number)=>{
        const s=[0,1,2].map(j=>3*from+j).find(s=>mesh.t_outer_s(s)===to);assert.notEqual(s,undefined);return s!;
    };
    const network:RoutingNetwork={cell:new Int32Array([-1,0,1,2]),areaM2:new Float64Array(4).fill(1e6),bedM:new Float64Array([0,1,2,3]),neighbors:[[],[],[],[]]};
    const channels={receiverSide:new Int32Array([-1,side(1,0),side(2,1),side(3,1)]),order:new Int32Array([0,1,2,3]),fillDepthM:new Float64Array(4)};
    const runoff=new Float64Array([0,0,172.8,259.2]); // 2 + 3 m³/s, no local rain at the confluence.
    assert.deepEqual(Array.from(channelDischarge(mesh,network,channels,runoff)),[5,5,2,3]);
    assert.deepEqual(Array.from(runoff),[0,0,172.8,259.2]);
});

test('reference drainage is acyclic, reaches its outlets and never edits the measured DEM',()=>{
    const {mesh}=makeSphereMesh(120,35,12345),n=mesh.numTriangles;
    const network:RoutingNetwork={cell:new Int32Array(n).fill(0),areaM2:new Float64Array(n).fill(1e6),bedM:Float64Array.from({length:n},(_,t)=>100+80*Math.sin(t)),neighbors:Array.from({length:n},()=>[])};
    network.cell[0]=-1;network.bedM[0]=0;const before=network.bedM.slice(),channels=channelNetwork(mesh,network);
    assert.deepEqual(network.bedM,before);assert.equal(new Set(channels.order).size,n);
    assert.ok(channels.fillDepthM.some(d=>d>0));
    for(let t=1;t<n;t++) {
        let next=t,steps=0;
        while(channels.receiverSide[next]>=0&&steps<=n){next=mesh.t_outer_s(channels.receiverSide[next]);steps++;}
        assert.equal(next,0);assert.ok(steps<n);
    }
    network.cell.fill(0);const closed=channelNetwork(mesh,network);
    assert.equal(Array.from(closed.receiverSide).filter(s=>s<0).length,1,'An oceanless world still has a terminating sink');
});

function fixture() {
    const network:RoutingNetwork={cell:new Int32Array([0,1]),areaM2:new Float64Array([100,100]),bedM:new Float64Array([0,0]),neighbors:[[{to:1,sillM:2,distanceM:10,side:0}],[{to:0,sillM:2,distanceM:10,side:1},{to:-1,sillM:3,distanceM:10,side:2}]]};
    const water={grid:{count:2},cellAreaM2:100,surfaceKgM2:new Float64Array([1000,0]),dischargeM3S:new Float64Array(2),oceanGlobalKgM2:0};
    return {network,water,route:new TerrainWater(network,water)};
}
const total=(w:ReturnType<typeof fixture>['water'])=>w.oceanGlobalKgM2+(w.surfaceKgM2[0]+w.surfaceKgM2[1])/2;

test('unified surface has climate-fed channels before Play without inventing reservoir water',()=>{
    const {mesh}=makeSphereMesh(1500,35,12345),rt=new ThermalRuntime(makeThermalGrid(24,12));
    const elevation=Float32Array.from({length:mesh.numRegions+mesh.numTriangles},(_,i)=>{
        const p=i<mesh.numRegions?mesh.xyz_r:mesh.xyz_t,j=i<mesh.numRegions?i:i-mesh.numRegions;
        return .04+.09*p[3*j+2]+.02*p[3*j];
    });
    const source={mesh,directions:mesh.xyz_r,elevation},sample=sampleTerrainGrid(rt.grid,mesh.xyz_r,elevation);
    rt.enabled=rt.waterEnabled=true;rt.environmentConfig.terrainWater=true;
    rt.setTerrain(sample.landFraction,sample.landElevation,source);rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);
    // No instantaneous edge transfer yet: a reference river should still exist.
    const w=rt.water!;w.routing!.fluxM3S.fill(0);w.routing!.receiverSide.fill(-1);
    const before=w.checkpoint(),view=terrainWaterView(rt)!;
    assert.ok(view.riverTriangles>0,'Generated climate must provide continuous reference rivers at day zero');
    assert.deepEqual(w.checkpoint(),before,'Rendering must not add or transfer reservoir water');
    assert.equal(rt.model!.timeS,0);
    const channels=riverChannelField(rt);
    for(let t=0;t<mesh.numTriangles;t++)if(channels.receiverSide[t]>=0)assert.ok(channels.flowM3S[mesh.t_outer_s(channels.receiverSide[t])]+1e-9>=channels.flowM3S[t]);
    const restored=ThermalRuntime.fromSnapshot(rt.snapshot(),DEFAULT_PLANET,DEFAULT_ORBIT);
    restored.attachRestoredTerrain(sample.landFraction,sample.landElevation,source);
    assert.deepEqual(terrainWaterView(restored)!.rivers,view.rivers,'Saved climate reconstructs the same channels');
    const saved=view.rivers.slice();
    w.precipitationKgM2S.fill(0);w.meltKgM2S.fill(0);w.soilKgM2.fill(0);w.surfaceKgM2.fill(0);rt.model!.steps++;
    assert.equal(terrainWaterView(rt)!.riverTriangles,0,'A dry world cannot retain decorative blue rivers');
    assert.deepEqual(view.rivers,saved,'Previously queued frames remain immutable');
    w.meltKgM2S.fill(.005);rt.model!.temperatureK.fill(280);rt.model!.steps++;
    assert.ok(terrainWaterView(rt)!.riverTriangles>0,'Melt must restore channel flow without rainfall');
    rt.surfaceState()!.landIceKgM2!.fill(9170);rt.model!.steps++;
    assert.equal(terrainWaterView(rt)!.riverTriangles,0,'Grounded ice covers the blue river overlay');
});
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
test('nearly drained terrain reservoirs keep the authoritative coarse water nonnegative',()=>{
    const {mesh}=makeSphereMesh(120,35,12345),grid=makeThermalGrid(24,12),radiusM=6371008.4;
    const elevation=Float32Array.from({length:mesh.numRegions+mesh.numTriangles},(_,i)=>{
        const xyz=i<mesh.numRegions?mesh.xyz_r:mesh.xyz_t,j=i<mesh.numRegions?i:i-mesh.numRegions;
        return .01+.015*xyz[3*j+1]+.009*xyz[3*j];
    });
    const quads=new Int32Array(mesh.numSides*3);
    for(let s=0;s<mesh.numSides;s++)quads.set([mesh.r_begin_s(s),mesh.numRegions+mesh.t_outer_s(s),mesh.numRegions+mesh.t_inner_s(s)],3*s);
    const sample=sampleTerrainGrid(grid,mesh.xyz_r,elevation),zero=new Float64Array(grid.count),temperature=new Float64Array(grid.count).fill(300);
    const config={...DEFAULT_WATER,initialOceanDepthM:0,evaporationFraction:0,windMps:0,moistureDiffusivityM2s:0,routingSpeedMps:10};
    const reference={temperatureK:temperature,radiationScale:new Float64Array(grid.count).fill(1),absorbedWm2:zero,
        windEastMps:zero,windNorthMps:zero,rainMmDay:zero,evaporationMmDay:zero,soilFraction:zero,humidityFraction:zero,surfaceMm:Float64Array.from({length:grid.count},(_,k)=>k%7)};
    const water=new WaterModel(grid,radiusM,sample.landFraction,sample.landElevation.map(h=>h*10000),temperature,config,reference);
    const network=terrainRoutingNetwork(mesh,elevation,grid,radiusM,10000,quads);water.attachRouting(network);
    const route=water.routing!;
    for(let step=0;step<2500;step++) {
        water.step(1800,temperature,zero);
        assert.ok(water.surfaceKgM2.every(v=>v>=0),`Negative coarse water after drainage step ${step}`);
        assert.ok(route.volumeM3.every(v=>v>=0));
    }
    assert.ok(Math.abs(water.diagnostics().residualMm)<1e-10);
    assert.ok(Math.abs(route.diagnostics(water).partitionResidualM3)*1000/(grid.count*water.cellAreaM2)<1e-10);
    const restored=new WaterModel(grid,radiusM,sample.landFraction,sample.landElevation.map(h=>h*10000),temperature,config,undefined,water.initialTotalMm);
    restored.restore(water.checkpoint());restored.attachRouting(network);
    assert.deepEqual(restored.checkpoint(),water.checkpoint());
    for(let j=0;j<20;j++){water.step(1800,temperature,zero);restored.step(1800,temperature,zero);}
    assert.deepEqual(restored.checkpoint(),water.checkpoint());
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
test('successive shoreline frames retain water height, wetness, seams and independent render buffers',()=>{
    const {mesh}=makeSphereMesh(120,35,12345),rt=new ThermalRuntime(makeThermalGrid(8,4));
    const elevation=new Float32Array(mesh.numRegions+mesh.numTriangles).fill(.01);
    const sample=sampleTerrainGrid(rt.grid,mesh.xyz_r,elevation);
    rt.enabled=rt.waterEnabled=true;rt.environmentConfig.terrainWater=true;
    rt.setTerrain(sample.landFraction,sample.landElevation,{mesh,directions:mesh.xyz_r,elevation});rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);
    const w=rt.water!,route=w.routing!;
    const frame=(depth:number,soil:number)=>{
        for(let t=0;t<mesh.numTriangles;t++)route.volumeM3[t]=depth*route.network.areaM2[t];
        w.soilKgM2.fill(soil*w.config.soilCapacityKgM2);rt.model!.steps++;
        return terrainWaterView(rt)!;
    };
    assert.equal(frame(0,0).lakes.length,0);
    const wet=frame(0,1);assert.ok(wet.lakes.length>mesh.numTriangles*3*3*5,'Atlas retains seam and pole copies');
    for(let i=0;i<wet.lakes.length;i+=5){assert.equal(wet.lakes[i+3],-1);assert.equal(wet.lakes[i+4],1);}
    const low=frame(2,1),saved=low.lakes.slice();
    for(let i=3;i<low.lakes.length;i+=5)assert.ok(Math.abs(low.lakes[i]-102)<1e-4);
    const high=frame(7,1);
    for(let i=0;i<high.lakes.length;i+=5) {
        assert.ok(Math.abs(high.lakes[i+3]-107)<1e-4);
        assert.deepEqual(high.lakes.subarray(i,i+3),low.lakes.subarray(i,i+3));
    }
    assert.deepEqual(low.lakes,saved,'A queued frame must not be overwritten by the next update');
    assert.equal(frame(0,0).lakes.length,0);
    assert.deepEqual(frame(2,1).lakes,low.lakes,'Rollback regenerates the same shoreline');
});
test('rendered shorelines preserve the triangular storage integral on sloping and tied beds',()=>{
    const {mesh}=makeSphereMesh(35,35,12345),elevation=new Float32Array(mesh.numRegions+mesh.numTriangles).fill(.01);
    const grid=makeThermalGrid(8,4),sample=sampleTerrainGrid(grid,mesh.xyz_r,elevation);
    for(const [heights,depth,head] of [
        [[6,0,3],.5,3],[[3,6,0],1/54,1],[[0,3,6],5,8],
        [[0,0,6],1.25,3],[[6,0,6],.25,3],[[2,2,2],3,5],
    ] as const) {
        const rt=new ThermalRuntime(grid);rt.enabled=rt.waterEnabled=true;rt.environmentConfig.terrainWater=true;
        rt.setTerrain(sample.landFraction,sample.landElevation,{mesh,directions:mesh.xyz_r,elevation});rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);
        const route=rt.water!.routing!;
        for(let t=0;t<mesh.numTriangles;t++) {
            for(const patch of route.network.bedPatches![t])patch.vertices.forEach((v,i)=>v[2]=heights[i]);
            route.volumeM3[t]=depth*route.network.areaM2[t];
        }
        const view=terrainWaterView(rt)!;assert.ok(view.lakes.length>0);
        for(let i=3;i<view.lakes.length;i+=5)assert.ok(Math.abs(view.lakes[i]-head)<1e-5,`Expected head ${head}, got ${view.lakes[i]}`);
    }
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
