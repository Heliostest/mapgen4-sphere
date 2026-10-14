import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRemap,remapScalar} from '../earth-speedyweather-20261012/remap.mjs';
import {matchedSupport} from '../../../climate-diagnostics.ts';
const load=async p=>JSON.parse(await readFile(p,'utf8'));
const [g,gpcc,control,initial]=await Promise.all([
load('build/earth-speedy-moisture-monsoon/coupled-seasonal-geometry.json'),
load('docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json'),
load('build/earth-seasonal-pressure/full-control.json'),load('build/earth-seasonal-pressure/full-control-day0.json')]);
const map=createRemap(g),sum=a=>a.reduce((s,v)=>s+v,0),regions=[];
for(const r of control.gpcc){
 const support=matchedSupport(map,initial.runtime.state.land,r.bounds,gpcc.cells),weights=new Array(g.npoints).fill(0);
 for(let k=0;k<map.count;k++)for(const [i,a]of map.overlaps[k])weights[i]+=support.weights[k]/support.solidAngle*a/map.area;
 assert(Math.abs(sum(weights)-1)<1e-12);
 const check=g.lonDegrees.map((x,i)=>Math.sin(x)*Math.cos(g.latDegrees[i]));
 assert(Math.abs(sum(check.map((x,i)=>x*weights[i]))-support.mean(remapScalar(map,check).values))<1e-12);
 regions.push({name:r.name,support:'Frozen GPCC parent-grid support',bounds:r.bounds,weights});
 if(['India','Australia north'].includes(r.name)){
  const land=weights.map((w,i)=>w*g.landFraction[i]),total=sum(land);
  regions.push({name:r.name+' native land',support:'Land-mask-reweighted diagnostic support; not the original GPCC comparison',bounds:r.bounds,weights:land.map(w=>w/total)});
 }
}
for(const [name,b]of [['Arabian Sea',[5,20,50,72]],['Bay of Bengal',[5,20,80,100]],['Equatorial Indian Ocean',[-10,5,50,100]]]){
 const weights=g.weights.map((w,i)=>g.latDegrees[i]>=b[0]&&g.latDegrees[i]<=b[1]&&g.lonDegrees[i]>=b[2]&&g.lonDegrees[i]<=b[3]?w*(1-g.landFraction[i]):0),total=sum(weights);
 regions.push({name,support:'Native marine grid points inside bounds',bounds:{south:b[0],north:b[1],west:b[2],east:b[3]},weights:weights.map(w=>w/total)});
}
await mkdir('build/earth-speedy-transport',{recursive:true});
await writeFile('build/earth-speedy-transport/diagnostic-weights.json',JSON.stringify({npoints:g.npoints,sigma:g.sigmaFull,regions}));
console.log({regions:regions.map(r=>r.name),exactLinearRemapChecked:true});
