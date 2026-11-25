import test from 'node:test';
import assert from 'node:assert/strict';
import {probeCell,probeYear,probeCSV} from './probe.ts';
import type {ClimateFrame} from './data.ts';

const frame=(month:number,seconds:number,rate=2)=>({month,seconds,width:4,height:2,temperatureK:Array(8).fill(273.15+month),rainMmDay:Array(8).fill(rate),eastMps:Array(8).fill(3),northMps:Array(8).fill(4)});
const year=()=>[31,28,31,30,31,30,31,31,30,31,30,31].map((days,i)=>frame(i+1,days*86400));

test('probe locates geographic points on the equal-area climate grid, including poles and dateline',()=>{
 assert.equal(probeCell(4,2,60,0).index,2);
 assert.equal(probeCell(4,2,-60,0).index,6);
 assert.equal(probeCell(4,2,0,180).index,probeCell(4,2,0,-180).index);
 assert.equal(probeCell(4,2,90,0).row,0);assert.equal(probeCell(4,2,-90,0).row,1);
 assert.equal(probeCell(4,2,60,90).column,3);
 assert.ok(probeCell(48,24,39.9,116.4).bounds.south<39.9);
 assert.throws(()=>probeCell(4,2,91,0));assert.throws(()=>probeCell(4,2,0,NaN));
});
test('monthly precipitation and annual mean use actual sampled seconds; monthly extrema are named explicitly',()=>{
 const data=year();data[1].seconds=27.5*86400;
 const result=probeYear(data,60,0);
 assert.equal(result.months[0].precipitationMm,62);assert.equal(result.months[1].precipitationMm,55);
 assert.equal(result.annualPrecipitationMm,729);assert.equal(result.durationDays,364.5);
 assert.equal(result.months[0].windVectorMps,5);
 const expected=data.reduce((s,m)=>s+m.month*m.seconds,0)/data.reduce((s,m)=>s+m.seconds,0);
 assert.ok(Math.abs(result.annualMeanTemperatureC-expected)<1e-12);
 assert.equal(result.coldestMonthTemperatureC,1);assert.equal(result.warmestMonthTemperatureC,12);
 assert.equal(result.months[0].eastMps,3);assert.equal(result.months[0].northMps,4);
});
test('point values come from the selected cell and zero-rain years have no wettest month',()=>{
 const data=year();data.forEach(m=>{m.rainMmDay=Array(8).fill(0);m.temperatureK=m.temperatureK.map((_,i)=>273.15+i);});
 assert.equal(probeYear(data,-60,0).months[0].temperatureC,6);
 assert.equal(probeYear(data,-60,0).wettestMonth,null);
 assert.throws(()=>probeYear(data.slice(0,11),0,0));
 assert.throws(()=>probeYear(data.map(m=>({...m,seconds:0})),0,0));
 const invalid=year();invalid[0].rainMmDay[2]=NaN;assert.throws(()=>probeYear(invalid,60,0));
});
test('CSV contains raw monthly totals and both model series rather than rounded chart values',()=>{
 const a=probeYear(year(),60,0),csv=probeCSV(60,0,a,a);
 assert.equal(csv.split('\r\n').length,25);assert.ok(csv.includes('precipitation_mm'));
 assert.ok(csv.includes('native,1,60,0,'));assert.ok(csv.includes('gcm,12,60,0,'));
});
