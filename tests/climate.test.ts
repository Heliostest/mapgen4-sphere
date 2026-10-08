import test from 'node:test';
import assert from 'node:assert/strict';
import {generateClimate,circulationWinds} from '../climate.ts';
import {makeThermalGrid,DEFAULT_THERMAL} from '../thermal.ts';
import {DEFAULT_WATER} from '../water.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';
import {ThermalRuntime} from '../thermal-runtime.ts';
import {WaterModel} from '../water.ts';
const grid=makeThermalGrid(48,24),n=grid.count,field=(x:number)=>new Float64Array(n).fill(x);
const mean=(a:ArrayLike<number>,row:number)=>Array.from({length:grid.width},(_,i)=>a[row*grid.width+i]).reduce((a,b)=>a+b,0)/grid.width;
const generated=(land=field(1),height=field(0),planet={...DEFAULT_PLANET},orbit={...DEFAULT_ORBIT})=>generateClimate(grid,planet,orbit,DEFAULT_THERMAL,DEFAULT_WATER,land,height,0);
test('reference climate has latitude bands at zero elapsed time and reproduces exactly',()=>{
    const c=generated();assert.ok(mean(c.temperatureK,11)>mean(c.temperatureK,0)+15);
    assert.deepEqual(c,generated());assert.ok(c.rainMmDay.some(x=>x>0));
    assert.ok(Math.max(...c.soilFraction)-Math.min(...c.soilFraction)>.1);
});
test('tilt/season swap hemispheres; highlands cool and ocean moderates seasonal response',()=>{
    const summer={...DEFAULT_ORBIT,orbitPhaseRad:Math.PI/2},winter={...summer,orbitPhaseRad:3*Math.PI/2};
    const a=generated(field(1),field(0),{...DEFAULT_PLANET},summer),b=generated(field(1),field(0),{...DEFAULT_PLANET},winter);
    assert.ok(mean(a.temperatureK,4)>mean(a.temperatureK,19));
    assert.ok(Math.abs(mean(a.temperatureK,4)-mean(b.temperatureK,19))<1e-8);
    const seaA=generated(field(0),field(0),{...DEFAULT_PLANET},summer),seaB=generated(field(0),field(0),{...DEFAULT_PLANET},winter);
    assert.ok(Math.abs(mean(seaA.temperatureK,4)-mean(seaB.temperatureK,4))<Math.abs(mean(a.temperatureK,4)-mean(b.temperatureK,4)));
    const flat=generated(),high=generated(field(1),field(3000));assert.ok(high.temperatureK.every((x,i)=>x<flat.temperatureK[i]));
});
test('generated wind has trade/westerly/polar directions and responds to season/retrograde',()=>{
    const a=generated(),b=generated(field(1),field(0),{...DEFAULT_PLANET,retrograde:true});
    const row=(lat:number)=>Math.floor((1-Math.sin(lat*Math.PI/180))*grid.height/2);
    assert.ok(mean(a.windEastMps,row(15))<0);assert.ok(mean(a.windEastMps,row(45))>0);assert.ok(mean(a.windEastMps,row(75))<0);
    assert.ok(mean(a.windNorthMps,row(15))<0);assert.ok(mean(a.windNorthMps,row(-15))>0);
    for(let i=0;i<n;i++)assert.equal(a.windEastMps[i],-b.windEastMps[i]);
    const summer=circulationWinds(grid,DEFAULT_PLANET,{...DEFAULT_ORBIT,orbitPhaseRad:Math.PI/2},0,field(1),10);
    assert.notDeepEqual(a.windNorthMps,summer.northMps);
});
test('windward terrain receives more initial rain than its lee and inputs are not mutated',()=>{
    const land=field(0),h=field(0);for(let j=0;j<grid.height;j++)for(let i=18;i<=22;i++){land[j*48+i]=1;h[j*48+i]=(i<=20?i-17:23-i)*700;}
    const saved=h.slice(),c=generated(land,h),row=3; // westerlies: west to east
    assert.ok(c.rainMmDay[row*48+19]>c.rainMmDay[row*48+21]);assert.deepEqual(h,saved);
});
test('reference fields are finite under extremes and runtime starts immediately without spending time',()=>{
    for(const radiusM of [10000,1e8])for(const bondAlbedo of [0,1]) {
        const c=generated(field(.5),field(1e5),{...DEFAULT_PLANET,radiusM,obliquityRad:Math.PI/2},{...DEFAULT_ORBIT,bondAlbedo,distanceM:DEFAULT_ORBIT.distanceM*.1});
        for(const a of Object.values(c))assert.ok(a.every(Number.isFinite));assert.ok(c.temperatureK.every(x=>x>=0));
    }
    const rt=new ThermalRuntime(grid);rt.enabled=rt.waterEnabled=true;rt.setTerrain(field(1),field(.2));rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,1234,1234);
    assert.equal(rt.model!.steps,0);assert.equal(rt.model!.timeS,1234);assert.equal(rt.water!.elapsedS,0);
    assert.ok(rt.model!.diagnostics().maxK-rt.model!.diagnostics().minK>15);
    assert.ok(rt.water!.diagnostics().rainMmDay>0);assert.ok(Math.abs(rt.water!.diagnostics().residualMm)<1e-7);
    assert.ok(Math.abs(rt.model!.diagnostics().budgetResidualJm2)<1e-5);
});
test('vector winds transport vapor north/south conservatively across seams with a stable bound',()=>{
    const c=generated(),w=new WaterModel(grid,10000,field(1),field(0),field(288),{...DEFAULT_WATER,evaporationFraction:0,moistureDiffusivityM2s:0,windMps:100},c);
    const north=field(100),east=field(-100);w.setWinds(east,north);
    w.atmosphereKgM2.fill(0);const source=12*48;w.atmosphereKgM2[source]=1;
    const before=w.diagnostics().totalMm;w.step(w.maxStepS,field(330),field(0));
    assert.ok(w.atmosphereKgM2[source-48]>0);assert.ok(w.atmosphereKgM2[source+47]>0);
    assert.ok(Math.abs(w.diagnostics().totalMm-before)<1e-7);
    for(let i=0;i<500;i++){w.setWinds(field(i%2?100:-100),field(i%3?100:-100));w.step(w.maxStepS,field(330),field(0));}
    assert.ok(w.atmosphereKgM2.every(x=>Number.isFinite(x)&&x>=0));assert.ok(Math.abs(w.diagnostics().totalMm-before)<1e-7);
    const saved=w.checkpoint();w.setWinds(field(0),field(0));w.restore(saved);assert.deepEqual(w.windEastMps,saved.windEastMps);
});
test('generated highland climate evolves with finite temperatures, energy and water budgets',()=>{
    const smallGrid=makeThermalGrid(16,8),land=Float64Array.from({length:128},(_,i)=>i%3?.8:0),height=Float64Array.from({length:128},(_,i)=>i%5/4);
    for(const radiusM of [10000,6371008.4,1e8])for(const bondAlbedo of [0,.3,1]) {
        const rt=new ThermalRuntime(smallGrid);rt.enabled=rt.waterEnabled=true;rt.setTerrain(land,height);
        const planet={...DEFAULT_PLANET,radiusM,reliefM:1e5},orbit={...DEFAULT_ORBIT,bondAlbedo};rt.sync(planet,orbit,0,0);
        const dt=rt.model!.stepS;
        for(let s=1;s<=320;s++)rt.sync(planet,orbit,s*dt,(s-1)*dt);
        assert.ok(rt.model!.temperatureK.every(x=>Number.isFinite(x)&&x>=0));
        assert.ok(Math.abs(rt.model!.diagnostics().budgetResidualJm2)<1e-4);
        assert.ok(Math.abs(rt.water!.diagnostics().residualMm)<1e-6);
    }
});
