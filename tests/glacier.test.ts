import test from 'node:test';
import assert from 'node:assert/strict';
import {GlacierModel,ICE_DENSITY,GLACIER_YEAR} from '../glacier.ts';
import {WaterModel,DEFAULT_WATER,FUSION_J_KG} from '../water.ts';
import {makeThermalGrid,ThermalModel,DEFAULT_THERMAL} from '../thermal.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';
import {EnvironmentModel,DEFAULT_ENVIRONMENT} from '../environment.ts';
import {ThermalRuntime} from '../thermal-runtime.ts';
const grid=makeThermalGrid(8,4),n=grid.count;
function fixture(land=1,radius=6371008.4) {
    const w=new WaterModel(grid,radius,new Float64Array(n).fill(land),new Float64Array(n).fill(100),new Float64Array(n).fill(260),DEFAULT_WATER);
    const g=new GlacierModel(w,9.81);return {w,g};
}
test('snow compaction and finite cold-start ice preserve water mass',()=>{
    const {w,g}=fixture(.5),before=w.diagnostics().totalMm;
    w.seedLandIce(new Float64Array(n).fill(100000));assert.ok(w.landIceKgM2.some(v=>v>0));assert.ok(Math.abs(w.diagnostics().totalMm-before)<1e-7);
    w.snowKgM2.fill(500);const mass=w.diagnostics().totalMm,ice=w.landIceKgM2[0];g.step(GLACIER_YEAR,new Float64Array(n).fill(260));
    assert.ok(w.landIceKgM2[0]>ice);assert.ok(w.snowKgM2[0]<500);assert.ok(Math.abs(w.diagnostics().totalMm-mass)<1e-7);
    const dry=fixture(1);dry.w.soilKgM2.fill(0);dry.w.surfaceKgM2.fill(0);dry.w.snowKgM2.fill(0);dry.w.seedLandIce(new Float64Array(n).fill(10000));assert.ok(dry.w.landIceKgM2.every(v=>v===0));
});
test('ice moves down its surface gradient, carries sediment and stays finite without mass loss',()=>{
    for(const radius of [6371008.4,1000]) {
        const {w,g}=fixture(1,radius);w.landIceKgM2[10]=ICE_DENSITY*1000;
        const before=w.diagnostics().totalMm;g.step(100*GLACIER_YEAR,new Float64Array(n).fill(260));
        assert.ok(w.landIceKgM2[10]<ICE_DENSITY*1000);assert.ok(w.landIceKgM2.some((v,i)=>i!==10&&v>0));
        assert.ok(w.landIceKgM2.every(v=>Number.isFinite(v)&&v>=0));assert.ok(Math.abs(w.diagnostics().totalMm-before)<1e-7);
        assert.ok(g.erodedM.some(v=>v>0));assert.ok(Math.abs(g.diagnostics().solidResidualM)<1e-10);
    }
    const ocean=fixture(0);ocean.g.step(GLACIER_YEAR,new Float64Array(n).fill(260));assert.ok(ocean.g.speedMps.every(v=>v===0));
});
test('land-ice melt enters runoff using actual available sensible heat',()=>{
    const {w}=fixture(.5),m=new ThermalModel(DEFAULT_PLANET,DEFAULT_ORBIT,DEFAULT_THERMAL,w.land,0,grid);
    w.seedLandIce(new Float64Array(n).fill(1000));m.temperatureK.fill(273.15);
    const e=new EnvironmentModel(m,w,{...DEFAULT_ENVIRONMENT,glaciers:true});m.temperatureK.fill(273.25);
    const mass=w.diagnostics().totalMm,h=e.enthalpy(),ice=w.landIceKgM2[0],expected=.1*m.capacity[0]/FUSION_J_KG;
    e.phase(1800);assert.ok(Math.abs(ice-w.landIceKgM2[0]-expected)<1e-8);assert.ok(w.meltKgM2S[0]>0);assert.ok(w.surfaceKgM2[0]>0);
    assert.ok(Math.abs(w.diagnostics().totalMm-mass)<1e-7);assert.ok(Math.abs(e.enthalpy()-h)<1e-5);
});
test('glacial flow and accumulated solid changes checkpoint exactly',()=>{
    const a=fixture(),b=fixture();a.w.landIceKgM2[10]=ICE_DENSITY*1000;a.g.step(GLACIER_YEAR,new Float64Array(n).fill(260));
    b.w.restore(a.w.checkpoint());b.g.restore(a.g.checkpoint());
    for(const x of [a,b])x.g.step(GLACIER_YEAR,new Float64Array(n).fill(260));
    assert.deepEqual(a.w.checkpoint(),b.w.checkpoint());assert.deepEqual(a.g.checkpoint(),b.g.checkpoint());
});
test('cold-climate ice, surface estimates and erosion continue exactly through JSON and visible rollback',()=>{
    const orbit={...DEFAULT_ORBIT,bondAlbedo:.55};
    const a=new ThermalRuntime(grid);a.enabled=a.waterEnabled=true;a.environmentConfig.glaciers=true;
    a.setTerrain(new Float64Array(n).fill(.5),Float64Array.from({length:n},(_,i)=>i%4*.2));a.sync(DEFAULT_PLANET,orbit,0,0);
    assert.ok(a.water!.landIceKgM2.some(v=>v>0),`Generate climate must allocate actual land ice; minimum warmest month ${Math.min(...a.snapshot().state!.surfaceReference.warmestTemperatureK)}`);
    assert.ok(a.sampleSurface(.5,0)!.landIceM>0);
    for(let i=0;i<20;i++)a.sync(DEFAULT_PLANET,orbit,a.model!.timeS+a.maxAdvanceS,a.model!.timeS);
    const saved=a.snapshot(),time=a.model!.timeS,b=ThermalRuntime.fromSnapshot(JSON.parse(JSON.stringify(saved,(_,v)=>ArrayBuffer.isView(v)?Array.from(v as Float64Array):v)),DEFAULT_PLANET,orbit);
    assert.deepEqual(b.snapshot(),saved);assert.deepEqual(b.surfaceTexture,a.surfaceTexture);
    a.sync(DEFAULT_PLANET,orbit,time+a.maxAdvanceS,time);a.sync(DEFAULT_PLANET,orbit,time,null);assert.deepEqual(a.snapshot(),saved);
    for(let i=0;i<20;i++)for(const rt of [a,b])rt.sync(DEFAULT_PLANET,orbit,rt.model!.timeS+rt.maxAdvanceS,rt.model!.timeS);
    assert.deepEqual(a.snapshot(),b.snapshot());assert.ok(Math.abs(a.water!.diagnostics().residualMm)<1e-7);assert.ok(Math.abs(a.environment!.diagnostics().energyResidualJm2)<1e-4,JSON.stringify({energy:a.environment!.diagnostics().energyResidualJm2,water:a.water!.diagnostics().residualMm,enthalpy:a.environment!.enthalpy(),initial:a.environment!.initialEnthalpy}));assert.ok(Math.abs(a.water!.glacier!.diagnostics().solidResidualM)<1e-10);
});
test('disabling water clears grounded ice display seeds and roundtrips a thermal-only world',()=>{
    const orbit={...DEFAULT_ORBIT,bondAlbedo:.55},rt=new ThermalRuntime(grid);rt.enabled=rt.waterEnabled=true;rt.environmentConfig.glaciers=true;
    rt.setTerrain(new Float64Array(n).fill(.5),new Float64Array(n).fill(.2));rt.sync(DEFAULT_PLANET,orbit,0,0);
    assert.ok(rt.water!.landIceKgM2.some(v=>v>0));rt.waterEnabled=false;rt.invalidate();rt.sync(DEFAULT_PLANET,orbit,0,0);
    const saved=rt.snapshot();assert.equal(saved.state!.initialLandIce,null);assert.equal(saved.state!.localLandIceSeed,null);assert.equal(rt.surfaceState()!.landIceKgM2,null);
    assert.deepEqual(ThermalRuntime.fromSnapshot(saved,DEFAULT_PLANET,orbit).snapshot(),saved);
});
