import assert from 'node:assert/strict';
import {test} from 'node:test';
import {makeSphereMesh, SphereMesh} from '../sphere-mesh.ts';
import {directionToUV, uvToDirection, sampleSphere, atlasTriangles} from '../sphere.ts';
import {SphericalConstraints} from '../spherical-constraints.ts';
import Map from '../map.ts';
import Geometry from '../geometry.ts';
import {sphereProjection, terrainPosition, pickTerrain} from '../sphere-view.ts';
import {mat4,vec3} from 'gl-matrix';

test('sphere has no boundary and every halfedge closes reciprocally', () => {
    const {mesh} = makeSphereMesh(600, 35, 12345);
    assert.equal(mesh.numRegions - mesh.numSides/2 + mesh.numTriangles, 2);
    assert.equal(mesh.numSolidRegions, mesh.numRegions);
    for (let s = 0; s < mesh.numSides; s++) {
        const opposite = mesh.s_opposite_s(s);
        assert.ok(opposite >= 0);
        assert.equal(mesh.s_opposite_s(opposite), s);
        assert.equal(mesh.r_begin_s(s), mesh.r_end_s(opposite));
        assert.ok(mesh.length_s[s] > 0 && mesh.length_s[s] < 180);
    }
    for (let r = 0; r < mesh.numRegions; r++) {
        assert.equal(mesh.is_ghost_r(r), false);
        assert.ok(mesh.r_around_r(r).length >= 3);
        const p = mesh.xyz_r.subarray(3*r, 3*r+3);
        assert.ok(Math.abs(Math.hypot(...p) - 1) < 1e-6);
    }
});

test('production-density ridge and valley folds do not invert or collapse', () => {
    const {mesh,t_peaks}=makeSphereMesh(26919,35,12345);
    assert.ok(mesh.length_s.reduce((min,value)=>Math.min(min,value),Infinity)>2.5);
    const map=new Map(mesh,t_peaks,{spacing:5.5});
    const indices=new Int32Array(mesh.numSolidSides*3), em=new Float32Array((mesh.numRegions+mesh.numTriangles)*2);
    const positions=new Float32Array(3*(mesh.numRegions+mesh.numTriangles));
    positions.set(mesh.xyz_r);positions.set(mesh.xyz_t,mesh.xyz_r.length);
    let expectedSign=0;
    for(const elevation of [-.1,.1]) {
        map.elevation_r.fill(elevation);map.elevation_t.fill(elevation);
        Geometry.setMapGeometry(map,.05,indices,em);
        for(let i=0;i<indices.length;i+=3) {
            const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
            const ax=positions[a],ay=positions[a+1],az=positions[a+2];
            const bx=positions[b]-ax,by=positions[b+1]-ay,bz=positions[b+2]-az;
            const cx=positions[c]-ax,cy=positions[c+1]-ay,cz=positions[c+2]-az;
            const winding=ax*(by*cz-bz*cy)+ay*(bz*cx-bx*cz)+az*(bx*cy-by*cx);
            if(!expectedSign) expectedSign=Math.sign(winding);
            assert.ok(winding*expectedSign>1e-8,`inverted/collapsed fold at ${i/3}, elevation ${elevation}`);
        }
    }
});

test('painting crosses the date line and poles without touching antipodes', () => {
    const field = new SphericalConstraints(64);
    field.elevation.fill(0);
    field.beginStroke();
    const brush = {innerRadius: 2, outerRadius: 6, rate: 8};
    field.paintAt({elevation: 1}, 0, .5, brush, 100);
    assert.ok(field.elevation[32*64] > .3);
    assert.ok(field.elevation[32*64+63] > .3);
    assert.equal(field.elevation[32*64+32], 0);
    field.beginStroke();
    field.paintAt({elevation: 1}, .3, 0, brush, 100);
    for (let x=0;x<64;x++) assert.equal(field.elevation[x], field.elevation[0]);
});

test('closed drainage terminates with every triangle visited even without oceans', () => {
    const {mesh,t_peaks} = makeSphereMesh(600,35,12345);
    const map = new Map(mesh,t_peaks,{spacing:5.5});
    map.elevation_t.fill(.2); map.rainfall_r.fill(.5);
    map.assignRivers({flow:.2});
    assert.equal(new Set(map.t_order).size,mesh.numTriangles);
    assert.equal(Array.from(map.s_downslope_t).filter(s=>s<0).length,1);
    assert.ok(map.flow_s.every(Number.isFinite));
});

test('coordinate sampling wraps the meridian and ignores longitude at poles', () => {
    assert.deepEqual(uvToDirection(.5, .5), [0, 0, 1]);
    const [u,v] = directionToUV([1,0,0]);
    assert.equal(u, .75); assert.equal(v, .5);
    const data = new Float32Array([1,2,3,4, 5,6,7,8, 9,10,11,12, 13,14,15,16]);
    assert.equal(sampleSphere(data, 4, 0, .5), sampleSphere(data, 4, 1, .5));
    assert.equal(sampleSphere(data, 4, 0, 0), sampleSphere(data, 4, .65, 0));
});

test('atlas triangles straddling meridian are local on both edges', () => {
    const tris = atlasTriangles([[990,400], [10,420], [5,380]]);
    assert.equal(tris.length, 2);
    for (const tri of tris) {
        assert.ok(Math.max(...tri.map(p=>p[0])) - Math.min(...tri.map(p=>p[0])) <= 20);
    }
});

test('sphere mesh survives a worker structured clone including the last region', () => {
    const original=makeSphereMesh(600,35,12345).mesh;
    const copy=new SphereMesh(structuredClone(original));
    assert.equal(copy.numSolidRegions,600);
    assert.equal(copy.is_ghost_r(599),false);
    assert.deepEqual(copy.xyz_r,original.xyz_r);
    assert.deepEqual(copy.t_around_r(599),original.t_around_r(599));
});

test('polar atlas cap has area up to the pole, with the same surface attributes', () => {
    const tris=atlasTriangles([[500,0,1],[450,10,.2],[550,10,.4]]);
    assert.equal(tris.length,2);
    let area=0;
    for(const [a,b,c] of tris) area+=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;
    assert.equal(area,1000);
    assert.equal(tris[1][2][2],1);
});

test('terrain picking returns original surface UV under oblique relief and rotated views', () => {
    const directions=Float32Array.from([-.05,-.04,1, .05,-.04,1, 0,.07,1]);
    for(let i=0;i<9;i+=3) {
        const len=Math.hypot(...directions.subarray(i,i+3));
        for(let k=0;k<3;k++) directions[i+k]/=len;
    }
    for(const camera of [{x:500,y:500},{x:600,y:350}]) {
        const {projection,rotation}=sphereProjection({...camera,zoom:.4,tilt_deg:0,rotate_deg:20});
        const positions=new Float32Array(9);
        for(let i=0;i<3;i++) positions.set(terrainPosition(directions.subarray(3*i,3*i+3),.8,150,rotation),3*i);
        const center=[0,0,0], base=[0,0,0];
        for(let i=0;i<3;i++) for(let k=0;k<3;k++){center[k]+=positions[3*i+k]/3;base[k]+=directions[3*i+k]/3;}
        const clip=vec3.transformMat4(vec3.create(),center,projection);
        const inverse=mat4.invert(mat4.create(),projection);
        const hit=pickTerrain([(clip[0]+1)/2,(1-clip[1])/2],inverse,positions,new Int32Array([0,1,2]),directions);
        const expected=directionToUV(base);
        assert.ok(hit && Math.abs(hit[0]-expected[0])<1e-6 && Math.abs(hit[1]-expected[1])<1e-6);
        assert.equal(pickTerrain([-10,-10],inverse,positions,new Int32Array([0,1,2]),directions),null);
    }
});

test('generation is deterministic, drains without cycles, and produces finite render buffers', () => {
    const {mesh,t_peaks}=makeSphereMesh(26919,35,12345);
    const map=new Map(mesh,t_peaks,{spacing:5.5});
    const field=new SphericalConstraints();
    field.setElevationParam({seed:187,island:.5});
    const initial=field.elevation.slice(); field.generate();
    assert.deepEqual(field.elevation,initial);
    const elevation={seed:187,noisy_coastlines:.01,mountain_sharpness:9.8,hill_height:.02,ocean_depth:1.4,mountain_jagged:0};
    map.assignElevation(elevation,{constraints:field.elevation,size:field.size});
    map.assignRainfall({wind_angle_deg:40,raininess:.9,rain_shadow:.5,evaporation:.5});
    map.assignRivers({flow:.2});
    const rank=new Int32Array(mesh.numTriangles);
    map.t_order.forEach((t,i)=>rank[t]=i);
    for(let t=0;t<mesh.numTriangles;t++) {
        const s=map.s_downslope_t[t];
        if(s>=0 && map.elevation_t[t]>=-.1) assert.ok(rank[mesh.t_outer_s(s)]<rank[t]);
    }
    const indices=new Int32Array(mesh.numSolidSides*3), em=new Float32Array((mesh.numRegions+mesh.numTriangles)*2);
    Geometry.setMapGeometry(map,.05,indices,em);
    const firstEM=em.slice(), firstIndices=indices.slice();
    // Exercise reuse of one generator across seed changes, as the worker does.
    field.setElevationParam({seed:188,island:.5});
    map.assignElevation({...elevation,seed:188},{constraints:field.elevation,size:field.size});
    map.assignRainfall({wind_angle_deg:40,raininess:.9,rain_shadow:.5,evaporation:.5});
    map.assignRivers({flow:.2});
    field.setElevationParam({seed:187,island:.5});
    map.assignElevation(elevation,{constraints:field.elevation,size:field.size});
    map.assignRainfall({wind_angle_deg:40,raininess:.9,rain_shadow:.5,evaporation:.5});
    map.assignRivers({flow:.2});
    Geometry.setMapGeometry(map,.05,indices,em);
    assert.deepEqual(em,firstEM);
    assert.deepEqual(indices,firstIndices);
    assert.ok(em.every(Number.isFinite));
    assert.ok(indices.every(v=>v>=0 && v<mesh.numRegions+mesh.numTriangles));
    const rivers=new Float32Array(mesh.numSolidTriangles*9*7);
    const count=Geometry.setRiverGeometry(map,5.5,{lg_min_flow:-3,lg_river_width:-2.4},rivers);
    assert.ok(count>0);
    assert.ok(rivers.subarray(0,count*21).every(Number.isFinite));
    map.elevation_t.fill(-.2);map.elevation_r.fill(-.2);
    map.assignRivers({flow:.2});
    assert.equal(Geometry.setRiverGeometry(map,5.5,{lg_min_flow:-3,lg_river_width:-2.4},rivers),0);
});
