import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRemap,remap,rawFields,displayTextures,validateFrame,sampleMonth,type ClimateFrame} from './data.ts';

test('end-of-step samples assign January closing step to January and year closing step to December',()=>{
 assert.equal(sampleMonth(0,2700),0);assert.equal(sampleMonth(991,2700),0);assert.equal(sampleMonth(992,2700),1);
 assert.equal(sampleMonth(11679,2700),11);assert.throws(()=>sampleMonth(11680,2700));
});

test('Gaussian remapping preserves the area integral, Greenwich and the dateline',()=>{
 const map=makeRemap(8,[.5,.5,.5,.5],8,4);
 const values=Float64Array.from({length:32},(_,k)=>k%8===0?100:k%8===4?20:0);
 const out=remap(map,values);
 assert.ok(Math.abs(out.reduce((s,v)=>s+v,0)/32-15)<1e-10);
 assert.equal(out[4],50);assert.equal(out[7],10);assert.equal(out[0],10);
 const constant=remap(map,new Float64Array(32).fill(7));assert.ok(constant.every(v=>Math.abs(v-7)<1e-12));
});
test('unequal Gaussian weights preserve north/south and weighted means',()=>{
 const weights=[.2,.8,.8,.2],map=makeRemap(8,weights,8,4);
 const src=Float64Array.from({length:32},(_,k)=>Math.floor(k/8));
 const out=remap(map,src);assert.ok(out[0]<out[24]);
 assert.ok(Math.abs(out.reduce((s,v)=>s+v,0)/32-1.5)<1e-12);
 assert.throws(()=>makeRemap(8,[1,1,1],8,4));
});
test('native precipitation units and temperature are retained correctly',()=>{
 const f=rawFields([273.15],[1e-7],[3],[-4]);
 assert.equal(f.temperatureK[0],273.15);assert.ok(Math.abs(f.rainMmDay[0]-8.64)<1e-12);
 assert.equal(f.eastMps[0],3);assert.equal(f.northMps[0],-4);
});
test('comparison textures use existing fixed scales and reject invalid fields',()=>{
 const frame:ClimateFrame={width:1,height:1,temperatureK:[273.15],rainMmDay:[10],eastMps:[3],northMps:[-4]};
 const t=displayTextures(frame);assert.equal(t.thermal.pixels[0],146);assert.equal(t.water.pixels[0],128);
 assert.equal(t.thermal.pixels[1],132);assert.equal(t.thermal.pixels[2],123);
 assert.throws(()=>validateFrame({...frame,rainMmDay:[NaN]}));
 assert.throws(()=>validateFrame({...frame,eastMps:[]}));
 assert.throws(()=>validateFrame({...frame,rainMmDay:[-1]}));
});
