import test from 'node:test';
import assert from 'node:assert/strict';
import {GenerationGate} from '../generation-gate.ts';
import {TerrainApplication,bakeTerrainOffsets} from '../terrain-application.ts';
import {decodeTerrainDocument,encodeTerrainDocument,meshIdentity} from '../terrain-document.ts';
import {defaultTerrainParameters} from '../terrain-parameters.ts';
import {makeThermalGrid} from '../thermal.ts';
import {makeSphereMesh} from '../sphere-mesh.ts';
import {SphericalConstraints} from '../spherical-constraints.ts';
import Map from '../map.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';

const report={years:1000,sourceTimeS:86400,clipped:0,mobileKm3:1,oceanKm3:2};
const {mesh,t_peaks}=makeSphereMesh(120,35,12345);
const identity=meshIdentity(mesh,{spacing:5.5,mountainSpacing:35,mesh:{seed:12345}});
const settings={planet:{...DEFAULT_PLANET},orbit:{...DEFAULT_ORBIT},timeS:86400,camera:'space' as const};
const doc=()=>({format:'mapgen4-sphere-terrain' as const,version:1 as const,mesh:{...identity},
    constraints:{size:8,painted:true,values:Array(64).fill(.1)},offsets:Array(mesh.numTriangles).fill(-.01),
    report:{...report},parameters:defaultTerrainParameters(),settings:structuredClone(settings)});

test('generation gate coalesces requests and accepts only the desired revision',()=>{
    const g=new GenerationGate();assert.equal(g.pending,false);g.request();assert.equal(g.start(),1);
    g.request();g.request();assert.equal(g.start(),null);assert.equal(g.complete(1),false);
    assert.equal(g.pending,true);assert.equal(g.start(),3);assert.throws(()=>g.complete(2));
    assert.equal(g.complete(3),true);assert.equal(g.pending,false);assert.equal(g.accepted,3);
    assert.equal(g.start(),null);
});
test('bake subtracts raw baseline, clamps targets and never mutates source arrays',()=>{
    const grid=makeThermalGrid(4,2),field=(v:number)=>new Float64Array(grid.count).fill(v);
    const preview={grid,land:field(1),baseHeightM:field(1000),heightM:field(500)};
    const raw=new Float32Array([.8,-.5,.4]),physical=new Float32Array([.6,-.5,1]);
    const xyz=new Float32Array([0,0,1,1,0,0,0,1,0]);
    const baked=bakeTerrainOffsets(raw,physical,xyz,preview);
    assert.ok(Math.abs(baked.offsets[0]+.5)<1e-6);assert.equal(baked.offsets[1],0);
    assert.ok(Math.abs(baked.offsets[2]-.1)<1e-6);assert.equal(baked.clipped,0);
    preview.heightM.fill(10000);assert.equal(bakeTerrainOffsets(raw,physical,xyz,preview).clipped,2);
    assert.deepEqual(physical,new Float32Array([.6,-.5,1]));assert.throws(()=>bakeTerrainOffsets(raw,new Float32Array(0),xyz,preview));
});
test('application stores independent copies, repeated application undoes just the layer',()=>{
    const a=new TerrainApplication(),offsets=new Float32Array([.1,.2]);a.apply(offsets,report);offsets.fill(0);
    const first=a.offsets!.slice();a.apply(new Float32Array([.3,.4]),{...report,years:2000});
    assert.equal(a.canUndo,true);a.undo();assert.deepEqual(a.offsets,first);assert.equal(a.report!.years,1000);
    a.reset();assert.equal(a.offsets,null);assert.equal(a.canUndo,false);
});
test('document round trip validates full schema and rejects malformed, oversized and incompatible data',()=>{
    const original=doc(),encoded=encodeTerrainDocument(original);assert.deepEqual(decodeTerrainDocument(encoded,identity,8),original);
    const bad=[(d:any)=>d.version=2,(d:any)=>d.mesh.fingerprint='other',(d:any)=>d.offsets.pop(),
        (d:any)=>d.constraints.values[0]=2,(d:any)=>d.constraints.painted='yes',(d:any)=>d.parameters.elevation.seed=1.1,
        (d:any)=>d.parameters.render.zoom=0,(d:any)=>d.settings.planet.radiusM=0,(d:any)=>d.settings.planet.retrograde=1,
        (d:any)=>d.settings.orbit.distanceM='1',(d:any)=>d.settings.timeS=-1,(d:any)=>d.settings.camera='bad',
        (d:any)=>d.report.mobileKm3=-1,(d:any)=>d.report.clipped=.5,(d:any)=>d.offsets=null];
    for(const mutate of bad){const d=doc();mutate(d);assert.throws(()=>decodeTerrainDocument(JSON.stringify(d),identity,8));}
    assert.throws(()=>decodeTerrainDocument(' '.repeat(8*1024*1024+1),identity,8));
    assert.throws(()=>decodeTerrainDocument('null',identity,8));
});
test('real generator reapplies offsets before regions/rivers and undo retains later brushwork',()=>{
    const p=defaultTerrainParameters(),paint=new SphericalConstraints(8);paint.setElevationParam(p.elevation as any);
    const map=new Map(mesh,t_peaks,{spacing:5.5});
    const generate=(offsets:Float32Array|null)=>{
        map.assignElevation(p.elevation,{size:8,constraints:paint.elevation},offsets);
        map.assignRainfall(p.biomes);map.assignRivers(p.rivers);
        return {e:map.elevation_t.slice(),r:map.elevation_r.slice(),flow:map.flow_s.slice()};
    };
    const baseline=generate(null),a=new TerrainApplication();a.apply(new Float32Array(mesh.numTriangles).fill(-.1),report);
    const eroded=generate(a.offsets);assert.notDeepEqual(eroded,baseline);
    generate(a.offsets);assert.deepEqual(generate(a.offsets),eroded);assert.ok(map.elevation_t.every(x=>Number.isFinite(x)&&x>=-1&&x<=1));
    paint.beginStroke();paint.paintAt({elevation:1},.5,.5,{innerRadius:2,outerRadius:6,rate:8},100);
    const painted=paint.elevation.slice();a.undo();assert.deepEqual(paint.elevation,painted);
    const undone=generate(a.offsets);assert.deepEqual(undone,generate(null));assert.notDeepEqual(undone,baseline);
    const restored=new SphericalConstraints(8);restored.restore(p.elevation as any,painted,true);restored.setElevationParam(p.elevation as any);
    assert.deepEqual(restored.elevation,painted);assert.equal(restored.userHasPainted,true);
});

test('imported height provenance survives terrain save, load and erosion undo',()=>{
    const imported={...doc(),report:{...report,years:0,sourceTimeS:0,mobileKm3:0,oceanKm3:0,importedFrom:'NOAA ETOPO 2022'}};
    const restored=decodeTerrainDocument(encodeTerrainDocument(imported),identity,8);
    assert.deepEqual(restored.report,imported.report);
    const layer=new TerrainApplication();layer.restore(new Float32Array(restored.offsets!),restored.report);
    layer.apply(new Float32Array(mesh.numTriangles).fill(-.02),report);layer.undo();
    assert.deepEqual(layer.report,imported.report);
    for(const importedFrom of ['',42,'x'.repeat(201)]) {
        const invalid=structuredClone(imported) as any;invalid.report.importedFrom=importedFrom;
        assert.throws(()=>decodeTerrainDocument(JSON.stringify(invalid),identity,8));
    }
});

test('river generation can route water without cutting an imported elevation surface',()=>{
    const p=defaultTerrainParameters(),paint=new SphericalConstraints(8);paint.setElevationParam(p.elevation as any);
    const map=new Map(mesh,t_peaks,{spacing:5.5});
    map.assignElevation(p.elevation,{size:8,constraints:paint.elevation});
    // A closed depression catches the legacy river algorithm lowering its outlet.
    map.elevation_t.fill(.5);map.elevation_t[0]=-.5;map.elevation_t[mesh.numTriangles-1]=.01;
    map.assignRegionElevation();map.assignRainfall(p.biomes);
    const before=map.elevation_t.slice();
    map.assignRivers(p.rivers,true);
    assert.deepEqual(map.elevation_t,before);
    assert(map.flow_s.some(v=>v>0));assert(map.flow_s.every(Number.isFinite));
    map.assignRivers(p.rivers);
    assert.notDeepEqual(map.elevation_t,before,'legacy generated terrain still receives its river carving');
});
