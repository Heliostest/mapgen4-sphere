import test from 'node:test';
import assert from 'node:assert/strict';
import {ThermalRuntime} from '../thermal-runtime.ts';
import {makeSurfaceGrid,surfaceCell} from '../surface-grid.ts';
import {makeThermalGrid} from '../thermal.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';
import {WaterModel,DEFAULT_WATER} from '../water.ts';
import {GlacierModel} from '../glacier.ts';
import {decodeIceInventory} from '../ice-inventory.ts';

const sg=makeSurfaceGrid(),g=makeThermalGrid(8,4);
function setup(depth=3500,separate=false,landFraction=.5) {
    const rt=new ThermalRuntime(g);rt.enabled=rt.waterEnabled=true;
    rt.config.separateReservoirs=separate;
    rt.environmentConfig.glaciers=true;rt.waterConfig.initialOceanDepthM=depth;
    rt.setTerrain(new Float64Array(g.count).fill(landFraction),new Float64Array(g.count).fill(.3));
    const groundedThicknessM=new Float64Array(sg.count),shelfThicknessM=new Float64Array(sg.count);
    const polar=surfaceCell(sg,.5,.05),tibet=surfaceCell(sg,.75,.32);
    groundedThicknessM[polar]=2000;shelfThicknessM[polar+1]=300;
    // A complete observed product takes precedence over inferred warmest-month ice.
    (rt as any).iceInventory={version:1,grid:{width:sg.width,height:sg.height},source:'test independent thickness and mask',groundedThicknessM,shelfThicknessM,bedrockM:new Float64Array(sg.count)};
    rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);
    return {rt,polar,tibet};
}
test('observed ice seeds finite conserved water, preserves ice-surface height and leaves unobserved control bare',()=>{
    const {rt,polar,tibet}=setup();
    const s=rt.surfaceState()!;
    assert.ok(s.landIceKgM2![polar]>917*1900,'Observed 2km ice must exist even when reference summer is warm');
    assert.equal(s.landIceKgM2![tibet],0,'Explicit zero thickness suppresses inferred Tibetan kilometre ice');
    assert.ok(Math.abs(rt.water!.diagnostics().residualMm)<1e-7);
    assert.equal(rt.snapshot().state!.localHeight[polar],.3,'Ice is not added again to authored surface DEM');
});
test('local ice surface obeys its phase boundary while air remains an independent diagnostic',()=>{
    const {rt}=setup(3500,true,.3),land=rt.surfaceState()!.land;
    let samples=0;
    for(let k=0;k<sg.count;k++) {
        const s=rt.sampleSurface((k%sg.width+.5)/sg.width,Math.floor(k/sg.width)/(sg.height-1))!;
        if(land[k]<.5&&s.seaIceFraction>0){assert.ok(s.surfaceTemperatureK!<=271.35+1e-10);samples++;}
        if(land[k]>=.5&&(s.snowFraction>0||s.landIceM>0||s.shelfIceM>0))assert.ok(s.surfaceTemperatureK!<=273.15+1e-10);
    }
    assert.ok(samples>0);
});
test('observations can be dormant with water off and retain mass when only ice flow is off',()=>{
    const {rt}=setup(3500,true);rt.environmentConfig.glaciers=false;rt.invalidate();
    assert.doesNotThrow(()=>rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,null));
    assert.ok(rt.water!.diagnostics().landIceMm>0);assert.equal(rt.water!.glacier,null);
    assert.doesNotThrow(()=>ThermalRuntime.fromSnapshot(rt.snapshot(),DEFAULT_PLANET,DEFAULT_ORBIT));
    rt.waterEnabled=false;rt.invalidate();assert.doesNotThrow(()=>rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,null));
    assert.ok(ThermalRuntime.fromSnapshot(rt.snapshot(),DEFAULT_PLANET,DEFAULT_ORBIT).iceInventory);
    const surface=rt.sampleSurface(.5,.05)!;
    assert.ok(Number.isFinite(surface.surfaceTemperatureK),'Inspect needs a finite surface estimate with water off');
    assert.equal(surface.shelfIceM,0);assert.equal(surface.shelfIceFraction,0);
});
test('restoration tolerates roundoff in albedo but rejects a material albedo change',()=>{
    const {rt}=setup(),snapshot=rt.snapshot();snapshot.state!.thermal.albedo[0]+=1.11e-16;
    assert.doesNotThrow(()=>ThermalRuntime.fromSnapshot(snapshot,DEFAULT_PLANET,DEFAULT_ORBIT));
    snapshot.state!.thermal.albedo[0]+=.001;
    assert.throws(()=>ThermalRuntime.fromSnapshot(snapshot,DEFAULT_PLANET,DEFAULT_ORBIT),/albedo/);
});
test('restoration rejects an altered initial grounded store that would change the saved glacier bed',()=>{
    const {rt}=setup(),snapshot=rt.snapshot();snapshot.state!.initialLandIce!.fill(0);
    assert.throws(()=>ThermalRuntime.fromSnapshot(snapshot,DEFAULT_PLANET,DEFAULT_ORBIT),/bedrock/);
});
test('observed ice and floating shelves survive strict restoration and next-step evolution',()=>{
    const {rt}=setup();
    const restored=ThermalRuntime.fromSnapshot(rt.snapshot(),DEFAULT_PLANET,DEFAULT_ORBIT);
    assert.ok(restored.iceInventory,'Observed data must survive restoration');
    assert.deepEqual(restored.iceInventory,rt.iceInventory);
    assert.deepEqual(restored.water!.checkpoint(),rt.water!.checkpoint());
    const dt=rt.model!.stepS;
    rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,dt,null);restored.sync(DEFAULT_PLANET,DEFAULT_ORBIT,dt,null);
    assert.deepEqual(restored.water!.checkpoint(),rt.water!.checkpoint());
});
test('grounded glacier slope uses compatible bed plus inventory, not ice surface plus ice again',()=>{
    const land=new Float64Array(g.count).fill(.5),heights=new Float64Array(g.count).fill(3000),temperature=new Float64Array(g.count).fill(260);
    const w=new WaterModel(g,DEFAULT_PLANET.radiusM,land,heights,temperature,{...DEFAULT_WATER,initialOceanDepthM:3500});
    const thickness=Float64Array.from({length:g.count},(_,i)=>i%2?2000:1000);
    w.seedLandIce(thickness.map(h=>h*917*.5));
    const ice=w.landIceKgM2.slice(),bed=heights.map((s,i)=>s-thickness[i]),glacier=new GlacierModel(w,9.82,bed);
    glacier.step(1800,temperature);
    assert.deepEqual(w.landIceKgM2,ice,'A flat initial ice surface has no double-counted thickness gradient');
    assert.ok(glacier.speedMps.every(v=>v===0));
});
test('observed ice configuration rejects overlapping classes, nonfinite thickness and missing ice bed datum',()=>{
    const {rt,polar}=setup(),s=structuredClone(rt.iceInventory!);
    s.shelfThicknessM[polar]=1;assert.throws(()=>decodeIceInventory(s),/overlap/);
    s.shelfThicknessM[polar]=0;s.groundedThicknessM[polar]=NaN;assert.throws(()=>decodeIceInventory(s),/groundedThicknessM/);
    s.groundedThicknessM[polar]=2000;s.bedrockM=Array.from(s.bedrockM);s.bedrockM[polar]=null;
    assert.throws(()=>decodeIceInventory(s),/bedrock/);
});
test('dry inventory limits observed ice mass instead of adding water',()=>{
    const {rt}=setup(0);
    assert.ok(rt.water!.diagnostics().landIceMm<100,'Dry planet cannot supply a kilometre ice sheet');
    assert.ok(Math.abs(rt.water!.diagnostics().residualMm)<1e-7);
});
test('finite shelf donor exhaustion leaves a nonnegative ocean and conserved total',()=>{
    const land=new Float64Array(g.count).fill(.5),w=new WaterModel(g,DEFAULT_PLANET.radiusM,land,new Float64Array(g.count),new Float64Array(g.count).fill(270),{...DEFAULT_WATER,initialOceanDepthM:.0002});
    const request=new Float64Array(g.count);request[0]=6.3*g.count;
    w.seedShelves(request,new Float64Array(g.count));
    assert.ok(w.oceanGlobalKgM2>=0,'Donor exhaustion must remain serializable');
    assert.ok(Math.abs(w.diagnostics().residualMm)<1e-10);
});
