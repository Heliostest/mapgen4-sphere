import test from 'node:test';
import assert from 'node:assert/strict';
import {ThermalRuntime} from '../thermal-runtime.ts';
import {makeThermalGrid} from '../thermal.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';
import {encodeSimulationDocument,decodeSimulationDocument,MAX_SIMULATION_FILE_BYTES} from '../simulation-document.ts';
import {defaultTerrainParameters} from '../terrain-parameters.ts';
import {captureEnvironment} from '../environment-comparison.ts';
import {WaterModel,DEFAULT_WATER} from '../water.ts';

const planet={...DEFAULT_PLANET},orbit={...DEFAULT_ORBIT};
function runtime(water=true) {
    const rt=new ThermalRuntime(makeThermalGrid(8,4));rt.enabled=true;rt.waterEnabled=water;
    rt.setTerrain(Float64Array.from({length:32},(_,i)=>i%3/2),Float64Array.from({length:32},(_,i)=>i%5/10));
    rt.sync(planet,orbit,1234,1234);return rt;
}
function advance(rt:ThermalRuntime,batches:number) {
    for(let j=0;j<batches;j++)rt.sync(planet,orbit,rt.model!.timeS+rt.maxAdvanceS,rt.model!.timeS);
}
test('a JSON save and reload continues exactly with conserved budgets and geographic cover',()=>{
    const a=runtime();advance(a,15);
    assert.equal(typeof a.snapshot,'function','runtime must expose a complete snapshot');
    const saved=JSON.stringify(a.snapshot(),(_,v)=>ArrayBuffer.isView(v)?Array.from(v as Float64Array):v);
    const b=ThermalRuntime.fromSnapshot(JSON.parse(saved),planet,orbit);
    assert.deepEqual(b.snapshot(),a.snapshot());assert.deepEqual(b.surfaceTexture,a.surfaceTexture);
    advance(a,12);advance(b,12);
    assert.deepEqual(b.snapshot(),a.snapshot());assert.deepEqual(b.surfaceTexture,a.surfaceTexture);
    assert.ok(Math.abs(b.water!.diagnostics().residualMm)<1e-7);
    assert.ok(Math.abs(b.environment!.diagnostics().energyResidualJm2)<1e-4);
    b.model!.temperatureK[0]+=1;assert.notEqual(b.model!.temperatureK[0],a.model!.temperatureK[0]);
});

const identity={regions:4,triangles:4,spacing:5.5,mountainSpacing:35,seed:12345,fingerprint:'fixture'};
function documentFixture() {
    const rt=runtime();advance(rt,2);const baseline=captureEnvironment(rt)!;
    return {format:'mapgen4-sphere-simulation' as const,version:1 as const,
        terrain:{format:'mapgen4-sphere-terrain' as const,version:1 as const,mesh:identity,constraints:{size:8,painted:false,values:Array(64).fill(0)},offsets:null,report:null,parameters:defaultTerrainParameters(),settings:{planet,orbit,timeS:rt.model!.timeS,camera:'surface' as const}},
        runtime:rt.snapshot(),view:{speed:86400,layer:'surface' as const},comparison:{baseline,history:[{time:baseline.ageDays,metrics:baseline.metrics}]}};
}
test('complete document preserves comparison baseline and all runtime state',()=>{
    const d=documentFixture(),decoded=decodeSimulationDocument(encodeSimulationDocument(d),identity,8);
    assert.deepEqual(decoded,d);decoded.runtime.state!.thermal.temperatureK[0]+=1;
    assert.notEqual(decoded.runtime.state!.thermal.temperatureK[0],d.runtime.state!.thermal.temperatureK[0]);
});
test('older complete v1 worlds without optional terrain routing retain coarse mode',()=>{
    const d=JSON.parse(encodeSimulationDocument(documentFixture()));delete d.runtime.environmentConfig.terrainWater;delete d.runtime.state.water.routing;
    const restored=decodeSimulationDocument(JSON.stringify(d),identity,8);assert.equal(restored.runtime.environmentConfig.terrainWater,false);assert.equal(restored.runtime.state!.water!.routing,null);
});
test('invalid files cannot produce a replacement world',()=>{
    const original=encodeSimulationDocument(documentFixture());
    const mutations=[
        d=>d.version=2,d=>d.terrain.mesh.fingerprint='other',d=>d.runtime.state.thermal.temperatureK.pop(),
        d=>d.runtime.state.thermal.radiationCorrection=null,d=>d.runtime.state.thermal.steps=-1,
        d=>d.runtime.state.water.snowKgM2[0]=-1,d=>d.runtime.config.emissivity=0,
        d=>d.runtime.state.vegetation.weights[0]=5,d=>d.runtime.state.water.elapsedS+=100,
        d=>d.runtime.state.stepS=100,d=>d.terrain.settings.timeS+=1,
        d=>d.comparison.baseline.width=10,d=>d.comparison.history[0].metrics.albedo='bad',
        d=>d.comparison.baseline.parameters='invalid JSON',d=>d.view.layer='missing',
        d=>{d.runtime.state=null;d.comparison.history=[];},d=>d.runtime.state.thermal.albedo[0]=0,
    ];
    for(const mutate of mutations){const bad=JSON.parse(original);mutate(bad);assert.throws(()=>decodeSimulationDocument(JSON.stringify(bad),identity,8),mutate.toString());}
    assert.throws(()=>decodeSimulationDocument(' '.repeat(MAX_SIMULATION_FILE_BYTES+1),identity,8));
});
test('thermal-only and disabled worlds preserve their state and options',()=>{
    for(const a of [runtime(false),new ThermalRuntime()]) {
        assert.equal(typeof a.snapshot,'function');a.environmentConfig.vegetation=false;
        if(a.model){a.sync(planet,orbit,a.model.timeS,a.model.timeS);advance(a,2);}
        const b=ThermalRuntime.fromSnapshot(JSON.parse(JSON.stringify(a.snapshot(),(_,v)=>ArrayBuffer.isView(v)?Array.from(v as Float64Array):v)),planet,orbit);
        assert.deepEqual(b.snapshot(),a.snapshot());
        if(a.model){advance(a,2);advance(b,2);assert.deepEqual(b.snapshot(),a.snapshot());}
    }
});
test('saving after visible-frame rollback includes flux and compensated budgets from that frame',()=>{
    const rt=runtime();advance(rt,3);const visible=rt.model!.timeS,expected=rt.snapshot();
    rt.sync(planet,orbit,visible+rt.maxAdvanceS,visible);
    rt.sync(planet,orbit,visible+2*rt.maxAdvanceS,visible);
    rt.sync(planet,orbit,visible,null);
    assert.deepEqual(rt.snapshot(),expected);
    const restored=ThermalRuntime.fromSnapshot(rt.snapshot(),planet,orbit);
    advance(rt,2);advance(restored,2);assert.deepEqual(restored.snapshot(),rt.snapshot());
});
test('a paused unsupported-spin world preserves its enabled switches without inventing climate',()=>{
    const rt=new ThermalRuntime(),slow={...planet,siderealPeriodS:1e8};rt.enabled=rt.waterEnabled=true;
    rt.setTerrain(new Float64Array(rt.grid.count));rt.sync(slow,orbit,10,10);
    assert.equal(rt.model,null);
    const restored=ThermalRuntime.fromSnapshot(rt.snapshot(),slow,orbit);
    assert.deepEqual(restored.snapshot(),rt.snapshot());
    assert.throws(()=>ThermalRuntime.fromSnapshot(rt.snapshot(),planet,orbit),/missing its state/);
});
test('seeding snow from exhausted surface and soil stores cannot leave negative roundoff',()=>{
    const grid=makeThermalGrid(8,4),w=new WaterModel(grid,planet.radiusM,new Float64Array(32).fill(1),new Float64Array(32),new Float64Array(32).fill(260),DEFAULT_WATER);
    w.soilKgM2.fill(.1);w.surfaceKgM2.fill(.2);const before=w.diagnostics().totalMm;
    w.seedFrozen(new Float64Array(32).fill(10),new Float64Array(32));
    assert.ok(w.soilKgM2.every(v=>v>=0));assert.ok(w.surfaceKgM2.every(v=>v>=0));
    assert.ok(Math.abs(w.diagnostics().totalMm-before)<1e-12);
});
