import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyBiome,generateSurfaceReference,surfaceCover} from '../surface.ts';
import {makeThermalGrid,DEFAULT_THERMAL} from '../thermal.ts';
import {DEFAULT_WATER} from '../water.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';
import {ThermalRuntime} from '../thermal-runtime.ts';
import {sampleTerrainGrid} from '../thermal.ts';
import {uvToDirection} from '../sphere.ts';
import {makeSurfaceGrid,SurfaceTerrainSampler,resampleClimateField} from '../surface-grid.ts';
import {makeMesh} from '../mesh.ts';
import Map from '../map.ts';
import {SphericalConstraints} from '../spherical-constraints.ts';
import {defaultTerrainParameters} from '../terrain-parameters.ts';
import config from '../config.js';
import {makeSphereMesh} from '../sphere-mesh.ts';
import {advanceSeaIce,generateSeaIce,seaIceCooling,seaIceFraction} from '../sea-ice.ts';

test('sea ice stores cold history, melts gradually, and cannot grow outside its bounds',()=>{
    const frozen=generateSeaIce(new Float64Array(12).fill(10),1,365.2425*86400,0)[0];
    const thawed=advanceSeaIce(frozen,seaIceCooling(281.35,.61),86400);
    assert.ok(thawed>0&&thawed<frozen,'One warm day must reduce the ice reserve without erasing it');
    assert.equal(advanceSeaIce(thawed,-100,1e9),0,'Sustained heat must be able to melt all ice');
    assert.equal(advanceSeaIce(frozen,100,1e9),frozen);
    assert.equal(generateSeaIce(new Float64Array(12).fill(-10),1,365.2425*86400,0)[0],0);
    assert.equal(seaIceCooling(271.35,.61),0);
    assert.equal(advanceSeaIce(100,2,10),120);assert.equal(advanceSeaIce(100,-2,10),80);
    assert.equal(seaIceFraction(0),0);assert.equal(seaIceFraction(frozen),1);
});

test('generated sea ice closes the annual cycle and varies continuously across date and year boundaries',()=>{
    const year=365.2425*86400,forcing=Float64Array.from([40,40,20,-10,-30,-40,-40,-20,10,30,40,40]);
    const at=(phase:number)=>generateSeaIce(forcing,1,year,phase)[0];
    let energy=at(0);for(const q of forcing)energy=advanceSeaIce(energy,q,year/12);
    assert.ok(Math.abs(energy-at(0))<1e-6);
    for(let month=0;month<=12;month++) {
        const p=month*Math.PI/6;
        assert.ok(Math.abs(at(p+1e-9)-at(p-1e-9))<10);
        assert.ok(Math.abs(at(p)-at(p+2*Math.PI))<1e-5);
    }
    assert.ok(at(Math.PI*4/3)<at(0),'Late summer must use accumulated melt');
});

test('both polar oceans retain generated sea ice through a brief warm season without Play',()=>{
    const grid=makeThermalGrid(),rt=new ThermalRuntime(grid);rt.enabled=true;
    rt.setTerrain(new Float64Array(grid.count));rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);
    const north=rt.sampleSurface(.5,1/48)!,south=rt.sampleSurface(.5,47/48)!;
    assert.ok(south.localTemperatureK>273.15,'Reproduce the southern late-summer thermal estimate');
    assert.ok(north.seaIceFraction>.5);assert.ok(south.seaIceFraction>.5,'Winter ice must not disappear instantly when the temperature rises');
    assert.equal(rt.sampleSurface(.5,.5)!.seaIceFraction,0,'Tropical ocean must remain open');
    assert.equal(rt.model!.steps,0);
});

test('symmetric oceans exchange seasonal sea ice between hemispheres and warm planets can lose it',()=>{
    const grid=makeThermalGrid(),rt=new ThermalRuntime(grid);rt.enabled=true;rt.setTerrain(new Float64Array(grid.count));
    const row=(j:number)=>rt.sampleSurface(.5,j/48)!.seaIceFraction;
    for(const phase of [0,.7,Math.PI/2]) {
        rt.sync(DEFAULT_PLANET,{...DEFAULT_ORBIT,orbitPhaseRad:phase},0,0);
        const north=Array.from({length:25},(_,j)=>row(j)),south=Array.from({length:25},(_,j)=>row(48-j));
        rt.sync(DEFAULT_PLANET,{...DEFAULT_ORBIT,orbitPhaseRad:phase+Math.PI},0,0);
        for(let j=0;j<=24;j++){assert.ok(Math.abs(north[j]-row(48-j))<1e-9);assert.ok(Math.abs(south[j]-row(j))<1e-9);}
    }
    rt.sync({...DEFAULT_PLANET,obliquityRad:0},DEFAULT_ORBIT,0,0);
    for(let j=0;j<=24;j++)assert.ok(Math.abs(row(j)-row(48-j))<1e-9);
    rt.sync(DEFAULT_PLANET,{...DEFAULT_ORBIT,distanceM:DEFAULT_ORBIT.distanceM*.5},0,0);
    assert.ok(rt.surfaceTexture!.pixels.every((v,i)=>i%4!==3||v===0),'A warm ocean must not have forced polar caps');
});

test('sea ice evolves with fixed solver steps and restores an unpresented future exactly',()=>{
    const grid=makeThermalGrid(16,8),a=new ThermalRuntime(grid),b=new ThermalRuntime(grid);
    for(const rt of [a,b]){rt.enabled=true;rt.setTerrain(new Float64Array(grid.count));rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);}
    const probe=(rt:ThermalRuntime)=>Array.from({length:49},(_,j)=>rt.sampleSurface(.5,j/48)!.seaIceFraction);
    const initial=probe(a),dt=a.model!.stepS;
    a.sync(DEFAULT_PLANET,DEFAULT_ORBIT,32*dt,0);
    for(let s=1;s<=32;s++)b.sync(DEFAULT_PLANET,DEFAULT_ORBIT,s*dt,(s-1)*dt);
    assert.deepEqual(a.surfaceTexture!.pixels,b.surfaceTexture!.pixels);assert.deepEqual(probe(a),probe(b));
    assert.notDeepEqual(probe(a),initial,'Ice at the margin must respond while water is disabled');
    const visible=probe(a),pixels=a.surfaceTexture!.pixels.slice();
    a.sync(DEFAULT_PLANET,DEFAULT_ORBIT,64*dt,32*dt);a.sync(DEFAULT_PLANET,DEFAULT_ORBIT,96*dt,32*dt);
    a.sync(DEFAULT_PLANET,DEFAULT_ORBIT,32*dt,32*dt);assert.deepEqual(probe(a),visible);assert.deepEqual(a.surfaceTexture!.pixels,pixels);
});

test('cached geographic height lookup agrees with exhaustive angular neighbors on sparse polar meshes',()=>{
    const grid=makeSurfaceGrid(),{mesh}=makeSphereMesh(600,35,12345),elevation=Float64Array.from({length:600},(_,r)=>.5+.1*mesh.xyz_r[3*r]+.2*mesh.xyz_r[3*r+2]);
    const result=new SurfaceTerrainSampler(mesh.xyz_r,grid).sample(elevation);
    for(const j of [1,2,3,22,45,46,47])for(let x=0;x<96;x+=7) {
        const p=uvToDirection((x+.5)/96,j/48);
        const nearest=Array.from({length:600},(_,r)=>({r,dot:p[0]*mesh.xyz_r[3*r]+p[1]*mesh.xyz_r[3*r+1]+p[2]*mesh.xyz_r[3*r+2]})).sort((a,b)=>b.dot-a.dot).slice(0,4);
        let total=0,weight=0;for(const q of nearest){const w=1/Math.max(1e-12,1-q.dot);total+=w*elevation[q.r];weight+=w;}
        assert.ok(Math.abs(result.height[j*96+x]-total/weight)<1e-9,`Incomplete neighborhood at row ${j}, column ${x}`);
    }
});

test('the reported default south-pole highland no longer contains the false 700m notch and snow stripe',async()=>{
    const {mesh,t_peaks}=await makeMesh(),p=defaultTerrainParameters(),paint=new SphericalConstraints();
    paint.setElevationParam(p.elevation as any);
    const map=new Map(mesh,t_peaks,config);map.assignElevation(p.elevation,{size:paint.size,constraints:paint.elevation},null);
    map.assignRainfall(p.biomes);map.assignRivers(p.rivers);
    const surface=makeSurfaceGrid(),local=new SurfaceTerrainSampler(mesh.xyz_r,surface).sample(map.elevation_r);
    // Targets are 0.245° apart at -86.25°. The old populated-bin rule chose
    // 2312 / 701 / 2169m from vertices at three different latitudes.
    const heights=[15,16,17].map(x=>local.height[47*96+x]*DEFAULT_PLANET.reliefM);
    assert.ok(heights.every(h=>h>1700&&h<1950));assert.ok(Math.max(...heights)-Math.min(...heights)<100);
    const grid=makeThermalGrid(),terrain=sampleTerrainGrid(grid,mesh.xyz_r,map.elevation_r),rt=new ThermalRuntime(grid);
    rt.enabled=true;rt.setTerrain(terrain.landFraction,terrain.landElevation,{directions:mesh.xyz_r,elevation:map.elevation_r});
    rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);
    const snow=[15,16,17].map(x=>rt.sampleSurface((x+.5)/96,47/48)!.snowFraction);
    assert.ok(snow.every(f=>f>.9));assert.ok(Math.max(...snow)-Math.min(...snow)<.05);
    for(const j of [1,47])for(let x=0;x<96;x++)if(local.land[j*96+x]===0) {
        assert.ok(rt.sampleSurface((x+.5)/96,j/48)!.seaIceFraction>.5,'The default world must retain ice over both polar oceans');
    }
});

test('local terrain sampling resolves polar elevation and updates after painting',()=>{
    const grid=makeSurfaceGrid(),directions=[0,1,0,0,-1,0,0,0,1,0,0,-1],elevation=[.2,-.1,.8,.8];
    const sampler=new SurfaceTerrainSampler(directions,grid),a=sampler.sample(elevation),south=(grid.height-1)*grid.width;
    assert.ok(a.height.slice(0,grid.width).every(h=>Math.abs(h-.2)<1e-9));
    assert.ok(a.land.slice(south).every(f=>f===0));
    elevation[1]=.6;const b=sampler.sample(elevation);
    assert.ok(b.height.slice(south).every(h=>Math.abs(h-.6)<1e-9));
    assert.ok(b.land.slice(south).every(f=>f===1));assert.ok(a.land.slice(south).every(f=>f===0));
});

test('polar height reconstruction does not turn vertices at different latitudes into alternating meridian stripes',()=>{
    const grid=makeSurfaceGrid(),directions:number[]=[0,1,0,0,-1,0],elevation=[.5,.5];
    for(let x=0;x<96;x++) {
        // A sparse row: neighbors in longitude come from opposite ends of
        // the tall latitude bin. The actual field varies north/south only.
        const latitude=x%2?-85:-87.5;
        directions.push(...uvToDirection((x+.5)/96,(90-latitude)/180));elevation.push(x%2?.8:.2);
    }
    const field=new SurfaceTerrainSampler(directions,grid).sample(elevation),row=field.height.slice(47*96,48*96);
    assert.ok(Math.max(...row)-Math.min(...row)<.05,'Geographic neighbors must remove the spurious alternating longitude heights');
    assert.ok(row.every(h=>h>.3&&h<.7));
});

test('climate anomalies interpolate continuously and keep one value at both poles',()=>{
    const grid=makeThermalGrid(),target=makeSurfaceGrid(),field=new Float64Array(grid.count).fill(3);
    const flat=resampleClimateField(grid,field,target);assert.ok(flat.every(x=>Math.abs(x-3)<1e-12));
    for(let i=0;i<field.length;i++)field[i]=i%grid.width<24?-5:5;
    const saved=field.slice(),mapped=resampleClimateField(grid,field,target);
    for(const j of [0,target.height-1])assert.ok(mapped.slice(j*target.width,(j+1)*target.width).every(x=>Math.abs(x)<1e-12));
    assert.ok(Math.max(...mapped)<=5);assert.ok(Math.min(...mapped)>=-5);assert.deepEqual(field,saved);
});

test('polar cover uses local polar terrain instead of extruding the 73 degree climate ring',()=>{
    const directions:number[]=[],elevation:number[]=[];
    for(let j=0;j<49;j++)for(let x=0;x<96;x++) {
        directions.push(...uvToDirection((x+.5)/96,j/48));
        // Uniform high polar plateau; lower latitudes have an asymmetric coast.
        elevation.push(j>=44?.2:(x<32?.1:-.1));
    }
    const grid=makeThermalGrid(),terrain=sampleTerrainGrid(grid,directions,elevation),rt=new ThermalRuntime(grid);
    rt.enabled=true;rt.setTerrain(terrain.landFraction,terrain.landElevation,{directions,elevation});
    rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);
    const a=rt.sampleSurface(.15,.975)!,b=rt.sampleSurface(.65,.975)!;
    assert.ok(Math.abs(a.meanTemperatureK-b.meanTemperatureK)<.01,'The uniform polar plateau must not inherit different coastal sectors from the outer thermal ring');
    assert.ok(a.snowFraction>.2);assert.ok(Math.abs(a.snowFraction-b.snowFraction)<1e-9);
    assert.ok(rt.surfaceTexture!.height>=49,'The natural cover must resolve latitude within the polar cap');
    for(const u of [.05,.25,.5,.75,.95])assert.deepEqual(rt.sampleSurface(u,1),rt.sampleSurface(0,1));
    assert.equal(rt.model!.steps,0);
});

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
    const dry=surfaceCover(climate,290,0);assert.notDeepEqual(dry.color,summer.color);assert.equal(dry.biome,summer.biome);
});
test('rainless polar land with a short thaw stays barren rather than growing tundra',()=>{
    const climate={meanTemperatureK:220.842,warmestTemperatureK:279.641,annualRainMm:0};
    const dry=surfaceCover(climate,275,0);assert.equal(dry.biome,'barren');assert.equal(dry.snowFraction,0);
    assert.equal(surfaceCover({...climate,annualRainMm:200},275,.5).biome,'tundra');
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
