/** Contracts specific to rejected candidate physics. They are not production
 * requirements: satisfying them did not satisfy the full GPCC acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {AtmosphericCirculation,rotatingDrag} from '../../../circulation.ts';
import {ThermalModel,makeThermalGrid,DEFAULT_THERMAL} from '../../../thermal.ts';
import {WaterModel,DEFAULT_WATER} from '../../../water.ts';
import {circulationWinds} from '../../../climate.ts';
import {DEFAULT_PLANET} from '../../../planet.ts';
import {DEFAULT_ORBIT} from '../../../astronomy.ts';
const grid=makeThermalGrid(8,4),n=grid.count,field=(v:number)=>new Float64Array(n).fill(v);
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-11,`${a} != ${b}`);
function setup(){const m=new ThermalModel(DEFAULT_PLANET,DEFAULT_ORBIT,{...DEFAULT_THERMAL,separateReservoirs:true,airRadiationFraction:.5},field(.5),0,grid);m.temperatureK.fill(300);m.landTemperatureK.fill(300);m.oceanTemperatureK.fill(300);m.capacity.fill(1004*10000);const w=new WaterModel(grid,DEFAULT_PLANET.radiusM,field(.5),field(0),m.temperatureK,{...DEFAULT_WATER,moistureScheme:'transport'});w.atmosphereKgM2.fill(0);return {m,w,a:new AtmosphericCirculation(m,w)};}
test('single marine SST potential is independent of air-surface buoyancy',()=>{
 const run=(equilibrium:boolean)=>{const s=setup();s.w.land.fill(0);for(let i=0;i<n;i++){const sea=280+8*grid.sinLat[Math.floor(i/grid.width)];s.m.oceanTemperatureK[i]=sea;s.m.temperatureK[i]=equilibrium?sea:270;}const base=circulationWinds(grid,s.m.planet,s.m.orbit,900,s.w.land,s.w.config.windMps);s.w.setWinds(base.eastMps,field(0));s.a.step(1800,900);return s.w;};
 const equilibrium=run(true),coldAir=run(false);for(let i=0;i<n;i++){near(coldAir.windEastMps[i],equilibrium.windEastMps[i]);near(coldAir.windNorthMps[i],equilibrium.windNorthMps[i]);}
});
test('marine-balanced forcing retains actual continental drag',()=>{
 const s=setup();s.w.land.fill(1);const sea=circulationWinds(grid,s.m.planet,s.m.orbit,900,field(0),s.w.config.windMps);
 s.w.setWinds(sea.eastMps,field(0));const dt=1800,drag0=1/(.25*86400),omega=2*Math.PI/s.m.planet.siderealPeriodS;s.a.step(dt,900);
 for(const i of [0,8,16,24]){const f=2*omega*grid.sinLat[Math.floor(i/grid.width)],u=sea.eastMps[i],expected=rotatingDrag(u,0,drag0*u,f*u,f,3*drag0,dt);near(s.w.windEastMps[i],expected[0]);near(s.w.windNorthMps[i],expected[1]);assert.ok(Math.abs(s.w.windEastMps[i])<Math.abs(u));}
 s.a.validateWinds(900);
});
