import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyBiome,generateSurfaceReference,surfaceCover} from '../surface.ts';
import {makeThermalGrid,DEFAULT_THERMAL} from '../thermal.ts';
import {DEFAULT_WATER} from '../water.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';
import {ThermalRuntime} from '../thermal-runtime.ts';

test('potential vegetation distinguishes cold, dry, temperate and tropical climates',()=>{
    const cases:[number,number,number,string][]=[[-20,-4,200,'ice'],[-8,7,300,'tundra'],[2,17,800,'boreal'],[12,24,1100,'temperate'],
        [14,25,450,'grassland'],[25,35,80,'desert'],[25,31,800,'savanna'],[25,31,1300,'tropical-forest'],[26,31,2200,'rainforest'],[60,70,2000,'barren'],[-30,-10,0,'barren']];
    for(const [mean,warmest,rain,expected] of cases)assert.equal(classifyBiome(mean+273.15,warmest+273.15,rain),expected);
});
test('seasonal snow changes cover without reclassifying a forest and needs moisture',()=>{
    const climate={meanTemperatureK:285.15,warmestTemperatureK:297.15,annualRainMm:1100};
    const summer=surfaceCover(climate,290,.7),winter=surfaceCover(climate,263,.7);
    assert.equal(summer.biome,'temperate');assert.equal(winter.biome,'temperate');
    assert.equal(summer.snowFraction,0);assert.equal(winter.snowFraction,1);
    assert.ok(winter.color.every((c,i)=>c>summer.color[i]));
    assert.equal(surfaceCover({...climate,annualRainMm:0},263,0).snowFraction,0);
    assert.equal(surfaceCover(climate,274,.5).seaIceFraction,0);
    assert.equal(surfaceCover(climate,260,.5).seaIceFraction,1);
    const dry=surfaceCover(climate,290,0);assert.notDeepEqual(dry.color,summer.color);assert.equal(dry.biome,summer.biome);
});
test('annual reference ignores selected date, responds to elevation and water supply, and stays finite',()=>{
    const grid=makeThermalGrid(16,8),land=new Float64Array(grid.count).fill(.6),height=new Float64Array(grid.count);
    const reference=(orbit=DEFAULT_ORBIT,h=height,water=DEFAULT_WATER)=>generateSurfaceReference(grid,DEFAULT_PLANET,orbit,DEFAULT_THERMAL,water,land,h);
    const a=reference(),b=reference({...DEFAULT_ORBIT,orbitPhaseRad:2,spinPhaseRad:1});assert.deepEqual(a,b);
    const high=reference(DEFAULT_ORBIT,new Float64Array(grid.count).fill(4000));
    assert.ok(high.meanTemperatureK.every((t,i)=>t<a.meanTemperatureK[i]));
    assert.ok(a.annualRainMm.some(p=>p>100));assert.ok(reference(DEFAULT_ORBIT,height,{...DEFAULT_WATER,evaporationFraction:0}).annualRainMm.every(p=>p===0));
    for(const bondAlbedo of [0,1]) {
        const r=reference({...DEFAULT_ORBIT,bondAlbedo});
        for(const field of Object.values(r))assert.ok(field.every(Number.isFinite));
        for(let i=0;i<grid.count;i++)assert.ok(r.warmestTemperatureK[i]>=r.meanTemperatureK[i]-1e-9);
    }
});
test('surface is available at zero age, preserves the presented frame, and clears with terrain or model',()=>{
    const grid=makeThermalGrid(16,8),rt=new ThermalRuntime(grid);rt.enabled=rt.waterEnabled=true;
    rt.setTerrain(new Float64Array(grid.count).fill(.7),new Float64Array(grid.count).fill(.1));
    rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);assert.ok(rt.surfaceTexture);assert.equal(rt.model!.steps,0);assert.equal(rt.water!.elapsedS,0);
    assert.ok(rt.sampleSurface(.5,.5));const initial=rt.surfaceTexture!.pixels.slice(),probe=rt.sampleSurface(.5,.5);
    const dt=rt.model!.stepS;rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,32*dt,0);rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,64*dt,0);
    rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);assert.deepEqual(rt.surfaceTexture!.pixels,initial);assert.deepEqual(rt.sampleSurface(.5,.5),probe);
    assert.equal(rt.surfaceTexture!.timeS,rt.model!.timeS);
    rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,32*dt,0);
    const visible=rt.surfaceTexture!.pixels.slice(),visibleProbe=rt.sampleSurface(.5,.5);
    rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,64*dt,32*dt);rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,96*dt,32*dt);
    rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,32*dt,32*dt);
    assert.equal(rt.model!.steps,32);assert.deepEqual(rt.surfaceTexture!.pixels,visible);assert.deepEqual(rt.sampleSurface(.5,.5),visibleProbe);
    rt.setTerrain(new Float64Array(grid.count));assert.equal(rt.surfaceTexture,null);assert.equal(rt.sampleSurface(.5,.5),null);
    rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);rt.enabled=false;rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);assert.equal(rt.surfaceTexture,null);
});
