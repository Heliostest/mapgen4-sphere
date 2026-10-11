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
test('terrain lapse alone cannot amplify horizontal eddy moisture exchange',()=>{
 const run=(mountain:boolean)=>{
  const h=field(0),t=field(300);if(mountain){h[2*16+8]=4000;t[2*16+8]*=Math.exp(-.0065*4000/288.15);}
  const w=new WaterModel(grid,DEFAULT_PLANET.radiusM,field(1),h,t,{...config,windMps:0,moistureDiffusivityM2s:1e6});
  w.atmosphereKgM2.fill(0);w.atmosphereKgM2[2*16+8]=1;w.setWinds(field(0),field(0));w.step(1800,t,field(0));return w;
 };
 const flat=run(false),mountain=run(true);
 for(let i=0;i<n;i++)assert.ok(Math.abs(flat.vaporTransportKgM2[i]-mountain.vaporTransportKgM2[i])<1e-12,'Common-altitude thermal states must give the same eddy transport');
});
test('hot dry columns do not become deep rain parcels solely because the ground is hot',()=>{
 const w=new WaterModel(grid,DEFAULT_PLANET.radiusM,field(1),field(0),field(300),{...config,windMps:0});
 w.atmosphereKgM2.fill(.6*moistureCapacity(300));w.setWinds(field(0),field(0));
 w.step(1800,field(300),field(250),{heatJm2:field(0),landEvaporation:field(0),iceCover:field(0),landTemperatureK:field(315),oceanTemperatureK:field(300)});
 assert.ok(w.precipitationKgM2S.every(p=>p===0),'A moist convection threshold must distinguish dry mixing from cloud ascent');
});
test('marine convection in a mixed coastal column is not deposited uniformly onto its cold land surface',()=>{
 const w=new WaterModel(grid,DEFAULT_PLANET.radiusM,field(.5),field(0),field(280),{...config,windMps:0});
 w.atmosphereKgM2.fill(.9*moistureCapacity(280));w.setWinds(field(0),field(0));const before=w.diagnostics().totalMm;
 w.step(1800,field(280),field(250),{heatJm2:field(0),landEvaporation:field(0),iceCover:field(0),landTemperatureK:field(285),oceanTemperatureK:field(305)});
 assert.ok(w.precipitationKgM2S[0]>0);assert.equal(w.landPrecipitationKgM2S?.[0],0,'Cold land cannot inherit a warm marine convective cloud');
 assert.ok(Math.abs(w.diagnostics().totalMm-before)<1e-7);
});
test('a marine parcel intercepted by a continental slope rains on land and its face transport includes that delivered water',()=>{
 const f=field(0),h=field(0);for(let j=0;j<8;j++){f[j*16+8]=1;h[j*16+8]=2500;}
 const w=new WaterModel(grid,DEFAULT_PLANET.radiusM,f,h,field(288),config);w.atmosphereKgM2.fill(.9*moistureCapacity(288));w.setWinds(field(10),field(0));
 const before=w.atmosphereKgM2.slice();w.step(1800,field(288),field(0));
 assert.ok(w.landPrecipitationKgM2S?.[4*16+8]>0,'Rain on a coast-facing continental slope must not be assigned to its open-ocean donor');
 for(let i=0;i<n;i++){assert.ok(Math.abs(w.atmosphereKgM2[i]-before[i]-w.vaporTransportKgM2[i]+1800*w.precipitationKgM2S[i])<1e-10);assert.ok(Math.abs(w.landPrecipitationKgM2S[i]+w.oceanPrecipitationKgM2S[i]-w.precipitationKgM2S[i])<1e-15);}
});
test('an unsaturated cold front cannot repeatedly rain more vapor than its incoming parcel supply',()=>{
 const t=Float64Array.from({length:n},(_,i)=>i%16<8?280:295),w=new WaterModel(grid,DEFAULT_PLANET.radiusM,field(0),field(0),t,config);
 for(let i=0;i<n;i++)w.atmosphereKgM2[i]=(i%16<8?.99:.5)*moistureCapacity(t[i]);
 w.setWinds(field(10),field(0));const dt=1800,k=4*16,donor=w.atmosphereKgM2[k+15];
 const incomingUpperBound=dt*10/(DEFAULT_PLANET.radiusM*Math.sqrt(1-grid.sinLat[4]**2)*2*Math.PI/16)*donor;
 w.step(dt,t,field(0));
 assert.ok(w.precipitationKgM2S[k]>0,'A real warm moist parcel can condense on entry');
 assert.ok(w.precipitationKgM2S[k]*dt<=incomingUpperBound+1e-10,'Cold unsaturated resident air is not a new source of frontal condensate');
});
test('restore invalidates unsaved precipitation attribution until the next actual water step',()=>{
 const w=new WaterModel(grid,DEFAULT_PLANET.radiusM,field(1),field(0),field(280),{...config,windMps:0});w.setWinds(field(0),field(0));
 w.atmosphereKgM2.fill(20);w.step(1800,field(280),field(0));const saved=w.checkpoint();
 assert.equal(w.precipitationComponentsValid,true);
 w.restore(saved);assert.equal(w.precipitationComponentsValid,false);
 assert.ok(Object.values(w.precipitationComponents).every(a=>a.every(v=>v===0)),'Attribution for another step must not survive restore');
 w.step(1800,field(280),field(0));assert.equal(w.precipitationComponentsValid,true);
});
test('finite warm inflow rises through a stably stratified front rather than merely taking the resident temperature',()=>{
 const t=Float64Array.from({length:n},(_,i)=>i%16<8?280:282);
 const w=new WaterModel(grid,DEFAULT_PLANET.radiusM,field(0),field(0),t,config);
 for(let i=0;i<n;i++)w.atmosphereKgM2[i]=(i%16<8?.5:.8)*moistureCapacity(t[i]);
 w.setWinds(field(10),field(0));w.step(1800,t,field(0));
 assert.ok(w.precipitationComponents.front[4*16]>0,'A 2 K front lifts the finite warm parcel along the stable environmental gradient to its condensation level');
});
test('counter-exchanging eddy parcels can lift a front even when their initial vapor depths are equal',()=>{
 const t=Float64Array.from({length:n},(_,i)=>i%16<8?280:282),depth=.8*moistureCapacity(282);
 const w=new WaterModel(grid,DEFAULT_PLANET.radiusM,field(0),field(0),t,{...config,windMps:0,moistureDiffusivityM2s:1e6});
 w.atmosphereKgM2.fill(depth);w.setWinds(field(0),field(0));const before=w.diagnostics().totalMm;
 w.step(1800,t,field(0));
 assert.ok(w.precipitationComponents.front[4*16]>0,'Equal tracer depths do not eliminate the opposing eddy parcels crossing a thermal front');
 assert.ok(Math.abs(w.diagnostics().totalMm-before)<1e-7);
 const incidence=field(0);grid.edges.forEach((e,k)=>{incidence[e.a]-=w.faceVaporTransportKgM2[k];incidence[e.b]+=w.faceVaporTransportKgM2[k];});
 for(let k=0;k<n;k++)assert.ok(Math.abs(incidence[k]-w.vaporTransportKgM2[k])<1e-10);
});
test('uphill parcels rain on the windward slope before their remaining vapor enters a cold plateau',()=>{
 const h=field(0);for(let j=0;j<8;j++)h[j*16+8]=4000;
 const w=new WaterModel(grid,DEFAULT_PLANET.radiusM,field(1),h,field(300),config);
 w.atmosphereKgM2.fill(0);for(let j=0;j<8;j++)w.atmosphereKgM2[j*16+7]=.9*moistureCapacity(300);
 w.setWinds(field(10),field(0));const before=w.atmosphereKgM2.slice(),total=w.diagnostics().totalMm;
 w.step(1800,field(300),field(0));
 assert.ok(w.precipitationKgM2S[4*16+7]>0,'Rain must intercept the donor parcel on the windward face');
 for(let i=0;i<n;i++)assert.ok(Math.abs(w.atmosphereKgM2[i]-before[i]-w.vaporTransportKgM2[i]+1800*w.precipitationKgM2S[i])<1e-10,'Face rain belongs in precipitation, not net transport');
 assert.ok(Math.abs(w.diagnostics().totalMm-total)<1e-7);
 const incidence=field(0);grid.edges.forEach((e,k)=>{incidence[e.a]-=w.faceVaporTransportKgM2[k];incidence[e.b]+=w.faceVaporTransportKgM2[k];});
 for(let i=0;i<n;i++)assert.ok(Math.abs(incidence[i]-w.vaporTransportKgM2[i])<1e-11,'Face flux divergence must reproduce the independently recorded cell vapor ledger');
 for(let i=0;i<n;i++){
  const parts=Object.values(w.precipitationComponents).map(a=>a[i]);
  assert.ok(parts.every(v=>Number.isFinite(v)&&v>=0));
  assert.ok(Math.abs(parts.reduce((s,p)=>s+p,0)-w.precipitationKgM2S[i])<1e-15,'Actual rain component shares must close exactly');
 }
});
test('hot land can lift moist cooler air; condensation uses the air reservoir temperature',()=>{
 const w=new WaterModel(grid,DEFAULT_PLANET.radiusM,field(1),field(0),field(285),{...config,windMps:0});
 w.atmosphereKgM2.fill(15);w.setWinds(field(0),field(0));
 const coupling={heatJm2:field(0),landHeatJm2:field(0),oceanHeatJm2:field(0),landEvaporation:field(0),iceCover:field(0),landTemperatureK:field(310),oceanTemperatureK:field(300)};
 w.step(1800,field(285),field(250),coupling);
 assert.ok(w.precipitationKgM2S.every(p=>p>0),'A hot soil surface must not set saturation capacity for the cooler air column');
});
test('cold ground cannot condense a dry warm air column without ascent',()=>{
 const w=new WaterModel(grid,DEFAULT_PLANET.radiusM,field(1),field(0),field(300),{...config,windMps:0});
 w.atmosphereKgM2.fill(10);w.setWinds(field(0),field(0));
 w.step(1800,field(300),field(0),{heatJm2:field(0),landEvaporation:field(0),iceCover:field(0),landTemperatureK:field(260),oceanTemperatureK:field(300)});
 assert.ok(w.precipitationKgM2S.every(p=>p===0),'Saturation is an air-column diagnostic, not a ground-temperature diagnostic');
});
test('an infinitesimal donor humidity contrast cannot switch on finite frontal rain',()=>{
 const t=Float64Array.from({length:n},(_,i)=>i<2*16?280:295),base=.9*moistureCapacity(280);
 const run=(epsilon:number)=>{const w=new WaterModel(grid,DEFAULT_PLANET.radiusM,field(0),field(0),t,{...config,windMps:0,moistureDiffusivityM2s:1e6});
  w.atmosphereKgM2.set(Float64Array.from({length:n},(_,i)=>i<2*16?base:base+epsilon));w.setWinds(field(0),field(0));w.step(1800,t,field(0));return w.precipitationKgM2S[16]*1800;};
 assert.ok(Math.abs(run(1e-6)-run(-1e-6))<1e-5,'Frontal lift must vanish continuously with its moisture supply contrast');
});
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
 const run=(height:Float64Array)=>{const w=new WaterModel(grid,6371008.4,field(1),height,field(288),config);w.atmosphereKgM2.fill(.9*moistureCapacity(288));w.setWinds(field(10),field(0));let rain=0;for(let s=0;s<40;s++){w.step(w.maxStepS,field(288),field(0));rain+=w.precipitationKgM2S[4*16+7]*w.maxStepS;}return {w,rain};};
 const flat=run(field(0)),mountain=run(h);
 assert.ok(mountain.rain>flat.rain,'Finite windward rainout is accumulated on the ascent face');
 assert.ok(mountain.w.atmosphereKgM2[4*16+9]<flat.w.atmosphereKgM2[4*16+9]);
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
test('Earth quarter-step convergence stays on the real coupled year instead of changing to a compressed climate',()=>{
 const g=makeThermalGrid(8,4),f=new Float64Array(g.count).fill(.5),h=new Float64Array(g.count);
 const r=referenceMoisture(g,DEFAULT_PLANET,DEFAULT_ORBIT,{...DEFAULT_THERMAL,separateReservoirs:true,airRadiationFraction:.5},config,f,h,DEFAULT_ENVIRONMENT,450);
 assert.equal(r.coupled,true);assert.equal(r.integratedYearS,r.forcingYearS);assert.ok(r.steps>131072);
});
