import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT,deriveOrbit} from '../astronomy.ts';
import {makeThermalGrid,dailyMeanInsolation,landFractions,sampleTerrainGrid,heatTransport,ThermalModel,DEFAULT_THERMAL} from '../thermal.ts';
import {ThermalRuntime} from '../thermal-runtime.ts';
import {SimulationClock} from '../simulation-clock.ts';
import {generateClimate} from '../climate.ts';
import {DEFAULT_WATER} from '../water.ts';

const p={...DEFAULT_PLANET},o={...DEFAULT_ORBIT};
const grid=makeThermalGrid(16,8);
const land=new Float64Array(grid.count).fill(1);
const model=(config={},fractions=land,planet=p,orbit=o)=>new ThermalModel(planet,orbit,{...DEFAULT_THERMAL,...config},fractions,0,grid);
function advance(m:ThermalModel,time:number) {m.advanceTo(time,1000000);}
const near=(a:number,b:number,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);

test('thermal cells cover a closed equal-area sphere, including longitude seam',()=>{
    near(grid.solidAngle*grid.count,4*Math.PI);
    assert.equal(grid.edges.length,grid.count+grid.width*(grid.height-1));
    assert.ok(grid.edges.every(e=>e.a!==e.b && e.geometry>0));
    assert.ok(grid.edges.some(e=>e.a===15 && e.b===0));
});
test('daily forcing has correct equator, polar and opposite-season limits',()=>{
    near(dailyMeanInsolation(0,0,1361),1361/Math.PI);
    near(dailyMeanInsolation(1,.4,1361),1361*Math.sin(.4));
    near(dailyMeanInsolation(-1,.4,1361),0);
    near(dailyMeanInsolation(.6,.4,1361),dailyMeanInsolation(-.6,-.4,1361));
    for(const declination of [0,.4,Math.PI/2]) {
        let sum=0;for(let i=0;i<10000;i++) sum+=dailyMeanInsolation(-1+2*(i+.5)/10000,declination,1361);
        near(sum/10000,1361/4,.01);
    }
});
test('diffusion is pairwise conservative and leaves a uniform field unchanged',()=>{
    const uniform=new Float64Array(grid.count).fill(280);
    assert.ok(heatTransport(grid,uniform,.55).every(v=>v===0));
    uniform[0]=300;
    const flux=heatTransport(grid,uniform,.55);
    near(flux.reduce((a,b)=>a+b,0),0,1e-10);
    assert.ok(flux[0]<0 && flux[15]>0);
});
test('terrain classification wraps longitude and fills sparse cells without NaN',()=>{
    const water=landFractions(grid,new Float32Array([0,0,-1]),new Float32Array([-1]));
    assert.ok(water.every(v=>v===0));
    const earth=landFractions(grid,new Float32Array([0,0,-1,0,0,1]),new Float32Array([-1,1]));
    assert.ok(earth.every(v=>v>=0 && v<=1));
    assert.ok(earth.some(v=>v===1) && earth.some(v=>v===0));
});
test('land responds faster than a water mixed layer to identical forcing',()=>{
    const a=model({diffusion:0}),b=model({diffusion:0},new Float64Array(grid.count));
    const initial=a.temperatureK[grid.width*3];
    advance(a,86400);advance(b,86400);
    assert.ok(a.temperatureK[grid.width*3]-initial>5*(b.temperatureK[grid.width*3]-initial));
});
test('fixed steps give identical climate across frame partitions and close energy budget',()=>{
    const a=model(),b=model();const end=30*86400;
    advance(a,end);
    for(let t=137;t<end;t+=137) b.advanceTo(t);
    b.advanceTo(end);
    assert.deepEqual(a.temperatureK,b.temperatureK);
    assert.equal(a.timeS,b.timeS);
    assert.ok(Math.abs(a.diagnostics().budgetResidualJm2)<1e-5);
    assert.ok(a.temperatureK.every(v=>Number.isFinite(v) && v>=0));
});
test('halving stable time step converges over a seasonal transient',()=>{
    const a=model(),b=model(),c=model();b.stepS/=2;c.stepS/=4;
    for(const m of [a,b,c]) advance(m,10*86400);
    const error=(m:ThermalModel)=>Math.max(...m.temperatureK.map((v,i)=>Math.abs(v-c.temperatureK[i])));
    assert.ok(error(b)<error(a));assert.ok(error(a)<.1);
});
test('checkpoint restores temperature, timestamp and energy together',()=>{
    const m=model();advance(m,86400);const saved=m.checkpoint();
    advance(m,172800);m.restore(saved);
    assert.deepEqual(m.temperatureK,saved.temperatureK);assert.equal(m.timeS,86400);
    assert.ok(Math.abs(m.diagnostics().budgetResidualJm2)<1e-5);
});
test('thermal bounds reject invalid config and radius scaling controls diffusion stability',()=>{
    assert.throws(()=>model({emissivity:0}),RangeError);
    assert.throws(()=>model({oceanDepthM:NaN}),RangeError);
    assert.throws(()=>model({},new Float64Array(3)),RangeError);
    const small=model({},land,{...p,radiusM:10000});
    assert.ok(small.stepS<model().stepS/100);
    small.advanceTo(1e10);assert.ok(small.steps<=32);
});
test('runtime restores a presented thermal state and rejects unsupported slow spin',()=>{
    const rt=new ThermalRuntime(grid);rt.enabled=true;rt.setTerrain(land);
    rt.sync(p,o,0,0);rt.sync(p,o,3600,0);const seen=rt.model!.temperatureK.slice();
    rt.sync(p,o,7200,3600);rt.sync(p,o,3600,3600);
    assert.deepEqual(rt.model!.temperatureK,seen);
    rt.sync(p,o,7200,3600);assert.ok(rt.model!.timeS>3600);
    rt.sync({...p,siderealPeriodS:deriveOrbit(p,o).yearS},o,7200,7200);
    assert.equal(rt.model,null);assert.match(rt.status,/slow|synchronous/i);
});
test('clock caps solver work without banking hidden catch-up time',()=>{
    const c=new SimulationClock(0,864000);c.setPlaying(true,0);
    c.tick(1000,3600);near(c.timeS,3600);
    c.tick(1001,3600);near(c.timeS,4464);
});
test('two unpresented thermal updates cannot replace the acknowledged visible checkpoint',()=>{
    const rt=new ThermalRuntime(grid);rt.enabled=true;rt.setTerrain(land);rt.sync(p,o,0,0);
    const dt=rt.model!.stepS;
    for(let step=1;step<=100;step++) rt.sync(p,o,step*dt,(step-1)*dt);
    const seen=rt.model!.temperatureK.slice(),visible=100*dt;
    rt.sync(p,o,101*dt,visible);rt.sync(p,o,102*dt,visible);
    rt.sync(p,o,visible,visible);
    assert.equal(rt.model!.epochS,0,'Pause must not restart the transient');
    assert.deepEqual(rt.model!.temperatureK,seen);
    rt.sync(p,o,103*dt,visible);
    const expected=new ThermalModel(p,o,DEFAULT_THERMAL,land,0,grid,generateClimate(grid,p,o,DEFAULT_THERMAL,DEFAULT_WATER,land,new Float64Array(grid.count),0));advance(expected,103*dt);
    assert.deepEqual(rt.model!.temperatureK,expected.temperatureK);
});
test('clock reports real work limiting at 20fps and clears it on an uncapped update',()=>{
    const c=new SimulationClock(0,864000);c.setPlaying(true,0);
    c.tick(50,35610);assert.equal(c.limited,true);near(c.timeS,35610);
    c.tick(60,35610);assert.equal(c.limited,false);near(c.timeS,44250);
});

test('shared terrain sampling uses mean land elevation without averaging in seafloor',()=>{
    const s=sampleTerrainGrid(grid,[0,0,1,0,0,1,0,0,1],[.2,.6,-1]);
    const k=4*grid.width+8;
    near(s.landFraction[k],2/3);near(s.landElevation[k],.4);
    assert.ok(s.landElevation.every(v=>Number.isFinite(v)&&v>=0));
});

test('coupled water clock restores all stores and fluxes after multiple queued updates',()=>{
    const rt=new ThermalRuntime(grid);rt.enabled=rt.waterEnabled=true;rt.setTerrain(land);
    rt.sync(p,o,0,0);assert.ok(rt.water);
    const dt=rt.model!.stepS;
    for(let s=1;s<=100;s++)rt.sync(p,o,s*dt,(s-1)*dt);
    const saved=rt.water!.checkpoint(),pixels=rt.waterTexture!.pixels.slice();
    rt.sync(p,o,110*dt,100*dt);rt.sync(p,o,120*dt,100*dt);
    assert.ok(rt.water!.elapsedS>saved.elapsedS);
    rt.sync(p,o,100*dt,100*dt);
    assert.deepEqual(rt.water!.checkpoint(),saved);assert.deepEqual(rt.waterTexture!.pixels,pixels);
    near(rt.water!.elapsedS,rt.model!.timeS,1e-6);
    rt.sync(p,o,130*dt,100*dt);assert.ok(rt.water!.elapsedS>saved.elapsedS);
    rt.enabled=false;rt.sync(p,o,130*dt,130*dt);
    assert.equal(rt.water,null);assert.equal(rt.waterTexture,null);
});

test('water shares stable thermal substeps and terrain/config resets its history',()=>{
    const rt=new ThermalRuntime(grid);rt.enabled=rt.waterEnabled=true;rt.setTerrain(land,new Float64Array(grid.count).fill(.2));
    const small={...p,radiusM:10000};rt.sync(small,o,0,0);
    assert.ok(rt.model!.stepS<=rt.water!.maxStepS);near(rt.water!.heightM[0],.2*p.reliefM);
    rt.sync(small,o,rt.maxAdvanceS,0);assert.equal(rt.model!.steps,32);
    near(rt.water!.elapsedS,rt.model!.timeS,1e-6);
    rt.waterConfig.windMps=-100;rt.sync(small,o,100,100);assert.equal(rt.water!.elapsedS,0);
    rt.setTerrain(new Float64Array(grid.count));rt.sync(p,o,100,100);
    assert.ok(rt.water!.soilKgM2.every(v=>v===0));assert.equal(rt.model!.epochS,100);
    rt.sync({...p,siderealPeriodS:deriveOrbit(p,o).yearS},o,100,100);
    assert.equal(rt.water,null);assert.equal(rt.waterTexture,null);
});
