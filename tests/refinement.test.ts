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
function fixture(coast=false,transport=false,refined=true,coastThreshold=4,conductive=false) {
    const g=makeThermalGrid(8,4),rt=new ThermalRuntime(g);
    rt.enabled=rt.waterEnabled=true;rt.config.separateReservoirs=true;
    if(conductive)rt.environmentConfig.conductiveSeaIce=true;
    if(transport)rt.waterConfig.moistureScheme='transport';
    const directions:number[]=[],elevation:number[]=[];
    for(let j=0;j<32;j++)for(let x=0;x<64;x++) {
        directions.push(...uvToDirection((x+.5)/64,Math.acos(1-2*(j+.5)/32)/Math.PI));
        elevation.push(coast&&x%8>=coastThreshold?-.2:x%8>=4?.65:.005);
    }
    rt.setTerrain(new Float64Array(g.count).fill(coast?.5:1),new Float64Array(g.count).fill(coast?.005:.3275),{directions,elevation});
    if(refined)rt.refinement='balanced';rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);return rt;
}
test('refined surface closures preserve stocks and sunlight separately on mixed coast patches',()=>{
    const rt=fixture(true,false,true,3,true),r=rt.refinedSurface!,m=rt.model!,p=r.partition;
    rt.configureSurfacePhysics({separateSurfaceAlbedo:true,liquidOceanEvaporation:true});
    const k=p.land.findIndex((l,t)=>l>0&&p.sea[t]>0&&r.snow[t]>=30*l&&r.ice[t]===0);assert.ok(k>=0,'fixture must exercise snow beside open water in a mixed patch');
    const parent=p.parent[k];
    assert.equal((r as any).seaAlbedo[k],m.orbit.bondAlbedo);assert.ok((r as any).landAlbedo[k]>.6);
    const restored=ThermalRuntime.fromSnapshot(rt.snapshot(),DEFAULT_PLANET,DEFAULT_ORBIT);assert.deepEqual(restored.model!.surfaceAlbedo,m.surfaceAlbedo);
    const before=rt.environment!.enthalpy(),radiation=r.stepSurface(parent,m.stepS,300);r.phase(m.stepS);
    assert.ok(Math.abs(rt.environment!.enthalpy()-before-radiation*m.stepS/m.grid.count)<.001);
});
test('refined conductive ice uses local thickness and records the ice surface heat balance',()=>{
    function growth(thickness:number) {
        const rt=fixture(true,false,true,4,true),r=rt.refinedSurface!,m=rt.model!,w=rt.water!,k=0;
        m.temperatureK.fill(240);r.seaK.fill(271.35);
        const total=w.diagnostics().totalMm;
        r.ice.set(r.partition.sea.map(a=>a*917*thickness));r.aggregate();w.oceanGlobalKgM2+=total-w.diagnostics().totalMm;
        const before=w.seaIceKgM2[k],enthalpy=rt.environment!.enthalpy();
        const radiation=r.stepSurface(k,m.stepS,0);r.phase(m.stepS);
        assert.ok(Math.abs(rt.environment!.enthalpy()-enthalpy-radiation*m.stepS/m.grid.count)<.001);
        assert.ok(Math.abs(w.diagnostics().residualMm)<1e-7);
        const d=rt.environment!.seaIceHeat!;assert.ok(d.iceArea[k]>0);assert.ok(d.skinK[k]<271.35);
        assert.ok(Math.abs(d.balanceResidualWm2[k])<1e-8);
        return w.seaIceKgM2[k]-before;
    }
    const thin=growth(.5),thick=growth(2);assert.ok(thin>0&&thick<thin*.7);
});
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
test('explicit coastal precipitation deposits only its land share in refined soil and snow',()=>{
    const rt=fixture(true),r=rt.refinedSurface!,w=rt.water!,k=12;
    r.landK.fill(270);rt.model!.temperatureK.fill(270);r.aggregate();const before=w.diagnostics().totalMm,snow=w.snowKgM2[k],ocean=w.oceanGlobalKgM2;
    const frozen=r.precipitate(k,10,1800,8);r.aggregate();
    assert.ok(Math.abs(frozen-8)<1e-12);assert.ok(Math.abs(w.snowKgM2[k]-snow-8)<1e-12);
    assert.ok(Math.abs(w.oceanGlobalKgM2-ocean-2/w.grid.count)<1e-9);
    assert.ok(Math.abs(w.diagnostics().totalMm-before-10/w.grid.count)<1e-9);
});
test('changing refined quality retains the recorded transport land deposition and exact continuation',()=>{
    const rt=fixture(true,true),r=rt.refinedSurface!,w=rt.water!;
    const inventory=w.diagnostics().totalMm;
    r.landK.fill(260);r.seaK.fill(305);rt.model!.temperatureK.fill(260);w.atmosphereKgM2.fill(20);r.aggregate();
    // Define a cold-air test fixture with a finite ocean donor, then start
    // its heat ledger before any actual step; do not hide integration errors.
    w.oceanGlobalKgM2+=inventory-w.diagnostics().totalMm;
    (rt.environment as any).initialEnthalpy=rt.environment!.enthalpy()-rt.model!.radiationJm2;
    rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,rt.model!.timeS+rt.model!.stepS,null);
    assert.ok(w.snowfallKgM2S!.some(p=>p>0));const land=w.landPrecipitationKgM2S.slice(),sea=w.oceanPrecipitationKgM2S.slice();
    rt.enableRefinement('high');assert.deepEqual(rt.water!.landPrecipitationKgM2S,land);assert.deepEqual(rt.water!.oceanPrecipitationKgM2S,sea);
    const restored=ThermalRuntime.fromSnapshot(rt.snapshot(),DEFAULT_PLANET,DEFAULT_ORBIT);
    const target=rt.model!.timeS+rt.model!.stepS;rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,target,null);restored.sync(DEFAULT_PLANET,DEFAULT_ORBIT,target,null);
    assert.deepEqual(restored.snapshot(),rt.snapshot());
});
for(const remap of [false,true])test(`old terrain-weighted transport rain ${remap?'after coastal remap ':''}survives load-save-load and exact continuation`,()=>{
    const rt=fixture(true,true,true,remap?3:4),r=rt.refinedSurface!,w=rt.water!,inventory=w.diagnostics().totalMm;
    r.landK.fill(260);r.seaK.fill(remap?260:305);rt.model!.temperatureK.fill(260);w.atmosphereKgM2.fill(20);r.aggregate();
    w.oceanGlobalKgM2+=inventory-w.diagnostics().totalMm;
    (rt.environment as any).initialEnthalpy=rt.environment!.enthalpy()-rt.model!.radiationJm2;
    // Reproduce the old surface solver's real deposition law, which did not
    // accept a separate land amount. Both mass and latent heat still advance.
    const precipitate=r.precipitate.bind(r);r.precipitate=(k,rain,dt)=>precipitate(k,rain,dt);
    rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,rt.model!.timeS+rt.model!.stepS,null);
    if(remap)rt.enableRefinement('high');
    const saved=rt.snapshot(),fine=saved.state!.refined!,p=fine.partition,expected=new Float64Array(rt.grid.count);
    delete saved.state!.water!.landPrecipitationKgM2S;
    for(let t=0;t<p.parent.length;t++)expected[p.parent[t]]+=fine.rain[t]*p.land[t]/(p.land[t]+p.sea[t]);
    if(remap)assert.ok(expected.some((v,k)=>v<saved.state!.water!.snowfallKgM2S![k]-1e-12),'Old remapping makes the rain-only split unrecoverable');
    else assert.ok(expected.some((v,k)=>v>w.precipitationKgM2S[k]*w.land[k]+1e-12));
    const restored=ThermalRuntime.fromSnapshot(saved,DEFAULT_PLANET,DEFAULT_ORBIT);
    assert.equal(restored.water!.landPrecipitationKnown,false);
    assert.equal('landPrecipitationKgM2S' in restored.snapshot().state!.water!,false,'Do not persist a fabricated split');
    for(let k=0;k<rt.grid.count;k++)assert.ok(Math.abs(restored.water!.landPrecipitationKgM2S[k]-Math.min(saved.state!.water!.precipitationKgM2S[k],Math.max(saved.state!.water!.snowfallKgM2S![k],expected[k])))<1e-12);
    const shown=restored.model!.timeS,beforeRollback=restored.snapshot();
    restored.sync(DEFAULT_PLANET,DEFAULT_ORBIT,shown+restored.model!.stepS,shown);
    assert.equal(restored.water!.landPrecipitationKnown,true);
    restored.sync(DEFAULT_PLANET,DEFAULT_ORBIT,shown,shown);
    assert.equal(restored.water!.landPrecipitationKnown,false,'Presented-frame rollback must retain unknown allocation');
    assert.deepEqual(restored.snapshot(),beforeRollback);
    const twice=ThermalRuntime.fromSnapshot(restored.snapshot(),DEFAULT_PLANET,DEFAULT_ORBIT);
    assert.deepEqual(twice.snapshot(),restored.snapshot());
    const target=restored.model!.timeS+restored.model!.stepS;
    restored.sync(DEFAULT_PLANET,DEFAULT_ORBIT,target,null);twice.sync(DEFAULT_PLANET,DEFAULT_ORBIT,target,null);
    assert.equal(restored.water!.landPrecipitationKnown,true);assert.ok(restored.snapshot().state!.water!.landPrecipitationKgM2S);
    assert.deepEqual(twice.snapshot(),restored.snapshot());
});
test('first refinement retains recorded land and ocean precipitation without changing stocks',()=>{
    const rt=fixture(true,true,false),w=rt.water!,before=w.checkpoint();
    w.precipitationKgM2S.fill(10);w.landPrecipitationKgM2S.fill(8);w.oceanPrecipitationKgM2S.fill(2);
    rt.enableRefinement('balanced');const r=rt.refinedSurface!,p=r.partition,land=new Float64Array(rt.grid.count),sea=land.slice();
    assert.ok(p.land.every((l,t)=>l===0||p.sea[t]===0),'Fixture resolves separate land and sea patches');
    for(let t=0;t<p.parent.length;t++){land[p.parent[t]]+=r.rain[t]*p.land[t]/(p.land[t]+p.sea[t]);sea[p.parent[t]]+=r.rain[t]*p.sea[t]/(p.land[t]+p.sea[t]);}
    for(let k=0;k<rt.grid.count;k++){assert.ok(Math.abs(land[k]-8)<1e-12);assert.ok(Math.abs(sea[k]-2)<1e-12);}
    for(const key of ['atmosphereKgM2','soilKgM2','surfaceKgM2','snowKgM2','seaIceKgM2','landIceKgM2'] as const)
        for(let k=0;k<rt.grid.count;k++)assert.ok(Math.abs(w[key][k]-before[key][k])<=8*Number.EPSILON*Math.max(1,before[key][k]),'Only patch aggregation roundoff');
    assert.equal(w.oceanGlobalKgM2,before.oceanGlobalKgM2);
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
