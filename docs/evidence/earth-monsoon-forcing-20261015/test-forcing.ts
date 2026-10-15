import assert from 'node:assert/strict';
import {centers,interpolate,nudge,Sum} from './forcing.ts';
const year=31558148.6231576,out=new Float64Array(1),fields=centers.map((_,j)=>[j]);
for(let j=0;j<12;j++){interpolate(fields,(centers[j]-78)/365*year,year,out);assert(Math.abs(out[0]-j)<1e-12);}
interpolate(fields,-78/365*year,year,out);assert(Math.abs(out[0]-5.5)<1e-12);
const atWrap=out[0];interpolate(fields,(365-78)/365*year,year,out);assert.equal(out[0],atWrap);
const t=new Float64Array([270,280]),c=[1e7,0],energy=new Float64Array(2);
nudge(t,c,[300,300],86400,86400,energy);
assert(Math.abs(t[0]-(300-30/Math.E))<1e-12);assert.equal(t[1],280);
assert.equal(energy[0],(t[0]-270)*1e7);assert.equal(energy[1],0);
const a=new Sum();a.add(1e9);for(let i=0;i<10000;i++)a.add(.00001);assert(Math.abs(a.total-(1e9+.1))<1e-7);
console.log('PASS: monthly centers, annual wrap, nudging heat, absent reservoir, compensated ledger');
