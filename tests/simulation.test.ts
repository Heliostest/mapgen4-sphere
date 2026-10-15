import test from 'node:test';
import assert from 'node:assert/strict';
import {ThermalRuntime} from '../thermal-runtime.ts';
import {circulationWinds} from '../climate.ts';
import {makeThermalGrid} from '../thermal.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';
import {encodeSimulationDocument,decodeSimulationDocument,MAX_SIMULATION_FILE_BYTES} from '../simulation-document.ts';
import {defaultTerrainParameters} from '../terrain-parameters.ts';
import {captureEnvironment} from '../environment-comparison.ts';
import {WaterModel,DEFAULT_WATER} from '../water.ts';
import {decodeRuntimeState} from '../runtime-state.ts';
import {DEFAULT_ENVIRONMENT} from '../environment.ts';

const planet={...DEFAULT_PLANET},orbit={...DEFAULT_ORBIT};
function runtime(water=true,separate=false) {
    const rt=new ThermalRuntime(makeThermalGrid(8,4));rt.enabled=true;rt.waterEnabled=water;
    if(separate)rt.config.separateReservoirs=true;
    rt.setTerrain(Float64Array.from({length:32},(_,i)=>i%3/2),Float64Array.from({length:32},(_,i)=>i%5/10));
    rt.sync(planet,orbit,1234,1234);return rt;
}
function advance(rt:ThermalRuntime,batches:number) {
    for(let j=0;j<batches;j++)rt.sync(planet,orbit,rt.model!.timeS+rt.maxAdvanceS,rt.model!.timeS);
}

test('switching bulk ocean exchange preserves stocks and resumes exactly after saving',()=>{
    const a=runtime(true,true);advance(a,1);
    const before=a.snapshot();
    a.configureSurfacePhysics({oceanEvaporationCoefficient:.0012});
    assert.equal(a.water!.config.oceanEvaporationCoefficient,.0012);
    assert.deepEqual(a.snapshot().state,before.state);
    const restored=ThermalRuntime.fromSnapshot(a.snapshot(),planet,orbit);
    assert.equal(restored.waterConfig.oceanEvaporationCoefficient,.0012);
    advance(a,2);advance(restored,2);assert.deepEqual(restored.snapshot(),a.snapshot());
    const evolved=a.snapshot();a.configureSurfacePhysics({oceanEvaporationCoefficient:null});
    assert.equal(a.waterConfig.oceanEvaporationCoefficient,undefined);
    assert.deepEqual(a.snapshot().state,evolved.state);
    const bad=a.snapshot();bad.waterConfig.oceanEvaporationCoefficient=-.001;
    assert.throws(()=>ThermalRuntime.fromSnapshot(bad,planet,orbit),/ocean evaporation coefficient/);
});

test('optional uplift closures roundtrip without new stocks and preserve exact continuation',()=>{
    const initial=runtime(true,true).snapshot();
    const switches={upliftScheme:'eddy-front' as const,consistentLiftTemperature:true,buoyantConvection:false,coldFrontDisplacement:true};
    Object.assign(initial.waterConfig,{moistureScheme:'transport',...switches});
    const a=ThermalRuntime.fromSnapshot(initial,planet,orbit);advance(a,1);
    const saved=JSON.parse(JSON.stringify(a.snapshot(),(_,v)=>ArrayBuffer.isView(v)?Array.from(v as Float64Array):v));
    const b=ThermalRuntime.fromSnapshot(saved,planet,orbit);
    for(const [key,value] of Object.entries(switches))assert.equal((b.waterConfig as any)[key],value);
    assert.ok(Object.values(b.water!.transportRain).every(a=>a.every(v=>v===0)),'Causal rates are invalidated on restoration');
    advance(a,1);advance(b,1);assert.deepEqual(a.snapshot(),b.snapshot());
    for(const key of ['consistentLiftTemperature','buoyantConvection','coldFrontDisplacement']){const bad=structuredClone(saved);bad.waterConfig[key]='yes';assert.throws(()=>decodeRuntimeState(bad),/switch/);}
    const bad=structuredClone(saved);bad.waterConfig.upliftScheme='other';assert.throws(()=>decodeRuntimeState(bad),/uplift/);
    for(const key of Object.keys(switches))assert.equal(key in DEFAULT_WATER,false,'Formal defaults are opt-out');
});

test('switching buoyant convection preserves current stocks and saved continuation',()=>{
    const initial=runtime(true,true).snapshot();initial.waterConfig.moistureScheme='transport';initial.config.airRadiationFraction=.5;
    const a=ThermalRuntime.fromSnapshot(initial,planet,orbit);advance(a,1);
    const before=a.snapshot();a.configureSurfacePhysics({buoyantConvection:true});
    assert.equal(a.water!.config.buoyantConvection,true);
    assert.deepEqual(a.snapshot().state,before.state);
    const restored=ThermalRuntime.fromSnapshot(JSON.parse(JSON.stringify(a.snapshot(),(_,v)=>ArrayBuffer.isView(v)?Array.from(v as Float64Array):v)),planet,orbit);
    advance(a,1);advance(restored,1);assert.deepEqual(a.snapshot(),restored.snapshot());
    const evolved=a.snapshot();a.configureSurfacePhysics({buoyantConvection:false});
    assert.equal(a.water!.config.buoyantConvection,false);assert.deepEqual(a.snapshot().state,evolved.state);
    const invalid=a.snapshot();assert.throws(()=>a.configureSurfacePhysics({buoyantConvection:'yes'} as any),/convection/);
    assert.deepEqual(a.snapshot(),invalid);
    assert.throws(()=>runtime(true,true).configureSurfacePhysics({buoyantConvection:true}),/transport/);
});

test('pressure-driven winds retain reversed offsets and exact JSON continuation without changing stocks',()=>{
    const initial=runtime(true,true).snapshot();initial.environmentConfig.dynamicCirculation=true;initial.environmentConfig.circulationScheme='thermal-pressure';initial.waterConfig.moistureScheme='transport';
    initial.environmentConfig.boundaryLayerDepthM=1000;
    initial.environmentConfig.pressureLayerDepthM=500;
    const g=makeThermalGrid(8,4),base=circulationWinds(g,planet,orbit,initial.state!.epochS,initial.state!.land,initial.waterConfig.windMps);
    initial.state!.circulation={atmosphere:{eastMps:new Float64Array(32),northMps:new Float64Array(32)},ocean:{circulationMps:new Float64Array(8*3)}};
    initial.state!.water!.windEastMps.set(base.eastMps);initial.state!.water!.windNorthMps.set(base.northMps);
    const a=ThermalRuntime.fromSnapshot(initial,planet,orbit);const before=a.water!.checkpoint();
    const applied=base.eastMps.map(v=>v>=0?-10:10),offset=applied.map((v,k)=>v-base.eastMps[k]);
    assert.ok(offset.some(v=>Math.abs(v)>15),'A real reversal exceeds the old departure-only envelope');
    a.environment!.atmosphere!.restore({eastMps:offset,northMps:new Float64Array(32)});a.water!.setWinds(applied,base.northMps);
    assert.deepEqual(a.water!.atmosphereKgM2,before.atmosphereKgM2);assert.ok(Math.abs(a.water!.diagnostics().residualMm)<1e-7);
    const saved=JSON.parse(JSON.stringify(a.snapshot(),(_,v)=>ArrayBuffer.isView(v)?Array.from(v as Float64Array):v));
    const b=ThermalRuntime.fromSnapshot(saved,planet,orbit);advance(a,1);advance(b,1);assert.deepEqual(a.snapshot(),b.snapshot());
    assert.equal(b.environmentConfig.pressureLayerDepthM,500);
    const invalid=structuredClone(saved);invalid.environmentConfig.circulationScheme='regional-monsoon';assert.throws(()=>decodeRuntimeState(invalid),/circulation scheme/);
    invalid.environmentConfig.circulationScheme='thermal-pressure';invalid.config.separateReservoirs=false;assert.throws(()=>decodeRuntimeState(invalid),/Pressure circulation/);
    invalid.config.separateReservoirs=true;invalid.environmentConfig.boundaryLayerDepthM=0;assert.throws(()=>decodeRuntimeState(invalid),/boundary-layer depth/);
    invalid.environmentConfig.boundaryLayerDepthM=1000;invalid.environmentConfig.pressureLayerDepthM=50;assert.throws(()=>decodeRuntimeState(invalid),/pressure-layer depth/);
    for(const key of ['circulationScheme','boundaryLayerDepthM','pressureLayerDepthM'])assert.equal(key in DEFAULT_ENVIRONMENT,false);
});

test('disabling dynamic circulation keeps experimental settings inactive and saveable',()=>{
    const initial=runtime(true,true).snapshot();initial.waterConfig.moistureScheme='transport';initial.environmentConfig.circulationScheme='balanced-pressure';initial.environmentConfig.boundaryLayerDepthM=1000;
    const parsed=decodeRuntimeState(initial);assert.equal(parsed.environmentConfig.dynamicCirculation,false);
    const rt=ThermalRuntime.fromSnapshot(parsed,planet,orbit);assert.equal(rt.environment!.atmosphere,null);
    assert.equal(rt.snapshot().environmentConfig.circulationScheme,'balanced-pressure');
});

test('compensated ocean transfers preserve stocks and exact JSON continuation',()=>{
    const initial=runtime(true,true).snapshot();initial.waterConfig.compensatedOceanTransfers=true;
    const a=ThermalRuntime.fromSnapshot(initial,planet,orbit);advance(a,2);
    const saved=JSON.parse(JSON.stringify(a.snapshot(),(_,v)=>ArrayBuffer.isView(v)?Array.from(v as Float64Array):v));
    assert.equal(typeof saved.state.water.oceanCorrection,'number');
    const b=ThermalRuntime.fromSnapshot(saved,planet,orbit);advance(a,2);advance(b,2);
    assert.deepEqual(b.snapshot(),a.snapshot());assert.ok(Math.abs(a.water!.diagnostics().residualMm)<1e-7);
    const bad=structuredClone(saved);bad.state.water.oceanCorrection=1;assert.throws(()=>decodeRuntimeState(bad),/ocean compensation/);
    bad.state.water.oceanCorrection=0;bad.waterConfig.compensatedOceanTransfers=false;assert.throws(()=>decodeRuntimeState(bad),/accumulation switch/);
    delete bad.state.water.oceanCorrection;bad.waterConfig.compensatedOceanTransfers='yes';assert.throws(()=>decodeRuntimeState(bad),/switch/);
    assert.equal('oceanCorrection' in initial.state!.water!,false);
});
test('surface closure switches preserve existing stocks, clocks and exact saved continuation',()=>{
    const rt=runtime(true,true);advance(rt,1);const old=rt.snapshot(),water=rt.water!.checkpoint(),thermal=rt.model!.checkpoint();
    rt.configureSurfacePhysics({separateSurfaceAlbedo:true,liquidOceanEvaporation:true});
    assert.deepEqual(rt.water!.checkpoint(),water);assert.deepEqual(rt.model!.temperatureK,thermal.temperatureK);assert.deepEqual(rt.model!.landTemperatureK,thermal.landTemperatureK);assert.deepEqual(rt.model!.oceanTemperatureK,thermal.oceanTemperatureK);
    assert.equal(rt.snapshot().state!.lastTarget,old.state!.lastTarget);assert.equal(rt.snapshot().state!.initialEnthalpy,old.state!.initialEnthalpy);
    const saved=rt.snapshot(),restored=ThermalRuntime.fromSnapshot(saved,planet,orbit);advance(rt,1);advance(restored,1);assert.deepEqual(restored.snapshot(),rt.snapshot());
    assert.ok(Math.abs(rt.water!.diagnostics().residualMm)<1e-7);assert.ok(Math.abs(rt.environment!.diagnostics().energyResidualJm2)<.001);
    const bad=structuredClone(saved);(bad.waterConfig as any).liquidOceanEvaporation=1;assert.throws(()=>decodeRuntimeState(bad),/switch/);
    const mixed=runtime().snapshot();mixed.environmentConfig.separateSurfaceAlbedo=true;assert.throws(()=>decodeRuntimeState(mixed),/separate thermal/);
});
test('conductive sea ice roundtrips with exact continuation and rejects incompatible reservoirs',()=>{
    const initial=runtime(true,true).snapshot();initial.environmentConfig.conductiveSeaIce=true;
    const a=ThermalRuntime.fromSnapshot(initial,planet,orbit);advance(a,2);
    const saved=a.snapshot(),b=ThermalRuntime.fromSnapshot(saved,planet,orbit);
    assert.equal(b.environment!.seaIceHeatTimeS,null,'a restored checkpoint has no recorded interval heat flux');
    assert.equal(b.environmentConfig.conductiveSeaIce,true);advance(a,1);advance(b,1);
    assert.equal(b.environment!.seaIceHeatTimeS,b.model!.timeS);
    assert.deepEqual(a.snapshot(),b.snapshot());assert.ok(Math.abs(a.environment!.diagnostics().energyResidualJm2)<.001);
    const time=a.model!.timeS;a.sync(planet,orbit,time+a.model!.stepS,time);a.sync(planet,orbit,time+2*a.model!.stepS,time);a.sync(planet,orbit,time,time);
    assert.equal(a.model!.timeS,time);assert.equal(a.environment!.seaIceHeatTimeS,null,'rollback must invalidate the future heat diagnostic');
    const bad=runtime().snapshot();bad.environmentConfig.conductiveSeaIce=true;
    assert.throws(()=>decodeRuntimeState(bad),/separate thermal reservoirs/);
});
test('independent under-ice transport switches survive decoding and exact continuation',()=>{
    for(const [conductiveSeaIce,underIceOcean] of [[true,false],[false,true]]) {
        const initial=runtime(true,true).snapshot();
        Object.assign(initial.environmentConfig,{conductiveSeaIce,underIceOcean});
        const a=ThermalRuntime.fromSnapshot(initial,planet,orbit);advance(a,1);
        const decoded=decodeRuntimeState(a.snapshot());
        assert.equal((decoded.environmentConfig as any).underIceOcean,underIceOcean);
        const b=ThermalRuntime.fromSnapshot(decoded,planet,orbit);advance(a,1);advance(b,1);
        assert.deepEqual(a.snapshot(),b.snapshot());
    }
    const bad=runtime(true,true).snapshot();(bad.environmentConfig as any).underIceOcean='yes';
    assert.throws(()=>decodeRuntimeState(bad));
});

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
        runtime:rt.snapshot(),view:{speed:86400,layer:'surface' as const,weather:false},comparison:{baseline,history:[{time:baseline.ageDays,metrics:baseline.metrics}]}};
}

test('high-detail terrain water survives JSON decoding without truncating its last cell',()=>{
    const d=JSON.parse(JSON.stringify(runtime().snapshot(),(_,v)=>ArrayBuffer.isView(v)?Array.from(v as Float64Array):v));
    d.environmentConfig.terrainWater=true;
    const n=215348,r={volumeM3:Array(n).fill(0),fluxM3S:Array(n).fill(0),receiverSide:Array(n).fill(-1)};
    r.volumeM3[n-1]=12.5;r.fluxM3S[n-1]=2;r.receiverSide[n-1]=3*n-1;
    d.state.water.routing=r;
    const restored=decodeRuntimeState(d).state!.water!.routing!;
    assert.equal(restored.volumeM3.length,n);
    assert.equal(restored.volumeM3[n-1],12.5);
    assert.equal(restored.receiverSide[n-1],646043);
    r.fluxM3S.pop();assert.throws(()=>decodeRuntimeState(d),/fluxM3S dimensions/);
    r.volumeM3=Array(250001).fill(0);assert.throws(()=>decodeRuntimeState(d),/terrain routing count/);
});
test('complete document preserves comparison baseline and all runtime state',()=>{
    const d=documentFixture(),decoded=decodeSimulationDocument(encodeSimulationDocument(d),identity,8);
    assert.deepEqual(decoded,d);decoded.runtime.state!.thermal.temperatureK[0]+=1;
    assert.notEqual(decoded.runtime.state!.thermal.temperatureK[0],d.runtime.state!.thermal.temperatureK[0]);
});
test('weather view preference roundtrips, defaults off for old saves, and rejects invalid switches and snowfall',()=>{
    const d=documentFixture();d.view.weather=true;const restored=decodeSimulationDocument(encodeSimulationDocument(d),identity,8);assert.equal(restored.view.weather,true);
    const old=JSON.parse(encodeSimulationDocument(d));delete old.view.weather;delete old.runtime.state.water.snowfallKgM2S;
    const legacy=decodeSimulationDocument(JSON.stringify(old),identity,8);assert.equal(legacy.view.weather,false);assert.equal(legacy.runtime.state!.water!.snowfallKgM2S,null);
    old.view.weather='yes';assert.throws(()=>decodeSimulationDocument(JSON.stringify(old),identity,8));
    const bad=documentFixture();bad.runtime.state!.water!.snowfallKgM2S=new Float64Array(32).fill(99);assert.throws(()=>encodeSimulationDocument(bad),/Snowfall/);
});
test('transport saves validate snowfall against actual land deposition and retain old uniform-deposition saves',()=>{
    const a=runtime(true,true),saved=a.snapshot();saved.waterConfig.moistureScheme='transport';
    const w=saved.state!.water!,k=1;
    w.precipitationKgM2S.fill(0);w.snowfallKgM2S=new Float64Array(32);w.precipitationKgM2S[k]=1;
    (w as any).landPrecipitationKgM2S=new Float64Array(32);(w as any).landPrecipitationKgM2S[k]=.8;w.snowfallKgM2S[k]=.7;
    const decoded=decodeRuntimeState(saved);assert.equal((decoded.state!.water as any).landPrecipitationKgM2S[k],.8);
    const restored=ThermalRuntime.fromSnapshot(saved,planet,orbit);
    assert.equal(restored.water!.landPrecipitationKgM2S[k],.8);assert.ok(Math.abs(restored.water!.oceanPrecipitationKgM2S[k]-.2)<1e-15);
    assert.deepEqual(restored.snapshot(),decoded);
    advance(restored,1);const next=ThermalRuntime.fromSnapshot(restored.snapshot(),planet,orbit);
    advance(restored,1);advance(next,1);assert.deepEqual(next.snapshot(),restored.snapshot());
    for(const invalid of [-1,NaN,1.1]){const bad=structuredClone(saved);(bad.state!.water as any).landPrecipitationKgM2S[k]=invalid;assert.throws(()=>decodeRuntimeState(bad),/land precipitation|landPrecipitation/);}
    w.snowfallKgM2S[k]=.9;assert.throws(()=>decodeRuntimeState(saved),/Snowfall/);
    delete (w as any).landPrecipitationKgM2S;w.snowfallKgM2S[k]=.4;
    const old=ThermalRuntime.fromSnapshot(saved,planet,orbit);assert.equal(old.water!.landPrecipitationKgM2S[k],.5);
    w.snowfallKgM2S[k]=.6;assert.throws(()=>decodeRuntimeState(saved),/Snowfall/);
    assert.equal('landPrecipitationKgM2S' in a.snapshot().state!.water!,false,'Formal legacy snapshots keep their original shape');
});
test('older complete v1 worlds without optional terrain routing retain coarse mode',()=>{
    const d=JSON.parse(encodeSimulationDocument(documentFixture()));delete d.runtime.environmentConfig.terrainWater;delete d.runtime.state.water.routing;
    delete d.runtime.environmentConfig.glaciers;delete d.runtime.state.initialLandIce;delete d.runtime.state.localLandIceSeed;
    for(const key of ['landIceKgM2','landIceCorrection','glacier'])delete d.runtime.state.water[key];
    delete d.comparison.baseline.landIceM;
    for(const metrics of [d.comparison.baseline.metrics,...d.comparison.history.map(h=>h.metrics)])for(const key of ['landIceMm','glacierSpeedMyr','glacialSolidResidualM'])delete metrics[key];
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
test('snapshot reservoir switch requires complete surface temperatures and rejects inconsistent legacy columns',()=>{
    const d=JSON.parse(JSON.stringify(runtime(true,true).snapshot(),(_,v)=>ArrayBuffer.isView(v)?Array.from(v as Float64Array):v));
    delete d.state.thermal.landTemperatureK;
    assert.throws(()=>decodeRuntimeState(d),/landTemperatureK/);
    d.state.thermal.landTemperatureK=Array(32).fill(270);d.state.thermal.oceanTemperatureK=Array(32).fill(280);
    const decoded=decodeRuntimeState(d);assert.equal(decoded.config.separateReservoirs,true);assert.equal(decoded.state!.thermal.oceanTemperatureK![0],280);
    delete d.state.thermal.oceanTemperatureK;assert.throws(()=>decodeRuntimeState(d),/oceanTemperatureK/);
    d.state.thermal.oceanTemperatureK=Array(32).fill(280);d.config.separateReservoirs=false;assert.throws(()=>decodeRuntimeState(d),/Unexpected.*reservoir/);
    delete d.config.separateReservoirs;delete d.state.thermal.landTemperatureK;delete d.state.thermal.oceanTemperatureK;
    d.state.surfaceReservoirInitial=null;
    assert.equal(decodeRuntimeState(d).config.separateReservoirs,undefined);
});
test('separate thermal reservoirs survive visible rollback and a JSON continuation without changing ice or energy',()=>{
    const a=runtime(true,true);advance(a,3);const visible=a.model!.timeS,saved=a.snapshot();
    assert.ok(saved.state!.thermal.landTemperatureK);assert.ok(saved.state!.thermal.oceanTemperatureK);
    a.sync(planet,orbit,visible+a.maxAdvanceS,visible);a.sync(planet,orbit,visible+2*a.maxAdvanceS,visible);a.sync(planet,orbit,visible,null);
    assert.deepEqual(a.snapshot(),saved);
    const b=ThermalRuntime.fromSnapshot(JSON.parse(JSON.stringify(saved,(_,v)=>ArrayBuffer.isView(v)?Array.from(v as Float64Array):v)),planet,orbit);
    assert.deepEqual(b.snapshot(),saved);advance(a,5);advance(b,5);assert.deepEqual(a.snapshot(),b.snapshot());
    assert.ok(Math.abs(a.water!.diagnostics().residualMm)<1e-7);assert.ok(Math.abs(a.environment!.diagnostics().energyResidualJm2)<1e-4);
});
