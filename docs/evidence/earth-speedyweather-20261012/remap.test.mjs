import test from 'node:test';
import assert from 'node:assert/strict';
import {createRemap,remapScalar} from './remap.mjs';
const grid={latDegrees:[30,30,30,30,-30,-30],lonDegrees:[0,90,180,270,0,180],weights:[.125,.125,.125,.125,.25,.25]};
const mean=a=>Array.from(a).reduce((s,v)=>s+v,0)/a.length;
test('Gaussian quadrature footprints cover the sphere, wrap the dateline and preserve a constant field',()=>{
 const map=createRemap(grid,48,24);assert.ok(map,'A conservative map must be returned');
 assert.equal(map.count,1152);const r=remapScalar(map,new Float64Array(6).fill(7));assert.ok(r,'A regridded field must be returned');
 for(const v of r.values)assert.ok(Math.abs(v-7)<1e-12);
 for(const v of r.coverage)assert.ok(Math.abs(v-1)<1e-12);
});
test('land rain and marine ice retain their separate area totals across reduced latitude rings',()=>{
 const map=createRemap(grid,48,24);assert.ok(map,'A conservative map must be returned');
 const land=[1,1,.5,0,.2,.8],rain=[10,4,8,5,12,0],ice=[0,.5,1,.3,.4,.9];
 const p=remapScalar(map,rain,land),c=remapScalar(map,ice,land.map(v=>1-v));
 assert.ok(p&&c,'Both masked fields must be returned');
 const expected=(v,m)=>v.reduce((s,x,k)=>s+x*m[k]*grid.weights[k],0);
 assert.ok(Math.abs(mean(p.values.map((v,k)=>v*p.coverage[k]))-expected(rain,land))<1e-12);
 assert.ok(Math.abs(mean(c.values.map((v,k)=>v*c.coverage[k]))-expected(ice,land.map(v=>1-v)))<1e-12);
});
test('invalid geometry and field units cannot silently enter the observation comparison',()=>{
 assert.throws(()=>createRemap({...grid,weights:[1,1,1,1,1,1]},48,24),/weight/);
 const map=createRemap(grid,48,24);assert.ok(map,'A conservative map must be returned');
 assert.throws(()=>remapScalar(map,[1,2]),/length/);
 assert.throws(()=>remapScalar(map,[1,2,3,4,5,NaN]),/finite/);
 assert.throws(()=>remapScalar(map,[1,2,3,4,5,6],[1,1,1,1,1,-.1]),/mask/);
});
