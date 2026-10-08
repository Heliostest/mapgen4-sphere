import test from 'node:test';
import assert from 'node:assert/strict';
import {makeThermalGrid} from '../thermal.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {WaterModel,DEFAULT_WATER,moistureCapacity} from '../water.ts';

const grid=makeThermalGrid(16,8),n=grid.count;
const field=(value:number)=>new Float64Array(n).fill(value);
const mixed=Float64Array.from({length:n},(_,i)=>i%3?1:0);
const model=(land=mixed,config={},radius=DEFAULT_PLANET.radiusM,height=field(0))=>new WaterModel(grid,radius,land,height,field(288.15),{...DEFAULT_WATER,...config});
const near=(a:number,b:number,tol=1e-8)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);

test('water columns initialize with finite stores and physical area',()=>{
    const m=model();near(m.cellAreaM2*n,4*Math.PI*DEFAULT_PLANET.radiusM**2,.1);
    near(m.atmosphereKgM2[1],10);near(m.soilKgM2[1],75);near(m.soilKgM2[0],0);
    near(m.diagnostics().residualMm,0);
    assert.throws(()=>model(mixed,{soilCapacityKgM2:0}),RangeError);
    assert.throws(()=>model(mixed,{windMps:Infinity}),RangeError);
    assert.throws(()=>new WaterModel(grid,1,field(1.1),field(0),field(288),DEFAULT_WATER),RangeError);
});
test('evaporation draws only from available water and never exceeds solar demand',()=>{
    const m=model(field(0),{initialOceanDepthM:0});
    m.step(60,field(288.15),field(1000));
    assert.ok(m.evaporationKgM2S.every(v=>v===0));near(m.oceanGlobalKgM2,0);
    const wet=model(field(0));wet.step(60,field(288.15),field(100));
    assert.ok(wet.evaporationKgM2S.every(v=>v>0 && v<=.5*100/2.45e6));
    near(wet.diagnostics().residualMm,0,1e-7);
});
test('vapor diffusion and zonal drift cross the seam without polar leakage',()=>{
    const m=model(field(1),{evaporationFraction:0,windMps:10});
    m.atmosphereKgM2.fill(0);m.atmosphereKgM2[15]=1;
    const before=m.diagnostics().totalMm;m.step(Math.min(500,m.maxStepS),field(300),field(0));
    assert.ok(m.atmosphereKgM2[0]>0);assert.ok(m.atmosphereKgM2.every(v=>v>=0));
    near(m.diagnostics().totalMm,before);
});
test('rain fills soil then surface storage, with a closed total budget',()=>{
    const m=model(field(1),{evaporationFraction:0,windMps:0,moistureDiffusivityM2s:0});
    m.soilKgM2.fill(150);m.atmosphereKgM2.fill(100);
    const before=m.diagnostics().totalMm;m.step(1800,field(273.15),field(0));
    assert.ok(m.precipitationKgM2S.every(v=>v>0));
    assert.ok(m.surfaceKgM2.some(v=>v>0));assert.ok(m.soilKgM2.every(v=>v<=150));
    near(m.diagnostics().totalMm,before);
});
test('closed land depressions retain water then spill once their hydraulic head rises',()=>{
    const h=field(2);h[grid.width*3+4]=0;
    const m=model(field(1),{evaporationFraction:0},DEFAULT_PLANET.radiusM,h),sink=grid.width*3+4;
    m.surfaceKgM2[sink]=1000;let before=m.diagnostics().totalMm;
    m.routeSurface(1800);near(m.surfaceKgM2[sink],1000);near(m.oceanGlobalKgM2,0);
    m.surfaceKgM2[sink]=3000;before=m.diagnostics().totalMm;
    m.routeSurface(1800);assert.ok(m.surfaceKgM2[sink]<3000);assert.ok(m.dischargeM3S[sink]>0);
    near(m.diagnostics().totalMm,before);near(m.oceanGlobalKgM2,0);
});
test('all-ocean has no soil or river discharge; all-land cannot invent an ocean sink',()=>{
    for(const land of [field(0),field(1)]) {
        const m=model(land);
        for(let i=0;i<200;i++)m.step(Math.min(900,m.maxStepS),field(285),field(180));
        assert.ok(m.soilKgM2.every(v=>v>=0));assert.ok(m.surfaceKgM2.every(v=>v>=0));
        near(m.diagnostics().residualMm,0,1e-6);
        if(land[0]===0) {assert.ok(m.dischargeM3S.every(v=>v===0));assert.ok(m.soilKgM2.every(v=>v===0));}
        else near(m.oceanGlobalKgM2,0);
    }
});
test('mixed coast routing conserves its ocean and terrestrial shares',()=>{
    const m=model(field(.5),{},DEFAULT_PLANET.radiusM,field(1));m.surfaceKgM2.fill(100);
    const before=m.diagnostics().totalMm,ocean=m.oceanGlobalKgM2;
    m.routeSurface(1800);assert.ok(m.oceanGlobalKgM2>ocean);near(m.diagnostics().totalMm,before,1e-7);
    assert.ok(m.surfaceKgM2.every(v=>v>=0));
});
test('a coastal outlet cannot lift water onto its high land fraction',()=>{
    const land=field(1),h=field(1000);land[1]=.5;h[0]=1;
    const m=model(land,{},DEFAULT_PLANET.radiusM,h);m.surfaceKgM2[0]=100;
    const before=m.diagnostics().totalMm,ocean=m.oceanGlobalKgM2;
    m.routeSurface(1800);
    near(m.surfaceKgM2[1],0);assert.ok(m.oceanGlobalKgM2>ocean);
    near(m.diagnostics().totalMm,before);
});
test('discharge is actual transferred volume per second with radius-aware area',()=>{
    const h=field(10);h[1]=0;const m=model(field(1),{},DEFAULT_PLANET.radiusM,h);
    m.surfaceKgM2[0]=100;const before=m.surfaceKgM2[0],dt=1800;m.routeSurface(dt);
    near(m.dischargeM3S[0],(before-m.surfaceKgM2[0])*m.cellAreaM2/1000/dt,1e-6);
    near(model(field(1),{},2*DEFAULT_PLANET.radiusM).cellAreaM2,4*m.cellAreaM2,.01);
});
test('paired solar-driven water cycle conserves global inventory through many steps',()=>{
    const m=model();
    for(let i=0;i<2000;i++)m.step(Math.min(900,m.maxStepS),Float64Array.from({length:n},(_,k)=>280+10*Math.sin(k+i/500)),field(220));
    const d=m.diagnostics();assert.ok(d.rainMmDay>0);assert.ok(d.evaporationMmDay>0);
    assert.ok(Math.abs(d.residualMm)<1e-6,JSON.stringify(d));
    for(const a of [m.atmosphereKgM2,m.soilKgM2,m.surfaceKgM2]) assert.ok(a.every(v=>Number.isFinite(v)&&v>=0));
});
test('stable water time step, refinement and checkpoint restore remain coherent',()=>{
    const a=model(),b=model(),c=model();
    const dt=Math.min(600,a.maxStepS/2),steps=200;
    for(const [m,factor] of [[a,1],[b,2],[c,4]] as const) for(let k=0;k<steps*factor;k++)m.step(dt/factor,field(290),field(250));
    const error=(m:WaterModel)=>m.atmosphereKgM2.reduce((sum,v,i)=>sum+Math.abs(v-c.atmosphereKgM2[i]),0);
    assert.ok(error(b)<error(a));
    const saved=a.checkpoint();a.step(dt,field(290),field(250));a.restore(saved);
    assert.deepEqual(a.atmosphereKgM2,saved.atmosphereKgM2);near(a.diagnostics().residualMm,0,1e-6);
    assert.throws(()=>a.step(a.maxStepS*2,field(288),field(100)),RangeError);
    assert.ok(model(mixed,{},10000).maxStepS<a.maxStepS);
    assert.ok(Number.isFinite(moistureCapacity(1000)) && moistureCapacity(0)>0);
});
