import test from 'node:test';
import assert from 'node:assert/strict';
import {makeThermalGrid} from '../thermal.ts';
import {cellBounds,sphericalOverlap,matchedSupport,CalendarFlux,VaporLedger} from '../climate-diagnostics.ts';
const world={south:-90,north:90,west:-180,east:180};
test('equal-area parent bounds cover the sphere and clip a dateline region',()=>{
 const g=makeThermalGrid(8,4);
 const areas=Array.from({length:g.count},(_,k)=>sphericalOverlap(world,cellBounds(g,k)));
 assert.ok(areas.every(a=>Math.abs(a-4*Math.PI/g.count)<1e-14));
 const crossing={south:-30,north:30,west:170,east:-170};
 const a=Array.from({length:g.count},(_,k)=>sphericalOverlap(crossing,cellBounds(g,k))).reduce((x,y)=>x+y,0);
 assert.ok(Math.abs(a-20*Math.PI/180)<1e-14);
});
test('observed and modeled rain share exactly the same valid land support',()=>{
 const g=makeThermalGrid(4,2),land=new Float64Array([1,.5,0,1,1,.5,0,1]);
 const cells=[{bounds:{south:0,north:90,west:-180,east:-90},monthlyMm:new Float64Array(12).fill(10)},
 {bounds:{south:0,north:90,west:-90,east:0},monthlyMm:new Float64Array(12).fill(30)},
 {bounds:{south:0,north:90,west:0,east:90},monthlyMm:new Float64Array(12).fill(1e6)},
 {bounds:{south:0,north:90,west:90,east:180},monthlyMm:new Float64Array(12).fill(NaN)}];
 const s=matchedSupport(g,land,world,cells);
 assert.ok(Math.abs(s.solidAngle-3*Math.PI/4)<1e-14);
 assert.ok(Math.abs(s.observedMonthlyMm[0]-50/3)<1e-12);
 assert.ok(Math.abs(s.mean(new Float64Array([10,30,1e6,1e6,1e6,1e6,1e6,1e6]))-50/3)<1e-12);
});
test('calendar accumulation splits real flux at March/April and wraps December',()=>{
 const year=365*86400,c=new CalendarFlux(1,year,78);
 c.add(10*86400,3*86400,new Float64Array([2/86400]));
 assert.equal(c.months[2][0],4);assert.equal(c.months[3][0],2);
 const d=new CalendarFlux(1,year,364);d.add(0,2*86400,new Float64Array([1/86400]));
 assert.equal(d.months[11][0],1);assert.equal(d.months[0][0],1);
 assert.equal(d.total[0],2);
});
test('vapor ledger integrates rates with actual dt and transport as a per-step amount',()=>{
 const v=new VaporLedger(new Float64Array([5,2]));
 v.add(900,new Float64Array([1/900,0]),new Float64Array([0,2/900]),new Float64Array([.5,-.5]));
 const r=v.residual(new Float64Array([6.5,-.5]));
 assert.deepEqual(Array.from(r),[0,0]);
 assert.deepEqual(Array.from(v.evaporation),[1,0]);
 assert.deepEqual(Array.from(v.precipitation),[0,2]);
});
