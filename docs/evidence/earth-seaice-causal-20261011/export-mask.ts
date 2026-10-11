/** Full authored Earth. Telemetry wraps the existing water step without
 * changing its inputs, outputs, ordering, or snapshot fields. sync batches
 * render mapping every 32 steps; every physical flux is recorded once. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {makeMesh} from '../../../mesh.ts';
import config,{HIGH_DETAIL_SPACING} from '../../../config.js';
import Map from '../../../map.ts';
import Geometry from '../../../geometry.ts';
import {decodeSimulationDocument,encodeSimulationDocument} from '../../../simulation-document.ts';
import {meshIdentity} from '../../../terrain-document.ts';
import {ThermalRuntime} from '../../../thermal-runtime.ts';
import {sampleTerrainGrid,thermalCell} from '../../../thermal.ts';
import {surfaceCell} from '../../../surface-grid.ts';
import {deriveOrbit} from '../../../astronomy.ts';
import {cellBounds,sphericalOverlap,matchedSupport,CalendarFlux,VaporLedger,type Bounds} from '../../../climate-diagnostics.ts';
const folder='docs/evidence/earth-seaice-causal-20261011',out='build/earth-seaice-causal',label=process.env.P1_LABEL??'after',dt=Number(process.env.P1_DT??1800);
await mkdir(out,{recursive:true});const start=performance.now(),sha=(s:any)=>createHash('sha256').update(s).digest('hex');
config.spacing=HIGH_DETAIL_SPACING;const {mesh,t_peaks}=await makeMesh(),identity=meshIdentity(mesh,config);
const raw=await readFile('scenes/earth-land-sea/earth-simulation.json','utf8'),d=decodeSimulationDocument(raw,identity,128),planet=d.terrain.settings.planet,orbit=d.terrain.settings.orbit;
const map=new Map(mesh,t_peaks,config);map.assignElevation(d.terrain.parameters.elevation,{size:128,constraints:new Float32Array(d.terrain.constraints.values)},new Float32Array(d.terrain.offsets!));map.assignRainfall(d.terrain.parameters.biomes);map.assignRivers(d.terrain.parameters.rivers,true);
const elevation=new Float32Array(mesh.numRegions+mesh.numTriangles);elevation.set(map.elevation_r);elevation.set(map.elevation_t,mesh.numRegions);
const quads=new Int32Array(mesh.numSolidSides*3);Geometry.setMapGeometry(map,0,quads,new Float32Array(elevation.length*2));
const source={mesh,directions:mesh.xyz_r,elevation,quadElements:quads,drainage:d.terrain.drainage};
const initial=structuredClone(d.runtime);initial.config.airRadiationFraction=.5;initial.waterConfig.moistureScheme='transport';initial.state!.stepS=dt;
if(process.env.P1_LEGACY==='1'){delete initial.config.airRadiationFraction;delete initial.waterConfig.moistureScheme;}
initial.environmentConfig.conductiveSeaIce=process.env.P1_ICE==='1';
initial.environmentConfig.underIceOcean=process.env.P1_UNDER==='1';
const terrain=sampleTerrainGrid(ThermalRuntime.fromSnapshot(initial,planet,orbit).grid,mesh.xyz_r,elevation);
function restore(s:any){const r=ThermalRuntime.fromSnapshot(s,planet,orbit);r.attachRestoredTerrain(terrain.landFraction,terrain.landElevation,source);return r;}
const rt=restore(initial),w=rt.water!,m=rt.model!,n=rt.grid.count,year=deriveOrbit(planet,orbit).yearS;
const rain=new CalendarFlux(n,year),vapor=new VaporLedger(w.atmosphereKgM2),initialOcean=w.oceanGlobalKgM2;
const eastWind=new CalendarFlux(n,year),northWind=new CalendarFlux(n,year),coverage=new CalendarFlux(1,year),coast=new CalendarFlux(4,year);
const coastWeights=rt.grid.edges.map(e=>{
 const a=cellBounds(rt.grid,e.a),b=cellBounds(rt.grid,e.b),lat=(Math.asin(rt.grid.sinLat[Math.floor(e.a/rt.grid.width)])+Math.asin(rt.grid.sinLat[Math.floor(e.b/rt.grid.width)]))*90/Math.PI,lon=(a.west+a.east+b.west+b.east)/4;
 return {branch:lon<80?0:1,weight:lat>=5&&lat<=27&&lon>=60&&lon<=100?(w.land[e.b]-w.land[e.a])*rt.grid.solidAngle*planet.radiusM**2/1e12:0};
});
const componentAmounts=Object.fromEntries(['saturation','convection','front','convergence','orographic'].map(k=>[k,new Float64Array(n)]));
const regions:{name:string;bounds:Bounds}[]=[
 {name:'Amazon',bounds:{south:-7,north:1,west:-68,east:-52}},
 {name:'Congo',bounds:{south:-4,north:4,west:15,east:31}},
 {name:'India',bounds:{south:18,north:25,west:74,east:86}},
 {name:'Himalaya foreland',bounds:{south:25,north:29,west:79,east:91}},
 {name:'Tibet',bounds:{south:31,north:36,west:80,east:94}},
 {name:'Australia interior',bounds:{south:-29,north:-21,west:126,east:142}},
 {name:'Australia north',bounds:{south:-18,north:-10,west:123,east:139}},
 {name:'Australia east',bounds:{south:-34,north:-26,west:148,east:154}},
 {name:'Australia southwest',bounds:{south:-35,north:-29,west:113,east:120}}
];
const observations=JSON.parse(await readFile('docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json','utf8'));
const supports=regions.map(r=>matchedSupport(rt.grid,w.land,r.bounds,observations.cells));
const wholeWeights=regions.map(r=>Float64Array.from({length:n},(_,k)=>sphericalOverlap(r.bounds,cellBounds(rt.grid,k))));
const sum=(a:Iterable<number>)=>{let s=0,c=0;for(const v of a){const y=v-c,t=s+y;c=(t-s)-y;s=t;}return s;};
const mean=(weights:Float64Array,a:ArrayLike<number>)=>sum(weights.map((x,k)=>x*a[k]))/sum(weights);
// Fixed imported shelf geometry, excluding land and confirmed inland lakes.
const wetMeshArea=new Float64Array(n),shelfMeshArea=new Float64Array(n),net=w.routing!.network;
for(let t=0;t<mesh.numTriangles;t++) {
 if(source.elevation[mesh.numRegions+t]>0||(net.inlandLakeId?.[t]??0)>0)continue;
 const xyz=mesh.xyz_t.subarray(3*t,3*t+3),u=.5+Math.atan2(xyz[0],xyz[2])/(2*Math.PI),v=Math.acos(Math.max(-1,Math.min(1,xyz[1])))/Math.PI,k=thermalCell(rt.grid,u,v),sc=surfaceCell(rt.surfaceGrid,u,v);
 wetMeshArea[k]+=net.areaM2[t];if((initial.iceInventory?.shelfThicknessM[sc]??0)>0)shelfMeshArea[k]+=net.areaM2[t];
}
const marine=Float64Array.from(w.land,(l,k)=>Math.max(0,1-l-w.inlandWaterFraction[k]));
const shelfFraction=marine.map((area,k)=>wetMeshArea[k]>0?area*shelfMeshArea[k]/wetMeshArea[k]:0),support=marine.map((area,k)=>Math.max(0,area-shelfFraction[k]));
function polar() {
 const out={north:{extentMillionKm2:0,areaMillionKm2:0,iceGlobalMm:0},south:{extentMillionKm2:0,areaMillionKm2:0,iceGlobalMm:0}};
 for(let k=0;k<n;k++){const h=k<n/2?out.north:out.south,wet=1-w.land[k],cover=wet>0?Math.min(1,w.seaIceKgM2[k]/(917*.5*wet)):0,area=support[k]*w.cellAreaM2/1e12;if(cover>=.15)h.extentMillionKm2+=area;h.areaMillionKm2+=cover*area;h.iceGlobalMm+=w.seaIceKgM2[k]/n;}
 return out;
}
await writeFile(out+'/grid.json',JSON.stringify({width:rt.grid.width,height:rt.grid.height,radiusM:planet.radiusM,cellAreaM2:w.cellAreaM2,land:Array.from(w.land),inlandWater:Array.from(w.inlandWaterFraction),marine:Array.from(marine),shelves:Array.from(shelfFraction),support:Array.from(support)}));
const rows:number[]=[],exportedArea=new Float64Array(n);
for(let t=0;t<mesh.numTriangles;t++) {
 if(source.elevation[mesh.numRegions+t]>0||(net.inlandLakeId?.[t]??0)>0)continue;
 const xyz=mesh.xyz_t.subarray(3*t,3*t+3),u=.5+Math.atan2(xyz[0],xyz[2])/(2*Math.PI),v=Math.acos(Math.max(-1,Math.min(1,xyz[1])))/Math.PI,k=thermalCell(rt.grid,u,v),sc=surfaceCell(rt.surfaceGrid,u,v);
 if((initial.iceInventory?.shelfThicknessM[sc]??0)>0)continue;
 const area=net.areaM2[t]*marine[k]/wetMeshArea[k]*w.cellAreaM2;
 rows.push(k,area);exportedArea[k]+=area;
 for(let j=0;j<3;j++){const r=mesh.r_begin_s(3*t+j);rows.push(mesh.xyz_r[3*r],mesh.xyz_r[3*r+1],mesh.xyz_r[3*r+2]);}
}
const representedArea=Float64Array.from(support,(a,k)=>wetMeshArea[k]>0?a*w.cellAreaM2:0);
for(let k=0;k<n;k++)assert.ok(Math.abs(exportedArea[k]-representedArea[k])<.01+1e-12*w.cellAreaM2,`Exported triangle m2 closes to represented model marine support k=${k}`);
// Coarse land fractions and centroid-classified terrain need not agree in a
// coastal cell. Exclude coarse marine support with no classified marine
// source triangles; disclose this fixed intersection, do not invent samples.
await writeFile(out+'/grid.json',JSON.stringify({width:rt.grid.width,height:rt.grid.height,radiusM:planet.radiusM,physicalYearDays:year/86400,cellAreaM2:w.cellAreaM2,land:Array.from(w.land),inlandWater:Array.from(w.inlandWaterFraction),marine:Array.from(marine),shelves:Array.from(shelfFraction),support:Array.from(support),triangleMarineSupportM2:Array.from(representedArea),unrepresentedMarineMillionKm2:Object.fromEntries(['north','south'].map((h,j)=>[h,sum(support.subarray(j*n/2,(j+1)*n/2).map((a,k)=>a*w.cellAreaM2-representedArea[j*n/2+k]))/1e12]))}));
await writeFile(out+'/marine-triangles.f64',Buffer.from(new Float64Array(rows).buffer));
console.log('marine triangles',rows.length/11);
