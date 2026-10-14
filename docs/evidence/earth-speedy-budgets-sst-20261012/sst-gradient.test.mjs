import test from 'node:test';
import assert from 'node:assert/strict';
import {sstGradient} from './sst-gradient.mjs';
test('Native uneven marine weights recover a known two-dimensional temperature plane',()=>{
 const lat=[5,6,8,10,12,15],lon=[60,70,90,85,65,75],w=[.1,.2,0,.3,.25,.15],T=lat.map((y,i)=>300+.4*y-.1*lon[i]);
 const a=sstGradient(T,lat,lon,w,6371000);
 assert(Math.abs(a.eastKPerDegree+.1)<1e-12);assert(Math.abs(a.northKPerDegree-.4)<1e-12);
 const uniform=sstGradient(T.map(()=>300),lat,lon,w,6371000);assert.equal(uniform.eastKPer1000Km,0);assert.equal(uniform.northKPer1000Km,0);
});
