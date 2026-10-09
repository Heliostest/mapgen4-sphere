import test from 'node:test';
import assert from 'node:assert/strict';
import {AtmosphericCirculation,rotatingDrag} from '../circulation.ts';
import {OceanTransport} from '../ocean.ts';
import {ThermalModel,makeThermalGrid,DEFAULT_THERMAL} from '../thermal.ts';
import {WaterModel,DEFAULT_WATER} from '../water.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';
import {ThermalRuntime} from '../thermal-runtime.ts';
import {generateClimate} from '../climate.ts';

const grid=makeThermalGrid(8,4),n=grid.count;
const near=(a:number,b:number,t=1e-5)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
function setup() {
    const land=new Float64Array(n),m=new ThermalModel(DEFAULT_PLANET,DEFAULT_ORBIT,DEFAULT_THERMAL,land,0,grid);
    m.temperatureK.fill(290);
    const w=new WaterModel(grid,DEFAULT_PLANET.radiusM,land,new Float64Array(n),m.temperatureK,{...DEFAULT_WATER,windMps:10});
    return {m,w};
}
test('Coriolis turns eastward perturbations south in the north, reverses with spin, and drag dissipates speed',()=>{
    const f=.0001,dt=1000,a=rotatingDrag(10,0,0,0,f,0,dt),b=rotatingDrag(10,0,0,0,-f,0,dt);
    near(a[0],10*Math.cos(f*dt));near(a[1],-10*Math.sin(f*dt));near(b[1],-a[1]);
    const c=rotatingDrag(10,0,0,0,f,1/86400,dt);near(Math.hypot(...c),10*Math.exp(-dt/86400));
    assert.deepEqual(rotatingDrag(0,0,2,3,0,0,4),[8,12]);
});
test('uniform temperature produces no perturbation; heat contrasts drive bounded, persistent winds',()=>{
    const {m,w}=setup(),a=new AtmosphericCirculation(m,w);
    a.step(1800,1800);assert.ok(a.eastMps.every(v=>v===0));assert.ok(a.northMps.every(v=>v===0));
    m.temperatureK[1]+=30;a.step(1800,3600);assert.ok(a.eastMps.some(v=>v!==0));
    assert.ok(Math.hypot(a.eastMps[0],a.northMps[0])>0);
    const state=a.checkpoint();a.step(0,3600);assert.deepEqual(a.checkpoint(),state);
    for(let s=0;s<100;s++)a.step(21600,s*21600);
    assert.ok([...w.windEastMps,...w.windNorthMps].every(v=>Number.isFinite(v)&&Math.abs(v)<=10));
    assert.ok(a.eastMps.every((v,i)=>Math.hypot(v,a.northMps[i])<=5+1e-10));
});
test('authored altitude alone causes no pressure-potential force, including the radiation-scale cap',()=>{
    const {m,w}=setup();w.land.fill(1);w.heightM[0]=10000;w.heightM[2]=100000;
    const reference=generateClimate(grid,DEFAULT_PLANET,DEFAULT_ORBIT,DEFAULT_THERMAL,DEFAULT_WATER,w.land,w.heightM,0);
    m.radiationScale.set(reference.radiationScale);m.temperatureK.set(reference.radiationScale.map(v=>288.15*v));
    assert.equal(m.radiationScale[2],.55);
    const a=new AtmosphericCirculation(m,w);a.step(1800,1800);
    assert.ok(a.eastMps.every((v,i)=>Math.hypot(v,a.northMps[i])<1e-11));
});
test('wind-driven ocean memory spins up gradually, conserves heat, preserves uniform water and cannot cross dry cells',()=>{
    const {m,w}=setup(),o=new OceanTransport(m,w,true);
    w.setWinds(Float64Array.from({length:n},(_,i)=>i<8?10:0),new Float64Array(n));
    o.step(0,1);assert.ok(o.eastMps.every(v=>v===0));o.step(1800,1);
    assert.ok(o.checkpoint()!.circulationMps.some(v=>v!==0));assert.ok(m.temperatureK.every(v=>Math.abs(v-290)<1e-10));
    const saved=o.checkpoint();o.step(0,1);assert.deepEqual(o.checkpoint(),saved);
    m.temperatureK[0]=310;const heat=m.energy();for(let s=0;s<200;s++)o.step(1800,1);
    near(m.energy(),heat);assert.ok(m.temperatureK.every(v=>v>=290-1e-10&&v<=310));
    w.setWinds(new Float64Array(n),new Float64Array(n));o.step(1800,1);assert.ok(o.eastMps.some(v=>v!==0),'wind stopping does not instantly erase currents');
    w.land.fill(1);const before=m.temperatureK.slice();o.step(1800,1);assert.deepEqual(m.temperatureK,before);assert.ok(o.eastMps.every(v=>v===0));
});
test('evolving circulation resumes and rolls back exactly with its water and energy budgets',()=>{
    const rt=new ThermalRuntime(grid);rt.enabled=rt.waterEnabled=true;rt.environmentConfig.dynamicCirculation=true;
    rt.setTerrain(Float64Array.from({length:n},(_,i)=>i%5===0?1:0));rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);
    const dt=rt.model!.stepS;rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,32*dt,0);const saved=rt.snapshot();
    const b=ThermalRuntime.fromSnapshot(saved,DEFAULT_PLANET,DEFAULT_ORBIT);
    for(let s=64;s<=320;s+=32)for(const r of [rt,b])r.sync(DEFAULT_PLANET,DEFAULT_ORBIT,s*dt,(s-32)*dt);
    assert.deepEqual(rt.snapshot(),b.snapshot());near(rt.water!.diagnostics().residualMm,0,1e-7);near(rt.environment!.diagnostics().energyResidualJm2,0,1e-4);
    const current=rt.snapshot();rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,352*dt,320*dt);rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,384*dt,320*dt);rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,320*dt,320*dt);assert.deepEqual(rt.snapshot(),current);
    const bad=structuredClone(saved);bad.state!.circulation!.atmosphere.eastMps[0]=999;assert.throws(()=>ThermalRuntime.fromSnapshot(bad,DEFAULT_PLANET,DEFAULT_ORBIT),/circulation|perturbation/);
    const missing=structuredClone(saved);delete (missing.state as any).circulation;assert.throws(()=>ThermalRuntime.fromSnapshot(missing,DEFAULT_PLANET,DEFAULT_ORBIT));
    const detached=structuredClone(saved);detached.state!.water!.windEastMps[0]=0;assert.throws(()=>ThermalRuntime.fromSnapshot(detached,DEFAULT_PLANET,DEFAULT_ORBIT),/wind.*memory/);
    rt.environmentConfig.dynamicCirculation=false;rt.invalidate();rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);const old=rt.snapshot();delete (old.environmentConfig as any).dynamicCirculation;delete (old.state as any).circulation;
    const legacy=ThermalRuntime.fromSnapshot(old,DEFAULT_PLANET,DEFAULT_ORBIT);assert.equal(legacy.environmentConfig.dynamicCirculation,false);assert.equal(legacy.snapshot().state!.circulation,null);
});
test('tiny-radius, fast retrograde winds stay bounded; fully frozen ocean carries no heat',()=>{
    const {m,w}=setup(),fast={...DEFAULT_PLANET,radiusM:1000,siderealPeriodS:100,retrograde:true};
    const small=new ThermalModel(fast,DEFAULT_ORBIT,DEFAULT_THERMAL,w.land,0,grid),sw=new WaterModel(grid,1000,w.land,w.heightM,small.temperatureK,{...DEFAULT_WATER,windMps:100});
    const a=new AtmosphericCirculation(small,sw);small.temperatureK[0]=1000;for(let i=0;i<20;i++)a.step(21600,i*21600);
    assert.ok([...sw.windEastMps,...sw.windNorthMps].every(v=>Number.isFinite(v)&&Math.abs(v)<=100));
    w.setWinds(Float64Array.from({length:n},(_,i)=>i<8?10:0),new Float64Array(n));w.seaIceKgM2.fill(917);m.temperatureK[0]=310;
    const before=m.temperatureK.slice(),o=new OceanTransport(m,w,true);o.step(86400,2);assert.deepEqual(m.temperatureK,before);assert.ok(o.eastMps.every(v=>v===0));
});
