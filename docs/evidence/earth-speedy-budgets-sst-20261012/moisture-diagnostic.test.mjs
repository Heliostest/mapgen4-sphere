import test from 'node:test';
import assert from 'node:assert/strict';
import {moistureConvergence} from './moisture-diagnostic.mjs';
test('Closed spherical faces conserve global transport and reproduce an analytic zonal gradient',()=>{
 const W=96,H=48,R=6371000,n=W*H,e=new Float64Array(n),v=new Float64Array(n);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)e[y*W+x]=Math.sin(-Math.PI+(x+.5)*2*Math.PI/W);
 const c=moistureConvergence(e,v,{width:W,height:H},R);
 assert(Math.abs(c.reduce((s,x)=>s+x,0))<1e-10);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const φ=Math.asin(1-(y+.5)*2/H),λ=-Math.PI+(x+.5)*2*Math.PI/W;
  const analytic=-86400/R*Math.cos(λ)/Math.cos(φ);
  assert(Math.abs(c[y*W+x]-analytic)<Math.abs(analytic)*.001+1e-15);
 }
});
test('Uniform east transport has no convergence',()=>{
 const c=moistureConvergence(new Float64Array(1152).fill(10),new Float64Array(1152),{width:48,height:24},6371000);
 assert(c.every(x=>x===0));
});
