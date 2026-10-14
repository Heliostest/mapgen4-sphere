import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeComparison,decodeComparisonText,createReplaySelection,switchReplayCase,activeReplay,packedReplayKey,readReplayProbe} from './comparison-contract.ts';
import {packDisplayLayer} from '../earth-speedyweather-20261012/display-contract.ts';

// Synthetic contract fixtures only. Never emitted as delivered model data.
function fixture():any {
    const field=(value:number)=>Array(1152).fill(value);
    const cases=[
        {id:'reference',label:'原配置 · 50 m 混合层',description:'原始独立实验，预算未修正。',temperature:270,pressure:100000},
        {id:'slab',label:'修复后 · 自由海温',description:'排水记账和干空气质量约束，海温自由演化。',temperature:280,pressure:101000},
        {id:'seasonal',label:'修复后 · 规定季节海温',description:'相同修复；海温边界外部热量单独记账。',temperature:290,pressure:102000},
    ].map(({temperature,pressure,...identity})=>({...identity,data:{
        format:'speedyweather-earth-display',version:1,
        model:{name:'SpeedyWeather',version:'0.23.0',truncation:32,nlayers:8,precision:'Float64',statisticsStart:'2006-01-01T00:00:00Z',statisticsEnd:'2007-01-01T00:00:00Z'},
        grid:{width:48,height:24,layout:'equal-area-north-first',longitudeWestDeg:-180},
        sigmaFull:[.0625,.1875,.3125,.4375,.5625,.6875,.8125,.9375],
        frames:Array.from({length:12},(_,i)=>({
            label:`2006年${i+1}月平均`,kind:'monthly-mean',month:i+1,timeS:i*2592000,
            layers:Array.from({length:8},()=>({temperatureK:field(temperature+i),windEastMps:field(10.123456789),windNorthMps:field(-12.345678901)})),
            surface:{pressurePa:field(pressure),seaIceConcentration:field(.25),rainMmDay:field(3)},
        })),
        acceptance:{formalDefaultUnchanged:true,regionalClimateAccepted:false},
    }}));
    return {format:'speedyweather-sst-comparison',version:1,initialAtmLandSHA:'4c665c83b08918fad6f8b67968fae472539c8796515afc93a22099d682b44a68',cases};
}

test('comparison decodes independent full precision case data without clipping temperature',()=>{
    const input=fixture();input.cases[2].data.frames[0].layers[0].temperatureK[0]=180;
    input.cases[2].data.frames[0].layers[0].temperatureK[1]=340;
    const decoded=decodeComparisonText(JSON.stringify(input));
    assert.ok(decoded?.cases,'decoder must return validated cases');
    assert.deepEqual(decoded.cases.map(c=>c.id),['reference','slab','seasonal']);
    const air=decoded.cases[2].data.frames[0].layers[0];
    assert.ok(air.temperatureK instanceof Float64Array);
    assert.deepEqual(Array.from(air.temperatureK.slice(0,2)),[180,340]);
    assert.equal(air.windEastMps[0],10.123456789);
    air.windEastMps[0]=0;
    assert.equal(input.cases[2].data.frames[0].layers[0].windEastMps[0],10.123456789);
});

test('rejects wrong envelope identity and initial 2001 atmosphere/land inventory SHA',()=>{
    for(const mutate of [
        (d:any)=>d.format='invented', (d:any)=>d.version=2,
        (d:any)=>delete d.initialAtmLandSHA, (d:any)=>d.initialAtmLandSHA='f'.repeat(64),
    ]){const d=fixture();mutate(d);assert.throws(()=>decodeComparison(d));}
    for(const source of ['', '{', 'null', '[]', '{}'])assert.throws(()=>decodeComparisonText(source));
});

test('rejects missing, duplicate, reordered or misleading case identities',()=>{
    for(const mutate of [
        (d:any)=>d.cases.pop(), (d:any)=>d.cases.push(d.cases[0]),
        (d:any)=>d.cases[1].id='reference', (d:any)=>d.cases[2].id='predicted-ocean',
        (d:any)=>[d.cases[0],d.cases[1]]=[d.cases[1],d.cases[0]],
        (d:any)=>d.cases[2].label='闭合海洋预测', (d:any)=>d.cases[2].description='',
    ]){const d=fixture();mutate(d);assert.throws(()=>decodeComparison(d));}
});

test('checks every case model, statistics year and acceptance state',()=>{
    for(const mutate of [
        (d:any)=>d.cases[0].data.model.version='0.22.0',
        (d:any)=>d.cases[1].data.model.precision='Float32',
        (d:any)=>d.cases[2].data.model.statisticsStart='2001-01-01T00:00:00Z',
        (d:any)=>d.cases[2].data.model.statisticsEnd='2006-12-31T00:00:00Z',
        (d:any)=>d.cases[0].data.acceptance.formalDefaultUnchanged=false,
        (d:any)=>d.cases[1].data.acceptance.regionalClimateAccepted=true,
    ]){const d=fixture();mutate(d);assert.throws(()=>decodeComparison(d));}
});

test('rejects other sigma coordinates even when top-to-bottom order is valid',()=>{
    const d=fixture();d.cases[1].data.sigmaFull=[.025,.095,.20,.34,.51,.69,.85,.96];
    assert.throws(()=>decodeComparison(d),/slab.*sigmaFull/);
});

test('retains monthly, grid, field and physical surface validation with case context',()=>{
    for(const mutate of [
        (d:any)=>d.cases[2].data.frames[1].month=1,
        (d:any)=>d.cases[2].data.frames[1].kind='instantaneous',
        (d:any)=>d.cases[2].data.grid.layout='latitude-north-first',
        (d:any)=>d.cases[2].data.frames[0].layers[0].temperatureK.pop(),
        (d:any)=>d.cases[2].data.frames[0].layers[0].temperatureK[0]=NaN,
        (d:any)=>d.cases[2].data.frames[0].surface.pressurePa[0]=0,
        (d:any)=>d.cases[2].data.frames[0].surface.rainMmDay[0]=-1,
        (d:any)=>d.cases[2].data.frames[0].surface.seaIceConcentration[0]=1.01,
    ]){const d=fixture();mutate(d);assert.throws(()=>decodeComparison(d),/seasonal/);}
});

test('out-of-range actual wind fails the comparison instead of clipping for byte encoding',()=>{
    for(const value of [-100.01,100.01]){
        const d=fixture();d.cases[1].data.frames[0].layers[0].windEastMps[0]=value;
        assert.throws(()=>decodeComparison(d),/slab.*windEastMps/);
    }
});

test('replay defaults to seasonal January near-surface wind',()=>{
    const document=decodeComparison(fixture()),selection=createReplaySelection();
    assert.deepEqual(selection,{caseId:'seasonal',frameIndex:0,levelIndex:7,layer:'wind'});
    const active=activeReplay(document,selection);
    assert.equal(active.case.id,'seasonal');assert.equal(active.frame.month,1);
    assert.equal(active.air.temperatureK[0],290);assert.equal(active.sigma,.9375);
});

test('switching cases preserves month, layer and field choice while selecting fresh case data',()=>{
    const document=decodeComparison(fixture());
    const before={caseId:'seasonal' as const,frameIndex:6,levelIndex:3,layer:'temperature' as const};
    const after=switchReplayCase(document,before,'reference');
    assert.deepEqual(after,{caseId:'reference',frameIndex:6,levelIndex:3,layer:'temperature'});
    assert.equal(before.caseId,'seasonal');
    const active=activeReplay(document,after);
    assert.equal(active.frame.month,7);assert.equal(active.sigma,.4375);
    assert.equal(active.air.temperatureK[0],276);assert.equal(active.frame.surface.pressurePa[0],100000);
    assert.equal(activeReplay(document,before).air.temperatureK[0],296);
});

test('packed texture cache separates case identity at the same month and level',()=>{
    const before={caseId:'seasonal' as const,frameIndex:4,levelIndex:7,layer:'wind' as const};
    const after={...before,caseId:'slab' as const};
    assert.notEqual(packedReplayKey(before),packedReplayKey(after));
});

test('invalid case or selection cannot fall back silently to another dataset',()=>{
    const document=decodeComparison(fixture()),selection=createReplaySelection();
    assert.throws(()=>switchReplayCase(document,selection,'unknown' as any));
    for(const mutate of [
        (s:any)=>s.caseId='unknown', (s:any)=>s.frameIndex=-1, (s:any)=>s.frameIndex=12,
        (s:any)=>s.frameIndex=.5, (s:any)=>s.levelIndex=8, (s:any)=>s.levelIndex=NaN,
        (s:any)=>s.layer='rain',
    ]){const s={...selection};mutate(s);assert.throws(()=>activeReplay(document,s));}
});

test('existing renderer packing reports temperature saturation but preserves raw fields',()=>{
    const input=fixture(),air=input.cases[2].data.frames[0].layers[0];
    air.temperatureK[0]=180;air.temperatureK[1]=340;air.windEastMps[0]=-100;air.windNorthMps[0]=100;
    const packed=packDisplayLayer(air);
    assert.deepEqual(Array.from(packed.pixels.slice(0,4)),[0,1,255,255]);
    assert.equal(packed.temperatureSaturated,2);assert.equal(air.temperatureK[0],180);
});

test('probe follows the selected case and derives layer pressure from actual surface pressure',()=>{
    const input=fixture(),air=input.cases[0].data.frames[6].layers[3];
    air.windEastMps[600]=3;air.windNorthMps[600]=4;air.temperatureK[600]=180;
    const document=decodeComparison(input),selection={caseId:'reference' as const,frameIndex:6,levelIndex:3,layer:'wind' as const};
    const probe=readReplayProbe(document,selection,600);
    assert.equal(probe.caseId,'reference');assert.equal(probe.month,7);assert.equal(probe.levelIndex,3);
    assert.equal(probe.longitudeDeg,3.75);assert.equal(probe.temperatureK,180);
    assert.equal(probe.windEastMps,3);assert.equal(probe.windNorthMps,4);assert.equal(probe.windSpeedMps,5);
    assert.equal(probe.surfacePressurePa,100000);assert.equal(probe.pressurePa,43750);
    assert.equal(probe.seaIceConcentration,.25);assert.equal(probe.rainMmDay,3);
    const switched=switchReplayCase(document,selection,'seasonal');
    assert.equal(readReplayProbe(document,switched,600).temperatureK,296);
    assert.equal(readReplayProbe(document,switched,600).surfacePressurePa,102000);
});

test('probe rejects invalid cell indices instead of returning undefined raw values',()=>{
    const document=decodeComparison(fixture()),selection=createReplaySelection();
    for(const cell of [-1,1152,.5,NaN])assert.throws(()=>readReplayProbe(document,selection,cell));
});
