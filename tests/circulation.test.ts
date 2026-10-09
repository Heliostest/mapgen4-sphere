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
function setup(planet=DEFAULT_PLANET) {
    const land=new Float64Array(n),m=new ThermalModel(planet,DEFAULT_ORBIT,DEFAULT_THERMAL,land,0,grid);
    m.temperatureK.fill(290);
    const w=new WaterModel(grid,planet.radiusM,land,new Float64Array(n),m.temperatureK,{...DEFAULT_WATER,windMps:10});
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

test('temperature forcing reverses Coriolis by hemisphere and spin and wraps the meridian',()=>{
    const run=(retrograde=false,shift=0)=>{
        const {m,w}=setup({...DEFAULT_PLANET,retrograde});
        for(let i=0;i<n;i++)m.temperatureK[i]=290+20*Math.sin(2*Math.PI*((i%8+shift)%8)/8);
        const a=new AtmosphericCirculation(m,w);a.step(1000,1000);return a;
    };
    const pro=run(),retro=run(true),shifted=run(false,1);
    assert.ok(pro.eastMps[0]>0&&pro.northMps[0]<0,'Hot eastern neighbour drives eastward flow turned south in the north');
    assert.ok(pro.eastMps[24]>0&&pro.northMps[24]>0,'Same forcing turns north in the south');
    near(pro.eastMps[0],pro.eastMps[24],1e-12);near(pro.northMps[0],-pro.northMps[24],1e-12);
    for(let i=0;i<n;i++){near(pro.eastMps[i],retro.eastMps[i],1e-12);near(pro.northMps[i],-retro.northMps[i],1e-12);const next=Math.floor(i/8)*8+(i%8+1)%8;near(shifted.eastMps[i],pro.eastMps[next],1e-12);near(shifted.northMps[i],pro.northMps[next],1e-12);}
});

test('unforced atmospheric memory decays faster over land without advancing at pause',()=>{
    const {m,w}=setup();w.land.fill(1,n/2);const a=new AtmosphericCirculation(m,w);
    a.restore({eastMps:new Float64Array(n).fill(2),northMps:new Float64Array(n)});
    const saved=a.checkpoint();a.step(0,0);assert.deepEqual(a.checkpoint(),saved);
    a.step(86400,86400);
    near(Math.hypot(a.eastMps[0],a.northMps[0]),2*Math.exp(-.5),1e-12);
    near(Math.hypot(a.eastMps[24],a.northMps[24]),2*Math.exp(-1.5),1e-12);
});

test('ocean memory has a five-day response and reverses gradually after wind reversal',()=>{
    const {m,w}=setup(),o=new OceanTransport(m,w,true);
    const u=Float64Array.from({length:n},(_,i)=>i<8?8:0),zero=new Float64Array(n);
    w.setWinds(u,zero);o.step(5*86400,1);
    const first=o.checkpoint()!.circulationMps[0],target=Math.tanh(1)/4;
    near(first,target*(1-Math.exp(-1)),1e-12);
    w.setWinds(zero,zero);o.step(86400,1);near(o.checkpoint()!.circulationMps[0],first*Math.exp(-.2),1e-12);
    w.setWinds(u.map(v=>-v),zero);const before=o.checkpoint()!.circulationMps[0];o.step(86400,1);
    near(o.checkpoint()!.circulationMps[0],-target+(before+target)*Math.exp(-.2),1e-12);
    assert.ok(o.checkpoint()!.circulationMps[0]>0,'One day of reversed wind retains positive current memory');
    o.step(5*86400,1);assert.ok(o.checkpoint()!.circulationMps[0]<0);
});

test('one dry or frozen cell blocks its incident heat transfers while wet closed loops keep heat',()=>{
    for(const barrier of ['land','ice']){
        const {m,w}=setup(),o=new OceanTransport(m,w,true),cell=9;
        if(barrier==='land')w.land[cell]=1;else w.seaIceKgM2[cell]=917*.5;
        m.temperatureK[cell]=340;m.temperatureK[20]=310;
        w.setWinds(Float64Array.from({length:n},(_,i)=>i<8?10:0),new Float64Array(n));
        const heat=m.energy();for(let s=0;s<20;s++)o.step(86400,1);
        assert.equal(m.temperatureK[cell],340);assert.equal(o.heatWm2[cell],0);assert.equal(o.eastMps[cell],0);assert.equal(o.northMps[cell],0);
        assert.ok(o.eastMps.some(v=>v!==0));near(m.energy(),heat,1e-5);
    }
});

test('an empty liquid ocean applies no current or heat transport but retains dynamic memory',()=>{
    for(const dynamic of [false,true]){
        const {m,w}=setup(),o=new OceanTransport(m,w,dynamic);
        m.temperatureK[0]=310;w.setWinds(Float64Array.from({length:n},(_,i)=>i<8?10:0),new Float64Array(n));
        o.step(86400,1);w.oceanGlobalKgM2=0;
        const before=m.temperatureK.slice(),heat=m.energy();o.step(86400,1);
        assert.deepEqual(m.temperatureK,before,'No liquid water can carry sensible heat');
        assert.ok(o.eastMps.every(v=>v===0)&&o.northMps.every(v=>v===0));near(m.energy(),heat);
        if(dynamic)assert.ok(o.checkpoint()!.circulationMps.some(v=>v!==0),'Wind-driven memory may persist behind a dry barrier');
        w.oceanGlobalKgM2=100;o.step(0,1);assert.ok(o.eastMps.some(v=>v!==0),'Liquid availability reopens the existing circulation');
    }
});

test('paused and restored ocean diagnostics use the same stable transport bound as a physical step',()=>{
    const small={...DEFAULT_PLANET,radiusM:1000},land=new Float64Array(n);
    const m=new ThermalModel(small,DEFAULT_ORBIT,{...DEFAULT_THERMAL,diffusion:0},land,0,grid);
    m.temperatureK.fill(290);
    const w=new WaterModel(grid,small.radiusM,land,new Float64Array(n),m.temperatureK,{...DEFAULT_WATER,windMps:0,moistureDiffusivityM2s:0,routingSpeedMps:.01});
    const o=new OceanTransport(m,w,true),memory=new Float64Array(8*3);memory[8]=.5;
    o.restore({circulationMps:memory},2);
    const dt=Math.min(m.stepS,w.maxStepS);o.step(dt,2);
    const applied=o.eastMps.slice(),north=o.northMps.slice();assert.ok(Math.max(...applied)>0);
    o.step(0,2);assert.deepEqual(o.eastMps,applied);assert.deepEqual(o.northMps,north);
    const restored=new OceanTransport(m,w,true);restored.restore(o.checkpoint()!,2);restored.step(0,2);
    assert.deepEqual(restored.eastMps,applied);assert.deepEqual(restored.northMps,north);
});

test('a generated zero-inventory ocean develops wind memory without applied ocean currents',()=>{
    const rt=new ThermalRuntime(grid);rt.enabled=rt.waterEnabled=true;rt.environmentConfig.dynamicCirculation=true;
    rt.waterConfig.initialOceanDepthM=0;rt.waterConfig.evaporationFraction=0;
    rt.setTerrain(new Float64Array(n));rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);
    const dt=rt.model!.stepS;for(let steps=32;steps<=320;steps+=32)rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,steps*dt,(steps-32)*dt);
    assert.equal(rt.water!.oceanGlobalKgM2,0);assert.equal(rt.environment!.diagnostics().maxCurrentMps,0);
    assert.ok(rt.environment!.ocean.checkpoint()!.circulationMps.some(v=>Math.abs(v)>1e-6));
    const saved=rt.snapshot(),restored=ThermalRuntime.fromSnapshot(saved,DEFAULT_PLANET,DEFAULT_ORBIT);
    assert.deepEqual(restored.snapshot(),saved);assert.equal(restored.environment!.diagnostics().maxCurrentMps,0);
});
