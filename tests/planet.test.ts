import test from 'node:test';
import assert from 'node:assert/strict';
import {derivePlanet, physicalHeight, displayExaggeration} from '../planet.ts';
import {deriveOrbit, sunState, incidentFlux, localSolarHour} from '../astronomy.ts';
import {SimulationClock} from '../simulation-clock.ts';
import {mat4,vec3} from 'gl-matrix';
import {makePlanetView} from '../planet-render.ts';
import {sphereProjection,pickTerrainHit} from '../sphere-view.ts';

const earth = {schemaVersion:1 as const, radiusM:6371008.4, densityKgM3:5513.4,
    reliefM:10000, oceanDepthM:11000, siderealPeriodS:86164.09054,
    retrograde:false, obliquityRad:23.43928*Math.PI/180};
const orbit = {distanceM:149597870700, bondAlbedo:.3, spinPhaseRad:0, orbitPhaseRad:0};
const close = (actual:number, expected:number, tolerance=1e-9) => assert.ok(
    Math.abs(actual-expected)<=tolerance,`${actual} differs from ${expected} by more than ${tolerance}`);

test('Earth-scale SI inputs produce published gravity, mass and escape speed',()=>{
    const p=derivePlanet(earth);
    close(p.massKg/1e24,5.972, .002);
    close(p.gravityMps2,9.82,.01);
    close(p.escapeMps/1000,11.19,.01);
    close(p.surfaceAreaM2/1e12,510.066,.01);
    assert.ok(p.rotationRatio>0 && p.rotationRatio<.004);
});

test('doubling physical radius at fixed density scales mass by eight and gravity by two',()=>{
    const a=derivePlanet(earth),b=derivePlanet({...earth,radiusM:2*earth.radiusM});
    close(b.massKg/a.massKg,8); close(b.gravityMps2/a.gravityMps2,2);
    close(b.escapeMps/a.escapeMps,2); close(b.surfaceAreaM2/a.surfaceAreaM2,4);
    close(b.rotationRatio,a.rotationRatio);
});

test('physical altitude is independent of scene radius and artistic mountain height',()=>{
    close(physicalHeight(.5,earth),5000); close(physicalHeight(-.5,earth),-5500);
    close(displayExaggeration(earth,300,50),106.18347333333333);
    close(displayExaggeration(earth,1000,50),31.855042);
    close(physicalHeight(.5,{...earth,reliefM:20000}),10000);
});

test('invalid physical and orbit inputs cannot create NaN or infinite derived state',()=>{
    for (const field of ['radiusM','densityKgM3','reliefM','oceanDepthM','siderealPeriodS']) {
        for(const value of [0,-1,NaN,Infinity]) assert.throws(()=>derivePlanet({...earth,[field]:value}));
    }
    for(const value of [-.1,1.1,NaN]) assert.throws(()=>deriveOrbit(earth,{...orbit,bondAlbedo:value}));
    assert.throws(()=>deriveOrbit(earth,{...orbit,distanceM:0}));
});

test('solar preset at one AU gives a year, stellar flux and radiation equilibrium independently',()=>{
    const a=deriveOrbit(earth,orbit);
    close(a.yearS/86400,365.256,.01); close(a.fluxWm2,1361.17,.1);
    close(a.equilibriumK,254.6,.2); close(a.solarDayS,86400,.02);
    const b=deriveOrbit({...earth,radiusM:2*earth.radiusM},orbit);
    close(a.equilibriumK,b.equilibriumK); close(a.fluxWm2,b.fluxWm2);
    const far=deriveOrbit(earth,{...orbit,distanceM:2*orbit.distanceM});
    close(far.fluxWm2/a.fluxWm2,.25); close(far.yearS/a.yearS,Math.sqrt(8));
});

test('body sun moves west under prograde spin and north at northern solstice',()=>{
    const zero={...earth,obliquityRad:0};
    const equinox=sunState(zero,orbit,0);
    equinox.direction.forEach((n,i)=>close(n,[0,0,1][i]));
    const quarter=sunState(zero,{...orbit,spinPhaseRad:Math.PI/2},0);
    quarter.direction.forEach((n,i)=>close(n,[-1,0,0][i]));
    const solstice=sunState(earth,{...orbit,orbitPhaseRad:Math.PI/2},0);
    close(solstice.declinationRad,earth.obliquityRad);
    close(incidentFlux([0,-1,0],solstice.direction,1000),0);
    assert.ok(incidentFlux([0,1,0],solstice.direction,1000)>390);
    close(localSolarHour([0,0,1],[0,0,1])!,12);
    close(localSolarHour([1,0,0],[0,0,1])!,18);
    assert.equal(localSolarHour([0,1,0],[0,0,1]),null);
});

test('retrograde and synchronous spin preserve a finite sun direction',()=>{
    const regular=sunState({...earth,obliquityRad:0},orbit,3600);
    const backwards=sunState({...earth,obliquityRad:0,retrograde:true},orbit,3600);
    assert.ok(regular.direction[0]<0 && backwards.direction[0]>0);
    assert.ok(deriveOrbit({...earth,retrograde:true},orbit).solarDayS<earth.siderealPeriodS);
    const synchronous={...earth,obliquityRad:0,siderealPeriodS:deriveOrbit(earth,orbit).yearS};
    assert.equal(deriveOrbit(synchronous,orbit).solarDayS,Infinity);
    const fixed=sunState(synchronous,orbit,1e9);
    fixed.direction.forEach((n,i)=>close(n,[0,0,1][i],1e-7));
});

test('spherical area integration of instantaneous sunlight approaches one quarter of flux',()=>{
    const sun=sunState(earth,{...orbit,orbitPhaseRad:1.1,spinPhaseRad:2.2},0).direction;
    let total=0; const count=20000;
    for(let i=0;i<count;i++) {
        const y=1-2*(i+.5)/count,r=Math.sqrt(1-y*y),theta=i*2.399963229728653;
        total+=incidentFlux([r*Math.cos(theta),y,r*Math.sin(theta)],sun,1000);
    }
    close(total/count,250,.02);
});

test('clock uses elapsed seconds consistently at 30, 60 and 144Hz',()=>{
    for(const hz of [30,60,144]) {
        const clock=new SimulationClock(0,3600);
        clock.setPlaying(true,0);
        for(let frame=1;frame<=hz*5;frame++) clock.tick(frame*1000/hz);
        close(clock.timeS,18000,1e-6);
    }
});

test('pause, resume, seek and speed changes cannot catch up hidden wall time',()=>{
    const clock=new SimulationClock(0,10);
    clock.setPlaying(true,0); clock.tick(1000); close(clock.timeS,10);
    clock.setPlaying(false,1000); clock.tick(500000); close(clock.timeS,10);
    clock.setPlaying(true,500000); clock.tick(501000); close(clock.timeS,20);
    clock.setSpeed(20,501000); clock.tick(502000); close(clock.timeS,40);
    clock.seek(500,502000); clock.tick(503000); close(clock.timeS,520);
    clock.tick(502000); close(clock.timeS,520);
    assert.throws(()=>clock.setSpeed(NaN,503000));
    assert.throws(()=>clock.seek(Infinity,503000));
});

test('painting pauses at the presented frame rather than a queued future rotation',()=>{
    const clock=new SimulationClock(0,10);
    clock.setPlaying(true,0);clock.tick(1000);
    clock.pauseAt(9,1000);close(clock.timeS,9);assert.equal(clock.playing,false);
    clock.tick(99999);close(clock.timeS,9);
    // Repeated pointer updates cannot rewind an already-paused/edited time.
    clock.seek(20,100000);clock.pauseAt(9,100000);close(clock.timeS,20);
});

test('space view rotates the planet separately from camera while surface view stays fixed',()=>{
    const p={...earth,obliquityRad:0};
    const phase={...orbit,spinPhaseRad:Math.PI/2};
    const camera={x:500,y:500,rotate_deg:0,tilt_deg:0,zoom:100/350};
    const space=makePlanetView(p,phase,0,'day-night','space');
    const projected=vec3.transformMat4(vec3.create(),[0,0,300],sphereProjection(camera,space.model).projection);
    close(projected[0],6/7,1e-6); close(projected[1],0,1e-6);
    const surface=makePlanetView(p,phase,0,'day-night','surface');
    assert.equal(surface.model,null);
    assert.deepEqual(space.sunDirection,surface.sunDirection);
});

test('rotated terrain hit retains original barycentric data for physical elevation probing',()=>{
    const directions=Float32Array.from([-.1,-.1,1,.1,-.1,1,0,.1,1]);
    for(let i=0;i<3;i++) {
        const l=Math.hypot(...directions.subarray(i*3,i*3+3));
        for(let j=0;j<3;j++) directions[i*3+j]/=l;
    }
    const positions=Float32Array.from(directions,v=>v*330);
    const model=mat4.create();mat4.rotateY(model,model,.4);mat4.rotateZ(model,model,.3);
    const {projection}=sphereProjection({x:500,y:500,rotate_deg:0,tilt_deg:0,zoom:100/350},model);
    const world=[0,0,0];const weights=[.2,.3,.5];
    for(let i=0;i<3;i++) for(let k=0;k<3;k++) world[k]+=weights[i]*positions[3*i+k];
    const clip=vec3.transformMat4(vec3.create(),world as [number,number,number],projection);
    const hit=pickTerrainHit([(clip[0]+1)/2,(1-clip[1])/2],mat4.invert(mat4.create(),projection)!,positions,new Int32Array([0,1,2]),directions);
    assert.ok(hit);assert.deepEqual(hit.indices,[0,1,2]);
    hit.weights.forEach((w,i)=>close(w,weights[i],1e-5));
    assert.ok(hit.uv[0]>.5 && hit.uv[0]<.51);
});
