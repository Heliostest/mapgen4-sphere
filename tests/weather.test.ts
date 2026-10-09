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
test('snow glyphs use the recorded frozen transfer even if latent heat subsequently warms the column',()=>{
    const {m,w}=setup();w.land.fill(1);m.temperatureK.fill(270);w.atmosphereKgM2.fill(30);
    const coupling={heatJm2:new Float64Array(m.grid.count),landEvaporation:new Float64Array(m.grid.count),iceCover:new Float64Array(m.grid.count)};
    w.step(60,m.temperatureK,new Float64Array(m.grid.count),coupling);m.steps=1;m.temperatureK.fill(280);
    const f=weatherFields(m,w);assert.ok(f.snowMmDay.every(v=>v>0));assert.ok(f.rainMmDay.every(v=>v<1e-10));
    const state=w.checkpoint();w.snowfallKgM2S=null;assert.ok(weatherFields(m,w).rainMmDay.every(v=>v===0));w.restore(state);assert.deepEqual(weatherFields(m,w),f);
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
