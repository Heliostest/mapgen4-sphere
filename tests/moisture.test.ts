import test from 'node:test';
import assert from 'node:assert/strict';
import {WaterModel,DEFAULT_WATER,moistureCapacity} from '../water.ts';
import {makeThermalGrid,DEFAULT_THERMAL} from '../thermal.ts';
import {generateThermalClimate} from '../climate.ts';
import {referenceMoisture} from '../reference-moisture.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';
import {DEFAULT_ENVIRONMENT} from '../environment.ts';
const grid=makeThermalGrid(16,8),n=grid.count,field=(x:number)=>new Float64Array(n).fill(x);
const config={...DEFAULT_WATER,evaporationFraction:0,moistureDiffusivityM2s:0,moistureScheme:'transport' as const};
test('warm convergent unsaturated air rains from its existing vapor and conserves water',()=>{
 const w=new WaterModel(grid,6371008.4,field(0),field(0),field(300),config);
 w.atmosphereKgM2.fill(.85*moistureCapacity(300));
 w.setWinds(field(0),Float64Array.from({length:n},(_,i)=>i<4*16?-8:8));
 const before=w.diagnostics().totalMm;
 w.step(w.maxStepS,field(300),field(200));
 assert.ok(w.precipitationKgM2S[3*16]>0,'uplift should condense before whole-column supersaturation');
 assert.ok(Math.abs(w.diagnostics().totalMm-before)<1e-7);
});
test('mountain ascent removes vapor upstream and leaves less in downstream air',()=>{
 const h=field(0);for(let j=0;j<8;j++)h[j*16+8]=2500;
 const run=(height:Float64Array)=>{const w=new WaterModel(grid,6371008.4,field(0),height,field(288),config);w.atmosphereKgM2.fill(.9*moistureCapacity(288));w.setWinds(field(10),field(0));for(let s=0;s<40;s++)w.step(w.maxStepS,field(288),field(0));return w;};
 const flat=run(field(0)),mountain=run(h);
 assert.ok(mountain.precipitationKgM2S[4*16+8]>flat.precipitationKgM2S[4*16+8]);
 assert.ok(mountain.atmosphereKgM2[4*16+9]<flat.atmosphereKgM2[4*16+9]);
});
test('zero moisture and donors cannot produce convective rain or negative stores',()=>{
 const w=new WaterModel(grid,6371008.4,field(1),field(3000),field(305),{...config,initialOceanDepthM:0});
 w.atmosphereKgM2.fill(0);w.soilKgM2.fill(0);w.setWinds(field(10),field(8));
 for(let s=0;s<10;s++)w.step(w.maxStepS,field(305),field(300));
 assert.ok(w.precipitationKgM2S.every(v=>v===0));assert.ok(w.atmosphereKgM2.every(v=>v>=0));
});
test('wind over a moist horizontal temperature front produces lifted rain without adding water',()=>{
 const t=Float64Array.from({length:n},(_,i)=>i<2*16?280:295);
 const w=new WaterModel(grid,6371008.4,field(0),field(0),t,config);
 for(let i=0;i<n;i++)w.atmosphereKgM2[i]=.85*moistureCapacity(t[i]);
 w.setWinds(field(0),field(8));const before=w.diagnostics().totalMm;w.step(w.maxStepS,t,field(0));
 assert.ok(w.precipitationKgM2S[1*16]>0);assert.ok(Math.abs(w.diagnostics().totalMm-before)<1e-7);
});
test('raw reference vapor survives initialization and malformed arrays are rejected',()=>{
 const c=generateThermalClimate(grid,DEFAULT_PLANET,DEFAULT_ORBIT,DEFAULT_THERMAL,config,field(0),field(0),0);
 const raw=field(123),reference={...c,atmosphereKgM2:raw};
 const w=new WaterModel(grid,DEFAULT_PLANET.radiusM,field(0),field(0),c.temperatureK,config,reference);
 assert.ok(w.atmosphereKgM2.every(v=>v===123));
 for(const count of [n-1,n+1])assert.throws(()=>new WaterModel(grid,DEFAULT_PLANET.radiusM,field(0),field(0),c.temperatureK,config,{...reference,atmosphereKgM2:new Float64Array(count)}),/vapor size/);
 raw[0]=NaN;assert.throws(()=>new WaterModel(grid,DEFAULT_PLANET.radiusM,field(0),field(0),c.temperatureK,config,reference),/reference vapor/);
});
test('transport initialization allocates liquid seeds from a finite donor',()=>{
 const w=new WaterModel(grid,DEFAULT_PLANET.radiusM,field(.5),field(0),field(300),{...config,initialOceanDepthM:.01});
 assert.ok(Math.abs(w.diagnostics().totalMm-5)<1e-12);assert.ok(w.oceanGlobalKgM2>=0);
 const dry=new WaterModel(grid,DEFAULT_PLANET.radiusM,field(1),field(0),field(300),{...config,initialOceanDepthM:0});
 assert.equal(dry.diagnostics().totalMm,0);
});
test('surface evaporation uses its donor temperature and paired latent cooling',()=>{
 const w=new WaterModel(grid,DEFAULT_PLANET.radiusM,field(.5),field(0),field(260),{...config,windMps:0,evaporationFraction:.5});
 w.atmosphereKgM2.fill(10);w.setWinds(field(0),field(0));
 const c={heatJm2:field(0),landHeatJm2:field(0),oceanHeatJm2:field(0),landEvaporation:field(1),iceCover:field(0),landTemperatureK:field(300),oceanTemperatureK:field(260)};
 const before=w.diagnostics().totalMm;w.step(1800,field(260),field(200),c);
 assert.ok(w.evaporationKgM2S[0]>0);assert.ok(c.landHeatJm2[0]<0);assert.ok(c.oceanHeatJm2[0]===0);
 assert.ok(Math.abs(w.diagnostics().totalMm-before)<1e-7);
});
test('parallel wind without mixing cannot lift a horizontal front',()=>{
 const t=Float64Array.from({length:n},(_,i)=>i<2*16?280:295);
 const w=new WaterModel(grid,DEFAULT_PLANET.radiusM,field(0),field(0),t,config);
 for(let i=0;i<n;i++)w.atmosphereKgM2[i]=.5*moistureCapacity(t[i]);
 w.setWinds(field(8),field(0));w.step(w.maxStepS,t,field(0));
 assert.ok(w.precipitationKgM2S.every(v=>v===0));
});
test('recorded vapor exchange is positive, conservative and converges as the step is halved',()=>{
 const run=(dt:number)=>{const w=new WaterModel(grid,DEFAULT_PLANET.radiusM,field(0),field(0),field(300),{...config,moistureDiffusivityM2s:1e7,windMps:100});
 w.atmosphereKgM2.fill(0);w.atmosphereKgM2[4*16]=1;w.setWinds(field(100),field(0));
 for(let s=0;s<86400/dt;s++){w.step(dt,field(300),field(0));assert.ok(w.atmosphereKgM2.every(v=>v>=0));assert.ok(Math.abs(w.vaporTransportKgM2.reduce((a,b)=>a+b,0))<1e-13);}
 assert.ok(Math.abs(w.atmosphereKgM2.reduce((a,b)=>a+b,0)-1)<1e-12);return w.atmosphereKgM2;};
 const a=run(1800),b=run(900),c=run(450),error=(x:Float64Array,y:Float64Array)=>x.reduce((s,v,i)=>s+Math.abs(v-y[i]),0);
 assert.ok(error(b,c)<error(a,b)*.6);
});
test('stiff long-year reference honors an explicit step cap and discloses compression',()=>{
 const g=makeThermalGrid(8,4),f=new Float64Array(g.count).fill(.5),h=new Float64Array(g.count);
 const r=referenceMoisture(g,DEFAULT_PLANET,{...DEFAULT_ORBIT,distanceM:20*DEFAULT_ORBIT.distanceM},{...DEFAULT_THERMAL,separateReservoirs:true,airRadiationFraction:.5},config,f,h,DEFAULT_ENVIRONMENT,1800);
 assert.equal(r.coupled,false);assert.ok(r.steps<=4096);assert.ok(r.integratedYearS<r.forcingYearS);assert.ok(Math.abs(r.waterResidualMm)<1e-7);
 assert.throws(()=>referenceMoisture(g,DEFAULT_PLANET,DEFAULT_ORBIT,DEFAULT_THERMAL,config,f,h,DEFAULT_ENVIRONMENT,0),/reference maximum step/);
});
