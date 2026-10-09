import test from 'node:test';
import assert from 'node:assert/strict';
import {makeThermalGrid,ThermalModel,DEFAULT_THERMAL} from '../thermal.ts';
import {WaterModel,DEFAULT_WATER} from '../water.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';
import {ThermalRuntime} from '../thermal-runtime.ts';
import {EnvironmentModel,DEFAULT_ENVIRONMENT} from '../environment.ts';
import {OceanTransport} from '../ocean.ts';
import {VegetationModel} from '../vegetation.ts';
import {generateSurfaceReference} from '../surface.ts';
import {captureEnvironment,comparisonCSV} from '../environment-comparison.ts';

const g=makeThermalGrid(8,4),n=g.count;
const near=(a:number,b:number,t=1e-5)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
function setup(f=0,t=270,windMps=0) {
    const land=new Float64Array(n).fill(f),m=new ThermalModel(DEFAULT_PLANET,DEFAULT_ORBIT,DEFAULT_THERMAL,land,0,g);
    m.temperatureK.fill(t);
    const w=new WaterModel(g,DEFAULT_PLANET.radiusM,land,new Float64Array(n).fill(100),m.temperatureK,{...DEFAULT_WATER,windMps,moistureDiffusivityM2s:0,evaporationFraction:0});
    return {m,w};
}
test('frozen inventories belong to the conserved water budget and restore together',()=>{
    const {w}=setup();
    assert.ok(w.snowKgM2 instanceof Float64Array,'snow must be a water reservoir');
    assert.ok(w.seaIceKgM2 instanceof Float64Array,'sea ice must be a water reservoir');
    w.seedFrozen(new Float64Array(n),new Float64Array(n).fill(100));
    near(w.diagnostics().residualMm,0);
    const c=w.checkpoint();w.seaIceKgM2.fill(0);w.restore(c);
    assert.deepEqual(w.seaIceKgM2,c.seaIceKgM2);
});
test('coupled runtime generates frozen mass at zero age and conserves enthalpy while evolving',()=>{
    const rt=new ThermalRuntime(g);rt.enabled=rt.waterEnabled=true;
    rt.setTerrain(new Float64Array(n).fill(.3));rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);
    assert.ok(rt.water!.diagnostics().iceMm>0);assert.equal(rt.model!.steps,0);
    const dt=rt.model!.stepS;
    for(let s=32;s<=320;s+=32)rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,s*dt,(s-32)*dt);
    near(rt.water!.diagnostics().residualMm,0,1e-7);
    near(rt.environment!.diagnostics().energyResidualJm2,0,1e-4);
});
test('freezing releases fusion energy; melting consumes it and respects finite stores',()=>{
    const {m,w}=setup(),e=new EnvironmentModel(m,w,{...DEFAULT_ENVIRONMENT});
    const before=e.enthalpy();e.phase(1800);
    near(m.temperatureK[0],271.35);assert.ok(w.seaIceKgM2[0]>0);near(e.enthalpy(),before);
    const frozen=w.seaIceKgM2[0];m.temperatureK.fill(271.45);const warm=e.enthalpy();e.phase(1800);
    near(m.temperatureK[0],271.35);assert.ok(w.seaIceKgM2[0]<frozen);near(e.enthalpy(),warm);near(w.diagnostics().residualMm,0);
    w.oceanGlobalKgM2=0;m.temperatureK.fill(260);const prior=w.seaIceKgM2.slice();e.phase(1800);assert.deepEqual(w.seaIceKgM2,prior);
});
test('snowmelt becomes downhill discharge and keeps the water and energy budgets',()=>{
    const {m,w}=setup(.5,270);w.seedFrozen(new Float64Array(n).fill(50),new Float64Array(n));
    const e=new EnvironmentModel(m,w,{...DEFAULT_ENVIRONMENT});m.temperatureK.fill(276);
    const h=e.enthalpy();e.phase(1800);w.routeSurface(1800);
    assert.ok(w.meltKgM2S.some(v=>v>0));assert.ok(w.dischargeM3S.some(v=>v>0));
    assert.ok(w.snowKgM2[0]<50);near(e.enthalpy(),h);near(w.diagnostics().residualMm,0);
});
test('snowfall stores water and releases vapor and fusion latent heat',()=>{
    const {m,w}=setup(1,260),e=new EnvironmentModel(m,w,{...DEFAULT_ENVIRONMENT});
    w.atmosphereKgM2.fill(30);const h=e.enthalpy();
    w.step(60,m.temperatureK,m.absorbedWm2,e);m.applyHeat(e.heatJm2);
    assert.ok(w.snowKgM2[0]>0);assert.ok(m.temperatureK[0]>260);near(e.enthalpy(),h);
});
test('frozen cover raises albedo and reduces the following absorbed radiation',()=>{
    const a=setup(0,280),b=setup(0,280);
    b.w.seedFrozen(new Float64Array(n),new Float64Array(n).fill(1000));
    const ea=new EnvironmentModel(a.m,a.w,{...DEFAULT_ENVIRONMENT}),eb=new EnvironmentModel(b.m,b.w,{...DEFAULT_ENVIRONMENT});
    assert.ok(eb.diagnostics().albedo>ea.diagnostics().albedo);
    a.m.advanceTo(a.m.stepS);b.m.advanceTo(b.m.stepS);
    assert.ok(b.m.absorbedWm2.every((v,i)=>v<a.m.absorbedWm2[i]));
});
test('closed ocean gyres redistribute heat conservatively, preserve uniform fields and stop at dry land',()=>{
    const {m,w}=setup(0,280,10);w.setWinds(new Float64Array(n).fill(10),new Float64Array(n));
    const ocean=new OceanTransport(m,w);ocean.step(1800,1);
    assert.ok(ocean.eastMps.some(v=>Math.abs(v)>0));assert.ok(m.temperatureK.every(v=>Math.abs(v-280)<1e-10));
    m.temperatureK[0]=300;const energy=m.energy();ocean.step(1800,1);near(m.energy(),energy);
    assert.ok(m.temperatureK.some((t,i)=>i!==0&&t>280));assert.ok(m.temperatureK.every(t=>t>=280&&t<=300));
    w.land.fill(1);m.temperatureK[0]=320;const dry=m.temperatureK.slice();ocean.step(1800,1);assert.deepEqual(m.temperatureK,dry);assert.ok(ocean.eastMps.every(v=>v===0));
});
test('vegetation changes gradually under sustained drought and its checkpoint restores memory',()=>{
    const land=new Float64Array(n).fill(1),r=generateSurfaceReference(g,DEFAULT_PLANET,DEFAULT_ORBIT,DEFAULT_THERMAL,DEFAULT_WATER,land,new Float64Array(n));
    r.meanTemperatureK.fill(290);r.warmestTemperatureK.fill(300);r.annualRainMm.fill(1500);
    const v=new VegetationModel(r),c=v.checkpoint(),t=new Float64Array(n).fill(290),dry=new Float64Array(n);
    v.step(86400,t,dry,dry);assert.ok(v.cover[0]>.99,'One dry day cannot erase established vegetation');
    for(let d=0;d<3650;d++)v.step(86400,t,dry,dry);
    assert.ok(v.cover[0]<.05);assert.ok(v.cover.every(x=>x>=0&&x<=1));v.restore(c);assert.deepEqual(v.checkpoint(),c);
});
test('coupled fixed steps and acknowledged rollback preserve ice, vegetation, currents and energy',()=>{
    const a=new ThermalRuntime(g),b=new ThermalRuntime(g);
    for(const rt of [a,b]){rt.enabled=rt.waterEnabled=true;rt.setTerrain(new Float64Array(n).fill(.3));rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);}
    const dt=a.model!.stepS;a.sync(DEFAULT_PLANET,DEFAULT_ORBIT,32*dt,0);
    for(let s=1;s<=32;s++)b.sync(DEFAULT_PLANET,DEFAULT_ORBIT,s*dt,(s-1)*dt);
    assert.deepEqual(a.water!.checkpoint(),b.water!.checkpoint());assert.deepEqual(a.vegetation!.checkpoint(),b.vegetation!.checkpoint());assert.deepEqual(a.surfaceTexture!.pixels,b.surfaceTexture!.pixels);
    const water=a.water!.checkpoint(),thermal=a.model!.checkpoint(),vegetation=a.vegetation!.checkpoint(),pixels=a.surfaceTexture!.pixels.slice(),stats=a.environment!.diagnostics();
    a.sync(DEFAULT_PLANET,DEFAULT_ORBIT,64*dt,32*dt);a.sync(DEFAULT_PLANET,DEFAULT_ORBIT,96*dt,32*dt);a.sync(DEFAULT_PLANET,DEFAULT_ORBIT,32*dt,32*dt);
    assert.deepEqual(a.water!.checkpoint(),water);assert.deepEqual(a.model!.checkpoint(),thermal);assert.deepEqual(a.vegetation!.checkpoint(),vegetation);assert.deepEqual(a.surfaceTexture!.pixels,pixels);assert.deepEqual(a.environment!.diagnostics(),stats);
});
test('comparison baselines are independent snapshots and CSV contains actual deltas',()=>{
    const rt=new ThermalRuntime(g);rt.enabled=rt.waterEnabled=true;rt.setTerrain(new Float64Array(n).fill(.3));rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);
    const baseline=captureEnvironment(rt)!,frozen=baseline.iceM.slice(),rgb=baseline.rgb.slice();
    rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,rt.model!.stepS*32,0);
    const current=captureEnvironment(rt)!;assert.ok(current.timeS>baseline.timeS);assert.deepEqual(baseline.iceM,frozen);assert.deepEqual(baseline.rgb,rgb);
    const csv=comparisonCSV(baseline,current);assert.ok(csv.includes('Total enthalpy residual'));assert.ok(csv.includes(String(current.metrics.temperatureC-baseline.metrics.temperatureC)));
});
test('coupled symmetric oceans keep both generated polar caps and swap with half-year phase',()=>{
    const rt=new ThermalRuntime();rt.enabled=rt.waterEnabled=true;rt.setTerrain(new Float64Array(rt.grid.count));
    rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);assert.ok(rt.sampleSurface(.5,0)!.seaIceFraction>.9);assert.ok(rt.sampleSurface(.5,1)!.seaIceFraction>.9);
    const north=rt.sampleSurface(.5,.1)!.seaIceFraction,south=rt.sampleSurface(.5,.9)!.seaIceFraction;
    rt.sync(DEFAULT_PLANET,{...DEFAULT_ORBIT,orbitPhaseRad:Math.PI},0,0);near(rt.sampleSurface(.5,.9)!.seaIceFraction,north);near(rt.sampleSurface(.5,.1)!.seaIceFraction,south);
    rt.waterConfig.initialOceanDepthM=0;rt.invalidate();rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);assert.equal(rt.water!.diagnostics().iceMm,0);assert.equal(rt.sampleSurface(.5,0)!.seaIceFraction,0);
});
test('generated frozen surface has no stale pre-freeze discharge for erosion capture',()=>{
    const rt=new ThermalRuntime();rt.enabled=rt.waterEnabled=true;rt.setTerrain(new Float64Array(rt.grid.count).fill(.3),new Float64Array(rt.grid.count).fill(.1));rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);
    const w=rt.water!;
    for(let i=0;i<rt.grid.width;i++){assert.equal(w.surfaceKgM2[i],0);assert.equal(w.dischargeM3S[i],0);}
});
test('generated ice with liquid ocean starts at freezing without a first-step phase surge',()=>{
    const {m,w}=setup(0,250);w.seedFrozen(new Float64Array(n),new Float64Array(n).fill(1000));
    const e=new EnvironmentModel(m,w,{...DEFAULT_ENVIRONMENT}),ice=w.seaIceKgM2.slice();
    near(m.temperatureK[0],271.35);e.phase(1800);assert.deepEqual(w.seaIceKgM2,ice);near(e.diagnostics().energyResidualJm2,0);
    const dry=setup(0,250);dry.w.oceanGlobalKgM2=0;const empty=new EnvironmentModel(dry.m,dry.w,{...DEFAULT_ENVIRONMENT});assert.equal(dry.m.temperatureK[0],250);assert.equal(empty.water.seaIceKgM2[0],0);
});
test('comparison parameter snapshots distinguish albedo feedback experiments',()=>{
    const rt=new ThermalRuntime(g);rt.enabled=rt.waterEnabled=true;rt.setTerrain(new Float64Array(n).fill(.3));rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);
    const a=captureEnvironment(rt)!;rt.environmentConfig.iceAlbedo=false;rt.invalidate();rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);const b=captureEnvironment(rt)!;
    assert.notEqual(a.parameters,b.parameters);assert.match(a.parameters,/"iceAlbedo":true/);assert.match(b.parameters,/"iceAlbedo":false/);
    assert.ok(comparisonCSV(a,b).includes('iceAlbedo'));
});
