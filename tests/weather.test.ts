import test from 'node:test';
import assert from 'node:assert/strict';
import {weatherFields,weatherTexture,weatherView} from '../weather.ts';
import {ThermalRuntime} from '../thermal-runtime.ts';
import {ThermalModel,makeThermalGrid,DEFAULT_THERMAL} from '../thermal.ts';
import {WaterModel,DEFAULT_WATER,moistureCapacity} from '../water.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';

function setup() {
    const grid=makeThermalGrid(8,4),land=new Float64Array(grid.count),m=new ThermalModel(DEFAULT_PLANET,DEFAULT_ORBIT,DEFAULT_THERMAL,land,0,grid);
    m.temperatureK.fill(290);const w=new WaterModel(grid,DEFAULT_PLANET.radiusM,land,new Float64Array(grid.count),m.temperatureK,{...DEFAULT_WATER,windMps:10,evaporationFraction:0,moistureDiffusivityM2s:0});return {m,w};
}
test('cloud proxy and rain/snow display derive from stores and last-step precipitation without mutating them',()=>{
    const {m,w}=setup();w.atmosphereKgM2.fill(0);w.precipitationKgM2S.fill(0);
    let f=weatherFields(m,w);assert.ok(f.cloud.every(v=>v===0));assert.ok(f.rainMmDay.every(v=>v===0));
    w.atmosphereKgM2[0]=moistureCapacity(290);w.precipitationKgM2S[0]=5/86400;
    f=weatherFields(m,w);assert.equal(f.cloud[0],1);assert.equal(f.rainMmDay[0],0,'generated zero-age estimates are not rain events');
    m.steps=1;w.elapsedS=m.stepS;m.temperatureK[1]=260;w.precipitationKgM2S[1]=3/86400;
    w.snowfallKgM2S=new Float64Array(m.grid.count);w.snowfallKgM2S[1]=3/86400;
    const before=w.checkpoint(),thermal=m.checkpoint();f=weatherFields(m,w);
    assert.equal(f.rainMmDay[0],5);assert.equal(f.snowMmDay[0],0);assert.equal(f.snowMmDay[1],3);assert.equal(f.rainMmDay[1],0);
    weatherTexture(m,w);assert.deepEqual(w.checkpoint(),before);assert.deepEqual(m.checkpoint(),thermal);
});
test('snow diagnostics use the recorded frozen transfer even if latent heat subsequently warms the column',()=>{
    const {m,w}=setup();w.land.fill(1);m.temperatureK.fill(270);w.atmosphereKgM2.fill(30);
    const coupling={heatJm2:new Float64Array(m.grid.count),landEvaporation:new Float64Array(m.grid.count),iceCover:new Float64Array(m.grid.count)};
    w.step(60,m.temperatureK,new Float64Array(m.grid.count),coupling);m.steps=1;m.temperatureK.fill(280);
    const f=weatherFields(m,w);assert.ok(f.snowMmDay.every(v=>v>0));assert.ok(f.rainMmDay.every(v=>v<1e-10));
    const state=w.checkpoint();w.snowfallKgM2S=null;assert.ok(weatherFields(m,w).rainMmDay.every(v=>v===0));w.restore(state);assert.deepEqual(weatherFields(m,w),f);
});
test('precipitation diagnostics distinguish initial estimates, recorded phase and unknown legacy phase',()=>{
    const {m,w}=setup();w.precipitationKgM2S.fill(5/86400);
    let f=weatherFields(m,w);assert.equal(f.precipitationSource,'initial estimate');assert.equal(f.phaseAvailable,false);assert.equal(f.precipitationMmDay[0],5);
    m.steps=1;w.elapsedS=m.stepS;f=weatherFields(m,w);assert.equal(f.precipitationSource,'latest step');assert.equal(f.phaseAvailable,false);
    w.snowfallKgM2S=new Float64Array(m.grid.count).fill(3/86400);f=weatherFields(m,w);
    assert.equal(f.phaseAvailable,true);assert.equal(f.rainMmDay[0],2);assert.equal(f.snowMmDay[0],3);assert.equal(f.precipitationMmDay[0],f.rainMmDay[0]+f.snowMmDay[0]);
});
test('local temperature changes cloud proxy at fixed column water; dry and humid bounds remain exact',()=>{
    const {m,w}=setup();w.atmosphereKgM2.fill(moistureCapacity(290)*.85);
    const baseline=weatherFields(m,w).cloud[0];assert.ok(baseline>0&&baseline<1);
    m.temperatureK[0]=300;m.temperatureK[1]=280;const f=weatherFields(m,w);assert.equal(f.cloud[0],0);assert.equal(f.cloud[1],1);assert.equal(f.cloud[2],baseline);
    w.atmosphereKgM2.fill(0);assert.ok(weatherFields(m,w).cloud.every(v=>v===0));
});
test('cloud cache follows visible-frame rollback, terrain regeneration, replacement and water shutdown',()=>{
    const rt=new ThermalRuntime(makeThermalGrid(8,4));rt.enabled=rt.waterEnabled=true;rt.setTerrain(new Float64Array(rt.grid.count));rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);
    const visible=weatherView(rt)!,state=rt.snapshot();rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,rt.maxAdvanceS,0);const ahead=weatherView(rt)!;assert.notEqual(ahead,visible);
    rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,null);assert.deepEqual(rt.snapshot(),state);assert.deepEqual(weatherView(rt),visible);
    const restored=ThermalRuntime.fromSnapshot(state,DEFAULT_PLANET,DEFAULT_ORBIT);rt.replaceWith(restored);assert.deepEqual(weatherView(rt),visible);
    rt.setTerrain(new Float64Array(rt.grid.count).fill(1));rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);assert.notEqual(weatherView(rt),visible);assert.notDeepEqual(weatherView(rt)!.pixels,visible.pixels);
    rt.waterEnabled=false;rt.invalidate();rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);assert.equal(weatherView(rt),null);
});
test('weather texture has shared scalar polar limits and bounded deterministic bytes',()=>{
    const {m,w}=setup();w.atmosphereKgM2.set(w.atmosphereKgM2.map((_,i)=>i%3*moistureCapacity(290)));
    const a=weatherTexture(m,w),b=weatherTexture(m,w);assert.deepEqual(a,b);
    for(const row of [0,a.height-1])for(let x=1;x<a.width;x++)assert.deepEqual(a.pixels.slice(4*(row*a.width+x),4*(row*a.width+x+1)),a.pixels.slice(4*row*a.width,4*(row*a.width+1)));
    assert.ok(a.pixels.every(v=>v>=0&&v<=255));
});
test('cloud patterns follow conserved moisture transport and exact save restoration',()=>{
    const {m,w}=setup();w.atmosphereKgM2.fill(0);w.atmosphereKgM2[8]=moistureCapacity(290)*.95;w.setWinds(new Float64Array(m.grid.count).fill(10),new Float64Array(m.grid.count));
    const before=weatherFields(m,w).cloud,total=w.total();for(let s=0;s<12;s++)w.step(w.maxStepS,m.temperatureK,new Float64Array(m.grid.count));
    const after=weatherFields(m,w).cloud;assert.notDeepEqual(before,after);assert.ok(w.atmosphereKgM2[9]>0);
    assert.ok(Math.abs(w.total()-total)<1e-7);
    const rt=new ThermalRuntime(m.grid);rt.enabled=rt.waterEnabled=true;rt.environmentConfig.dynamicCirculation=rt.environmentConfig.glaciers=true;rt.setTerrain(Float64Array.from({length:m.grid.count},(_,i)=>i%3/2));rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);
    rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,32*rt.model!.stepS,0);const view=weatherView(rt);assert.ok(view);assert.equal(weatherView(rt),view);
    const restored=ThermalRuntime.fromSnapshot(rt.snapshot(),DEFAULT_PLANET,DEFAULT_ORBIT);assert.deepEqual(weatherView(restored),view);
    rt.waterEnabled=false;rt.invalidate();rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);assert.equal(weatherView(rt),null);
});
