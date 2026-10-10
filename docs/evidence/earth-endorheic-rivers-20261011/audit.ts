import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {makeMesh} from '../../../mesh.ts';
import config,{HIGH_DETAIL_SPACING} from '../../../config.js';
import Map from '../../../map.ts';
import Geometry from '../../../geometry.ts';
import {decodeSimulationDocument,encodeSimulationDocument} from '../../../simulation-document.ts';
import {meshIdentity} from '../../../terrain-document.ts';
import {ThermalRuntime} from '../../../thermal-runtime.ts';
import {sampleTerrainGrid} from '../../../thermal.ts';
import {channelNetwork,riverChannelField} from '../../../river-channels.ts';
import {terrainWaterView} from '../../../terrain-water-view.ts';
import {directionToUV,uvToDirection} from '../../../sphere.ts';
const folder='docs/evidence/earth-endorheic-rivers-20261011',scene='scenes/earth-land-sea',baseline='fdf4b6b';
await mkdir('build/endorheic',{recursive:true});
config.spacing=HIGH_DETAIL_SPACING;const {mesh,t_peaks}=await makeMesh(),identity=meshIdentity(mesh,config);
const text=await readFile(`${scene}/earth-simulation.json`,'utf8'),d=decodeSimulationDocument(text,identity,128),old=JSON.parse(execFileSync('git',['show',`${baseline}:${scene}/earth-simulation.json`],{maxBuffer:30*1024*1024,encoding:'utf8'}));
assert.deepEqual(d.runtime,decodeSimulationDocument(JSON.stringify(old),identity,128).runtime);
assert.deepEqual(d.terrain.offsets,old.terrain.offsets);assert.deepEqual(d.terrain.constraints,old.terrain.constraints);
assert.equal(d.runtime.waterConfig.moistureScheme,undefined);
const map=new Map(mesh,t_peaks,config);map.assignElevation(d.terrain.parameters.elevation,{size:128,constraints:new Float32Array(d.terrain.constraints.values)},new Float32Array(d.terrain.offsets!));map.assignRainfall(d.terrain.parameters.biomes);map.assignRivers(d.terrain.parameters.rivers,true);
const elevation=new Float32Array(mesh.numRegions+mesh.numTriangles);elevation.set(map.elevation_r);elevation.set(map.elevation_t,mesh.numRegions);
const quads=new Int32Array(mesh.numSolidSides*3);Geometry.setMapGeometry(map,0,quads,new Float32Array(elevation.length*2));
const source={mesh,directions:mesh.xyz_r,elevation,quadElements:quads,drainage:d.terrain.drainage},rt=ThermalRuntime.fromSnapshot(d.runtime,d.terrain.settings.planet,d.terrain.settings.orbit),sample=sampleTerrainGrid(rt.grid,mesh.xyz_r,elevation);
rt.attachRestoredTerrain(sample.landFraction,sample.landElevation,source);
const w=rt.water!,net=w.routing!.network,channels=channelNetwork(mesh,net),rank=new Int32Array(mesh.numTriangles);
channels.order.forEach((t,i)=>rank[t]=i);
let closedEdges=0,lakeTriangles=0;
for(let t=0;t<mesh.numTriangles;t++) {
    if((net.inlandLakeId?.[t]??0)>0){lakeTriangles++;assert(net.cell[t]>=0);assert(net.bedM[t]<=0);}
    const s=channels.receiverSide[t];if(s<0)continue;const to=mesh.t_outer_s(s);
    assert(rank[to]<rank[t],'Receiver must precede every donor; no cycles');
    if((net.endorheic?.[t]??0)>0){closedEdges++;assert.equal(net.endorheic![to],net.endorheic![t]);}
}
const nearest=(lat:number,lon:number)=>{
    const v=uvToDirection((lon+180)/360,(90-lat)/180);let t=0,best=-Infinity;
    for(let i=0;i<mesh.numTriangles;i++){const q=v.reduce((sum,x,c)=>sum+x*mesh.xyz_t[3*i+c],0);if(q>best){best=q;t=i;}}
    return t;
};
const points=[['Volga',54,45],['Caspian',42,51],['Aral',45,59],['Tarim',40,85],['Chad',13,14],['Turkana',3.5,36],['Eyre',-28.5,137.5],['Amazon',-3,-60],['Congo',0,23]] as const;
const cases=points.map(([name,lat,lon])=>{
    const t=nearest(lat,lon);let root=t,length=0;while(channels.receiverSide[root]>=0){root=mesh.t_outer_s(channels.receiverSide[root]);assert(++length<mesh.numTriangles);}
    const uv=directionToUV(mesh.xyz_t.subarray(3*root,3*root+3));
    return {name,lat,lon,triangle:t,bedM:net.bedM[t],basinId:net.endorheic?.[t]??0,inlandLakeId:net.inlandLakeId?.[t]??0,root,rootLat:90-uv[1]*180,rootLon:uv[0]*360-180,rootBedM:net.bedM[root],rootOcean:net.cell[root]<0,rootLake:net.inlandLakeId?.[root]??0,length};
});
for(const name of ['Volga','Caspian','Aral','Tarim','Chad','Turkana','Eyre'])assert.equal(cases.find(p=>p.name===name)!.rootOcean,false,name);
for(const name of ['Amazon','Congo'])assert.equal(cases.find(p=>p.name===name)!.rootOcean,true,name);
const checkpoint=w.checkpoint(),styles=[{name:'legacy',minFlowM3S:300,widthCoefficient:.07,maxWidthRatio:.85},{name:'default',minFlowM3S:1000,widthCoefficient:.025,maxWidthRatio:.35},{name:'thin',minFlowM3S:1000,widthCoefficient:.005,maxWidthRatio:.35},{name:'major',minFlowM3S:10000,widthCoefficient:.025,maxWidthRatio:.35},{name:'off',enabled:false}];
const display=styles.map(style=>{const field=riverChannelField(rt),v=terrainWaterView(rt,style)!;assert.deepEqual(w.checkpoint(),checkpoint);return {...style,riverTriangles:v.riverTriangles,geometrySha:createHash('sha256').update(new Uint8Array(v.rivers.buffer)).digest('hex'),flowSha:createHash('sha256').update(new Uint8Array(field.flowM3S.buffer)).digest('hex')};});
assert(display.every(s=>s.flowSha===display[0].flowSha));assert(display[1].riverTriangles<display[0].riverTriangles);assert.notEqual(display[1].geometrySha,display[2].geometrySha);assert.equal(display[4].riverTriangles,0);
const records=[];
for(const day of [0,2,24]) {
    while(rt.model!.timeS<day*86400-rt.model!.stepS){const current=rt.model!.timeS;rt.sync(d.terrain.settings.planet,d.terrain.settings.orbit,Math.min(day*86400,current+rt.maxAdvanceS),current);}
    const budget=w.diagnostics(),partition=w.routing!.diagnostics(w);
    assert(Math.abs(budget.residualMm)<1e-6);assert(Math.abs(partition.partitionResidualM3)*1000/(w.grid.count*w.cellAreaM2)<1e-7);
    assert(w.routing!.volumeM3.every(x=>x>=0));assert(w.surfaceKgM2.every(x=>x>=0));
    const saved={...d,runtime:rt.snapshot(),terrain:{...d.terrain,settings:{...d.terrain.settings,timeS:rt.model!.timeS}}};
    const encoded=encodeSimulationDocument(saved);decodeSimulationDocument(encoded,identity,128);
    if(day===24)await writeFile('build/endorheic/day24.json',encoded);
    records.push({targetDay:day,actualDay:rt.model!.timeS/86400,steps:rt.model!.steps,budget,energy:rt.environment!.diagnostics(),partition,inlandFraction:Array.from(w.inlandWaterFraction).filter(x=>x>0),closedStores:cases.filter(p=>!p.rootOcean).map(p=>({name:p.name,root:p.root,volumeM3:w.routing!.volumeM3[p.root],headM:w.routing!.headM[p.root],fluxM3S:w.routing!.fluxM3S[p.root]})),strictRoundTrip:true});
}
await writeFile(`${folder}/audit.json`,JSON.stringify({baseline,inputSha:createHash('sha256').update(text).digest('hex'),preservedDEM:true,preservedInitialRuntime:true,experimentalMoisture:false,closedEdges,lakeTriangles,cases,display,continuous:records},null,2));
console.log(JSON.stringify({closedEdges,lakeTriangles,cases,display,continuous:records.map(r=>({day:r.actualDay,steps:r.steps,residual:r.budget.residualMm,energyResidual:r.energy.energyResidualJm2}))},null,2));
