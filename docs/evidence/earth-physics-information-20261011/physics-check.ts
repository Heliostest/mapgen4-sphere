import assert from 'node:assert/strict';
import {writeFile,readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {makeThermalGrid,ThermalModel,DEFAULT_THERMAL,heatTransport,sampleTerrainGrid} from '../../../thermal.ts';
import {DEFAULT_PLANET} from '../../../planet.ts';
import {DEFAULT_ORBIT,deriveOrbit} from '../../../astronomy.ts';
import {WaterModel,DEFAULT_WATER} from '../../../water.ts';
import {EnvironmentModel,DEFAULT_ENVIRONMENT} from '../../../environment.ts';
import {OceanTransport} from '../../../ocean.ts';
import {rotatingDrag} from '../../../circulation.ts';
import {seaIceSurfaceExchange} from '../../../sea-ice-thermodynamics.ts';
const dir='docs/evidence/earth-physics-information-20261011',sha=(x:any)=>createHash('sha256').update(x).digest('hex');
const g=makeThermalGrid(8,4),n=g.count,sum=(a:Iterable<number>)=>Array.from(a).reduce((s,v)=>s+v,0);
const checks:any[]=[];
function close(a:number,b:number,t:number,name:string){const error=Math.abs(a-b);assert.ok(error<t,`${name}: ${error}`);checks.push({name,error,tolerance:t,status:'pass'});}
const temperatures=Float64Array.from({length:n},(_,i)=>260+20*Math.sin(i*2.3)),q=heatTransport(g,temperatures,.55);
close(sum(q),0,1e-10,'shared heat faces conserve energy');
assert.ok(sum(q.map((v,i)=>v*temperatures[i]))<0);checks.push({name:'diffusion reduces temperature variance',status:'pass'});
for(const f of [-1e-4,0,1e-4]){const [u,v]=rotatingDrag(7,-4,0,0,f,0,86400);close(u*u+v*v,65,1e-12,'Coriolis alone does no work');const [a,b]=rotatingDrag(7,-4,0,0,f,1/86400,86400);close(a*a+b*b,65*Math.exp(-2),1e-12,'linear drag dissipates kinetic energy');}
const land=new Float64Array(n).fill(.25),thermal=new ThermalModel(DEFAULT_PLANET,DEFAULT_ORBIT,{...DEFAULT_THERMAL,separateReservoirs:true,airRadiationFraction:.5},land,0,g);
const water=new WaterModel(g,DEFAULT_PLANET.radiusM,land,new Float64Array(n).fill(100),thermal.temperatureK,{...DEFAULT_WATER,windMps:0,moistureDiffusivityM2s:0,evaporationFraction:0});
const env=new EnvironmentModel(thermal,water,{...DEFAULT_ENVIRONMENT,conductiveSeaIce:true,underIceOcean:true});
thermal.oceanTemperatureK.fill(270);let h=env.enthalpy(),inventory=water.diagnostics().totalMm;env.phase(1800);
close(env.enthalpy(),h,1e-5,'finite freezing conserves enthalpy');close(water.diagnostics().totalMm,inventory,1e-7,'finite freezing conserves water');
assert.ok(water.seaIceKgM2.every(v=>v>0));close(thermal.oceanTemperatureK[0],271.35,1e-12,'available marine freezing heat restores freezing boundary');
thermal.oceanTemperatureK.fill(271.45);h=env.enthalpy();inventory=water.diagnostics().totalMm;const prior=water.seaIceKgM2[0];env.phase(1800);
close(env.enthalpy(),h,1e-5,'melting consumes latent heat');close(water.diagnostics().totalMm,inventory,1e-7,'melting conserves water');assert.ok(water.seaIceKgM2[0]<prior);
water.oceanGlobalKgM2=0;thermal.oceanTemperatureK.fill(260);h=env.enthalpy();const ice=water.seaIceKgM2.slice();env.phase(1800);assert.deepEqual(water.seaIceKgM2,ice);close(env.enthalpy(),h,1e-5,'exhausted ocean creates neither mass nor latent energy');
const m=new ThermalModel(DEFAULT_PLANET,DEFAULT_ORBIT,{...DEFAULT_THERMAL,separateReservoirs:true},land,0,g),w=new WaterModel(g,DEFAULT_PLANET.radiusM,land,new Float64Array(n),m.temperatureK,{...DEFAULT_WATER,evaporationFraction:0});
const ocean=new OceanTransport(m,w,false,true);m.oceanTemperatureK.fill(280);ocean.step(1800,.3);close(Math.max(...m.oceanTemperatureK.map(v=>Math.abs(v-280))),0,1e-12,'closed ocean loops preserve uniform temperature');
m.oceanTemperatureK.set(temperatures);const before=m.energy(),low=Math.min(...temperatures),high=Math.max(...temperatures);ocean.step(1800,.3);close(m.energy(),before,1e-5,'ocean advection conserves heat');assert.ok(m.oceanTemperatureK.every(v=>v>=low-1e-12&&v<=high+1e-12));checks.push({name:'donor limited ocean advection introduces no new extrema',status:'pass'});
const sun=new ThermalModel(DEFAULT_PLANET,DEFAULT_ORBIT,DEFAULT_THERMAL,new Float64Array(n),0,g);sun.albedo.fill(.37);sun.advanceTo(sun.stepS);close(sum(sun.absorbedWm2)/n,(1-.37)*deriveOrbit(DEFAULT_PLANET,DEFAULT_ORBIT).fluxWm2/4,1e-10,'global absorbed shortwave respects spherical S/4');
let maxIceEnergyError=0,maxSkinResidual=0;const thicknessSamples:any[]=[];
for(const cover of [.1,.25,.75,1])for(const t of [240,270,300])for(const absorbed of [0,150,400]){
 const x={wetArea:1,marineArea:1,iceKgM2:917*.5*cover,waterK:271.35,airK:t,waterCapacity:42e6,airCapacity:1e7,absorbedWm2:absorbed,waterAlbedo:.3,iceAlbedo:.65,emissivity:.305,dt:1800},d=seaIceSurfaceExchange(x);
 const error=Math.abs(x.waterCapacity*(d.waterK-x.waterK)+x.airCapacity*(d.airK-x.airK)-x.dt*d.radiationWm2);maxIceEnergyError=Math.max(maxIceEnergyError,error);maxSkinResidual=Math.max(maxSkinResidual,Math.abs(d.balanceResidualWm2));assert.ok(error<5e-6);assert.ok(d.skinK<=271.35&&d.skinK>0);assert.ok(Math.abs(d.openShortwaveWm2+d.iceShortwaveWm2-absorbed)<1e-10);
 if(t===240&&absorbed===0)thicknessSamples.push({massKgM2:x.iceKgM2,cover:d.iceArea,derivedThicknessM:x.iceKgM2/(917*d.iceArea)});
}
checks.push({name:'36 ice surface cases conserve heat and absorbed sunshine',status:'pass',maxIceEnergyErrorJm2:maxIceEnergyError,maxSkinResidualWm2:maxSkinResidual});
// An empirical missing-input probe: seabed depth changes at identical coast.
const xyz=new Float64Array(n*3),heights=new Float64Array(n);for(let k=0;k<n;k++){const y=g.sinLat[Math.floor(k/g.width)],lon=((k%g.width+.5)/g.width-.5)*2*Math.PI,r=Math.sqrt(1-y*y);xyz.set([r*Math.sin(lon),y,r*Math.cos(lon)],3*k);heights[k]=k%3===0?.2:-.02-.003*k;}
assert.deepEqual(sampleTerrainGrid(g,xyz,heights),sampleTerrainGrid(g,xyz,heights.map(v=>v<0?v*7:v)));
const sources=['thermal.ts','water.ts','environment.ts','sea-ice-thermodynamics.ts','ocean.ts','circulation.ts','refinement-surface.ts','refinement-topology.ts','thermal-runtime.ts','runtime-state.ts','vegetation.ts'];
const bindings=await Promise.all(sources.map(async path=>({path,sha256:sha(await readFile(path))})));
const result={checks,limitations:{iceThicknessSamples:thicknessSamples,independentConcentration:false,verticalOceanEntrainment:false,fullAtmosphericLongwaveExchange:false,bathymetryInputInThermalAndCirculation:false},formalSha256:sha(await readFile('scenes/earth-land-sea/earth-simulation.json')),bindings,bundleSha256:sha(await readFile(process.argv[1]))};
await mkdir(dir,{recursive:true});await writeFile(dir+'/physics-check.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:checks.length,maxIceEnergyError,maxSkinResidual,thicknessSamples,formalSha256:result.formalSha256}));
