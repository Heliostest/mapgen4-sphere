import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeDisplay,decodeDisplayText,packDisplayLayer,displayCell} from './display-contract.ts';

// Synthetic contract fixtures only. These values are never delivered as model data.
function fixture():any {
    const field=(value:number)=>Array(1152).fill(value);
    return {
        format:'speedyweather-earth-display',version:1,
        model:{name:'SpeedyWeather',version:'0.23.0',truncation:32,nlayers:8,precision:'Float64',statisticsStart:'2006-01-01T00:00:00Z',statisticsEnd:'2007-01-01T00:00:00Z'},
        grid:{width:48,height:24,layout:'equal-area-north-first',longitudeWestDeg:-180},
        sigmaFull:[.025,.095,.20,.34,.51,.69,.85,.96],
        frames:Array.from({length:12},(_,i)=>({
            label:`2006年${i+1}月平均`,kind:'monthly-mean',month:i+1,timeS:i*2592000,
            layers:Array.from({length:8},()=>({temperatureK:field(273.15),windEastMps:field(10),windNorthMps:field(-10)})),
            surface:{pressurePa:field(101325),seaIceConcentration:field(.25),rainMmDay:field(3)},
        })),
        acceptance:{formalDefaultUnchanged:true,regionalClimateAccepted:false},
    };
}

test('valid monthly fields retain unquantized values in independent Float64 arrays',()=> {
    const input=fixture();input.frames[0].layers[0].windEastMps[4]=12.345678901234;
    const decoded=decodeDisplayText(JSON.stringify(input));
    assert.ok(Array.isArray(decoded.frames),'decoder must return validated monthly frames');
    assert.equal(decoded.frames.length,12);
    assert.ok(decoded.frames[0].layers[0].windEastMps instanceof Float64Array);
    assert.equal(decoded.frames[0].layers[0].windEastMps[4],12.345678901234);
    decoded.frames[0].layers[0].windEastMps[4]=1;
    assert.equal(input.frames[0].layers[0].windEastMps[4],12.345678901234);
});

test('rejects wrong model, date range, dataset identity and unsupported acceptance state',()=> {
    for(const mutate of [
        (d:any)=>d.format='invented', (d:any)=>d.version=2,
        (d:any)=>d.model.name='Template', (d:any)=>d.model.version='0.22.0',
        (d:any)=>d.model.truncation=31, (d:any)=>d.model.nlayers=7,
        (d:any)=>d.model.precision='Float32', (d:any)=>d.model.statisticsStart='2005-01-01T00:00:00Z',
        (d:any)=>d.model.statisticsEnd='2008-01-01T00:00:00Z',
        (d:any)=>d.acceptance.formalDefaultUnchanged=false,
        (d:any)=>d.acceptance.regionalClimateAccepted=true,
    ]){const d=fixture();mutate(d);assert.throws(()=>decodeDisplay(d));}
});

test('rejects grid shape, north-first convention and field length mismatches',()=> {
    for(const mutate of [
        (d:any)=>d.grid.width=96, (d:any)=>d.grid.height=25,
        (d:any)=>d.grid.layout='latitude-north-first', (d:any)=>d.grid.longitudeWestDeg=0,
        (d:any)=>d.frames[0].layers[0].temperatureK.pop(),
        (d:any)=>d.frames[11].layers[7].windNorthMps.push(0),
        (d:any)=>d.frames[0].surface.pressurePa.pop(),
        (d:any)=>d.frames[0].layers.pop(), (d:any)=>d.frames.pop(),
    ]){const d=fixture();mutate(d);assert.throws(()=>decodeDisplay(d));}
});

test('rejects non-finite fields and physically invalid surface values',()=> {
    for(const mutate of [
        (d:any)=>d.frames[0].layers[0].temperatureK[0]=NaN,
        (d:any)=>d.frames[0].layers[0].windEastMps[0]=Infinity,
        (d:any)=>d.frames[11].surface.rainMmDay[0]=-1,
        (d:any)=>d.frames[11].surface.pressurePa[0]=0,
        (d:any)=>d.frames[11].surface.seaIceConcentration[0]=1.01,
        (d:any)=>d.frames[0].layers[0].temperatureK[0]=0,
        (d:any)=>d.frames[0].timeS=-1, (d:any)=>d.frames[0].timeS=NaN,
    ]){const d=fixture();mutate(d);assert.throws(()=>decodeDisplay(d));}
});

test('rejects invalid sigma coordinate and top-to-bottom ordering',()=> {
    for(const sigma of [[.1,.2,.3,.4,.5,.6,.7],[0,.1,.2,.3,.4,.5,.6,.7],[.1,.2,.3,.4,.5,.6,.7,1.1],[.1,.2,.3,.3,.5,.6,.7,.8],[.9,.8,.7,.6,.5,.4,.3,.2],[.1,.2,.3,.4,.5,.6,.7,NaN]]) {
        const d=fixture();d.sigmaFull=sigma;assert.throws(()=>decodeDisplay(d));
    }
});

test('rejects instantaneous frames, duplicate or unordered months, and missing labels',()=> {
    for(const mutate of [
        (d:any)=>d.frames[0].kind='instantaneous',
        (d:any)=>d.frames[1].month=1,
        (d:any)=>[d.frames[0],d.frames[1]]=[d.frames[1],d.frames[0]],
        (d:any)=>d.frames[0].label='',
        (d:any)=>d.frames[0].label=null,
    ]){const d=fixture();mutate(d);assert.throws(()=>decodeDisplay(d));}
});

test('temperature colors saturate explicitly while signed winds retain flow orientation',()=> {
    const layer=fixture().frames[0].layers[0];
    layer.temperatureK.splice(0,5,180,193.15,273.15,333.15,340);
    layer.windEastMps.splice(0,5,-100,-10,0,10,100);layer.windNorthMps.splice(0,5,100,10,0,-10,-100);
    const packed=packDisplayLayer(layer);
    assert.deepEqual(Array.from(packed.pixels.slice(0,20)),[
        0,1,255,255, 0,115,141,255, 146,128,128,255, 255,141,115,255, 255,255,1,255,
    ]);
    assert.equal(packed.temperatureSaturated,2);
    assert.equal(layer.temperatureK[0],180);
    assert.equal(layer.windEastMps[0],-100);
});

test('winds outside byte encoding range are rejected without silent velocity clipping',()=> {
    for(const value of [-100.01,100.01]) {
        const d=fixture();d.frames[0].layers[0].windEastMps[0]=value;
        assert.throws(()=>decodeDisplay(d),/wind|风|velocity/i);
    }
    const d=fixture();const layer=d.frames[0].layers[0];layer.windNorthMps[0]=101;
    assert.throws(()=>packDisplayLayer(layer),/wind|风|velocity/i);
});

test('inspector maps equal-area cells north-first and wraps the longitude seam',()=> {
    assert.equal(displayCell(0,0),0);
    assert.equal(displayCell(1,0),0);
    assert.equal(displayCell(-.001,0),47);
    assert.equal(displayCell(.5,.5),600);
    assert.equal(displayCell(.5,1),1128);
    assert.equal(displayCell(.5,.25),168);
    assert.throws(()=>displayCell(NaN,.5));
});

test('malformed JSON and missing document members are rejected',()=> {
    for(const source of ['', '{', 'null', '[]', '{}'])assert.throws(()=>decodeDisplayText(source));
});
