import {ThermalRuntime} from '../thermal-runtime.ts';
import {ThermalModel,makeThermalGrid,thermalCell,DEFAULT_THERMAL} from '../thermal.ts';
import {WaterModel,DEFAULT_WATER} from '../water.ts';
import {OceanTransport} from '../ocean.ts';
import {AtmosphericCirculation} from '../circulation.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';
import {captureEnvironment} from '../environment-comparison.ts';

const check=(ok:boolean,message:string)=>{if(!ok)throw new Error(message);};
const output=document.querySelector('pre')!;
const figure=(parent:string,label:string)=>{const f=document.createElement('figure'),c=document.createElement('canvas'),cap=document.createElement('figcaption');c.width=560;c.height=315;cap.textContent=label;f.append(c,cap);document.querySelector('#'+parent)!.append(f);return c;};
const maxSpeed=(u:ArrayLike<number>,v:ArrayLike<number>)=>Math.max(...Array.from(u,(x,i)=>Math.hypot(x,v[i])));
function map(c:HTMLCanvasElement,g:ReturnType<typeof makeThermalGrid>,land:ArrayLike<number>,u:ArrayLike<number>,v:ArrayLike<number>,limit:number,ice?:ArrayLike<number>,hideLand=true) {
    const ctx=c.getContext('2d')!,left=36,top=12,width=508,height=265;
    ctx.fillStyle='#10202a';ctx.fillRect(0,0,c.width,c.height);
    const cell=(x:number,j:number)=>j*g.width+x;
    for(let py=0;py<height;py++)for(let x=0;x<g.width;x++) {
        const row=Math.min(g.height-1,Math.floor((1-Math.cos(Math.PI*(py+.5)/height))/2*g.height)),i=cell(x,row),speed=Math.hypot(u[i],v[i]),f=Math.min(1,speed/limit);
        ctx.fillStyle=land[i]===1?'#555d5d':ice&&ice[i]>=917*.5*(1-land[i])&&land[i]<1?'#b4ced4':`rgb(${Math.round(17+30*f)},${Math.round(51+90*f)},${Math.round(76+54*f)})`;
        ctx.fillRect(left+x/g.width*width,top+py,Math.ceil(width/g.width),1);
    }
    ctx.strokeStyle='#c0d8df';ctx.lineWidth=1;ctx.strokeRect(left,top,width,height);ctx.font='12px system-ui';ctx.fillStyle='#c0d8df';
    for(const lat of [60,0,-60]){const y=top+(90-lat)/180*height;ctx.fillText(`${lat}°`,0,y+4);ctx.strokeStyle='#9fb9c333';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(left+width,y);ctx.stroke();}
    ctx.fillText('−180°',left,top+height+21);ctx.fillText('0°',left+width/2-8,top+height+21);ctx.fillText('+180°',left+width-38,top+height+21);
    ctx.strokeStyle='#e5efbc';ctx.lineWidth=1.35;
    for(let j=0;j<g.height;j+=2)for(let x=0;x<g.width;x+=2){const i=cell(x,j),speed=Math.hypot(u[i],v[i]);if(speed<limit*.006||(hideLand&&land[i]===1))continue;
        const lat=Math.asin(g.sinLat[j]),px=left+(x+.5)/g.width*width,py=top+(Math.PI/2-lat)/Math.PI*height;
        let dx=u[i]*width/(2*Math.PI*Math.cos(lat)),dy=-v[i]*height/Math.PI;const norm=Math.hypot(dx,dy),len=16*Math.sqrt(Math.min(1,speed/limit));dx=dx/norm*len;dy=dy/norm*len;
        ctx.beginPath();ctx.moveTo(px-dx/2,py-dy/2);ctx.lineTo(px+dx/2,py+dy/2);ctx.lineTo(px+dx/2-.3*dx+.2*dy,py+dy/2-.3*dy-.2*dx);ctx.moveTo(px+dx/2,py+dy/2);ctx.lineTo(px+dx/2-.3*dx-.2*dy,py+dy/2-.3*dy+.2*dx);ctx.stroke();
    }
}
try {
    const folder=new URLSearchParams(location.search).get('folder')||'build/validation/circulation-stage4';
    const data=await Promise.all(['initial','saved','resumed'].map(name=>fetch('/'+folder+'/'+name+'.json').then(r=>r.json())));
    const rt=data.map(d=>ThermalRuntime.fromSnapshot(d.runtime,d.terrain.settings.planet,d.terrain.settings.orbit));
    const g=rt[0].grid,days=rt.map(r=>(r.model!.timeS-r.model!.epochS)/86400),seed=data[0].terrain.parameters.elevation.seed;
    check(rt[0].model!.steps===0,'Generated state already advanced');check(rt[0].model!.temperatureK.some(v=>v>0),'No initial temperature');check(rt[0].surfaceTexture!.pixels.some(v=>v!==0),'No generated surface');
    const descriptions=`Seed ${seed} · Earth radius ${(rt[0].model!.planet.radiusM/1000).toFixed(3)} km · tilt 23.44° · ${g.width} × ${g.height} equal-area cells · prograde · evolving circulation on`;
    document.querySelectorAll('.config').forEach(e=>e.textContent=descriptions);
    for(const [name,label] of [['initial-wind','Generated, age 0.00 d · seasonal template'],['evolved-wind',`Evolved, age ${days[1].toFixed(3)} d · template + thermal memory`]]){const f=document.createElement('figure'),img=document.createElement('img'),cap=document.createElement('figcaption');img.src='/'+folder+'/'+name+'.png';await img.decode();cap.textContent=label;f.append(img,cap);document.querySelector('#wind-globes')!.append(f);}
    const winds=rt.map(r=>({u:r.water!.windEastMps,v:r.water!.windNorthMps})),windLimit=20;
    for(const k of [0,1])map(figure('wind-fields',`Day ${days[k].toFixed(3)} · max actual wind ${maxSpeed(winds[k].u,winds[k].v).toFixed(3)} m/s · colors/length 0–20 m/s`),g,rt[k].water!.land,winds[k].u,winds[k].v,windLimit,undefined,false);
    const du=winds[1].u.map((v,i)=>v-winds[0].u[i]),dv=winds[1].v.map((v,i)=>v-winds[0].v[i]),p=rt[1].environment!.atmosphere!;
    map(figure('wind-delta',`Actual wind Δ (day ${days[1].toFixed(3)} − 0) · max ${maxSpeed(du,dv).toFixed(3)} m/s · 0–10 m/s`),g,rt[1].water!.land,du,dv,10,undefined,false);
    map(figure('wind-delta',`Thermal perturbation only · max ${maxSpeed(p.eastMps,p.northMps).toFixed(3)} m/s · 0–5 m/s`),g,rt[1].water!.land,p.eastMps,p.northMps,5,undefined,false);
    const ocean=rt.map(r=>r.environment!.ocean),currentLimit=.1;
    for(const k of [0,1,2])map(figure(k<2?'ocean-fields':'ocean-later',`Day ${days[k].toFixed(3)} · max applied current ${maxSpeed(ocean[k].eastMps,ocean[k].northMps).toFixed(5)} m/s · 0–0.10 m/s`),g,rt[k].water!.land,ocean[k].eastMps,ocean[k].northMps,currentLimit,rt[k].water!.seaIceKgM2);
    const cu=ocean[2].eastMps.map((v,i)=>v-ocean[1].eastMps[i]),cv=ocean[2].northMps.map((v,i)=>v-ocean[1].northMps[i]);
    map(figure('ocean-later',`Applied current Δ (98 − 49 d) · max ${maxSpeed(cu,cv).toFixed(5)} m/s · 0–0.10 m/s`),g,rt[2].water!.land,cu,cv,currentLimit);
    // Independent map capture must hold the actual cell vector at every sample.
    const captured=captureEnvironment(rt[1])!;for(let i=0;i<captured.east.length;i++){const k=thermalCell(g,(i%captured.width+.5)/captured.width,Math.floor(i/captured.width)/(captured.height-1));check(captured.east[i]===ocean[1].eastMps[k]&&captured.north[i]===ocean[1].northMps[k],'Comparison vector detached from applied ocean transport');}
    const create=(radiusM=DEFAULT_PLANET.radiusM)=>{const planet={...DEFAULT_PLANET,radiusM},land=new Float64Array(g.count),m=new ThermalModel(planet,DEFAULT_ORBIT,{...DEFAULT_THERMAL,diffusion:0},land,0,g);m.temperatureK.fill(290);const w=new WaterModel(g,radiusM,land,new Float64Array(g.count),m.temperatureK,{...DEFAULT_WATER,windMps:10});return {m,w,o:new OceanTransport(m,w,true)};};
    const memory=create(),u=Float64Array.from({length:g.count},(_,i)=>i<8*g.width?8:0),zero=new Float64Array(g.count),series=[{day:0,current:0}];
    for(let day=1;day<=25;day++){memory.w.setWinds(day<=10?u:day<=15?zero:u.map(v=>-v),zero);memory.o.step(86400,.3);series.push({day,current:memory.o.checkpoint()!.circulationMps[7*g.width]});}
    const target=.3*Math.tanh(1)/4;check(Math.abs(series[5].current-target*(1-Math.exp(-1)))<1e-12,'Five-day response differs');check(series[11].current>0&&series[15].current>0&&series[25].current<0,'Memory stopping/reversal wrong');check(memory.m.temperatureK.every(t=>Math.abs(t-290)<1e-10),'Uniform temperature transported spuriously');
    const mc=document.createElement('canvas');mc.width=1150;mc.height=290;document.querySelector('#memory')!.append(mc);const ctx=mc.getContext('2d')!,x0=70,y0=30,width=1030,height=205;
    for(const [a,b,color,label] of [[0,10,'#264844','+8 m/s shear'],[10,15,'#3e4545','zero wind'],[15,25,'#403745','−8 m/s shear']] as const){ctx.fillStyle=color;ctx.fillRect(x0+a/25*width,y0,(b-a)/25*width,height);ctx.fillStyle='#d6e3e7';ctx.font='15px system-ui';ctx.fillText(label,x0+a/25*width+12,y0+23);}
    for(const v of [-.06,-.03,0,.03,.06]){const y=y0+height*(.5-v/.14);ctx.fillStyle='#c1d5dd';ctx.fillText(v.toFixed(2),3,y+5);ctx.strokeStyle='#bfd5df33';ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x0+width,y);ctx.stroke();}
    ctx.strokeStyle='#79e5df';ctx.lineWidth=3;ctx.beginPath();series.forEach((s,i)=>{const x=x0+s.day/25*width,y=y0+height*(.5-s.current/.14);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();ctx.fillStyle='#dcebef';ctx.fillText('Loop memory (m/s)',x0,y0-8);for(let d=0;d<=25;d+=5)ctx.fillText(`${d} d`,x0+d/25*width-9,y0+height+23);
    const heat=[];for(const barrier of ['wet','land','ice','empty']){const f=create(10000),j=12,x=22,cell=j*g.width+x,mem=new Float64Array(g.width*(g.height-1));mem[cell]=.075;f.o.restore({circulationMps:mem},.3);f.m.temperatureK[cell]=310;
        if(barrier==='land')f.w.land[cell]=1;if(barrier==='ice')f.w.seaIceKgM2[cell]=917*.5;if(barrier==='empty')f.w.oceanGlobalKgM2=0;
        const initial=f.m.temperatureK.slice(),energy=f.m.energy();for(let s=0;s<1920;s++)f.o.step(900,.3);
        const changed=f.m.temperatureK.filter((t,i)=>Math.abs(t-initial[i])>1e-10).length,residual=f.m.energy()-energy;check(Math.abs(residual)<1e-5,'Fixture heat budget');check(barrier==='wet'?changed>0:changed===0,'Barrier crossed by heat');
        heat.push({barrier,changedCells:changed,energyResidualJm2:residual,donorK:f.m.temperatureK[cell],maxCurrentMps:maxSpeed(f.o.eastMps,f.o.northMps)});
        const hc=figure('heat-fields',`${barrier} · donor ${f.m.temperatureK[cell].toFixed(3)} K · ${changed} changed cells · 290 K blue → 310 K gold`),cx=hc.getContext('2d')!;hc.height=400;
        for(let yy=0;yy<4;yy++)for(let xx=0;xx<4;xx++){const i=(j-1+yy)*g.width+x-1+xx,t=f.m.temperatureK[i],a=Math.max(0,Math.min(1,(t-290)/20)),px=xx*140,py=yy*100;cx.fillStyle=`rgb(${Math.round(25+210*a)},${Math.round(88+80*a)},${Math.round(132-85*a)})`;cx.fillRect(px,py,140,100);cx.strokeStyle='#a4d3da66';cx.strokeRect(px,py,140,100);cx.fillStyle='#f3f7f5';cx.font='25px system-ui';cx.fillText(t.toFixed(2)+' K',px+8,py+58);if(i===cell){cx.font='19px system-ui';cx.fillText(barrier==='wet'?'warm donor':barrier+' barrier',px+8,py+22);}}
    }
    // A zoom shows the four-cell loop's actual temperatures, not interpolated art.
    document.querySelector('#controlled-results')!.textContent=`Uniform-temperature fixture unchanged. Memory at day 5: ${series[5].current.toFixed(6)} m/s; after 5 d without wind: ${series[15].current.toFixed(6)} m/s. Wet loop transfers heat inside four cells; land, half-metre sea ice and zero liquid inventory transfer none. Maximum absolute heat residual: ${Math.max(...heat.map(h=>Math.abs(h.energyResidualJm2))).toExponential(3)} J/m².`;
    const spin=[];for(const retrograde of [false,true]){const planet={...DEFAULT_PLANET,retrograde},land=new Float64Array(g.count),m=new ThermalModel(planet,DEFAULT_ORBIT,DEFAULT_THERMAL,land,0,g);for(let i=0;i<g.count;i++)m.temperatureK[i]=290+20*Math.sin(2*Math.PI*(i%g.width)/g.width);const w=new WaterModel(g,planet.radiusM,land,zero,m.temperatureK,{...DEFAULT_WATER,windMps:10}),a=new AtmosphericCirculation(m,w);a.step(10000,10000);spin.push({retrograde,a});}
    for(let i=0;i<g.count;i++){check(Math.abs(spin[0].a.eastMps[i]-spin[1].a.eastMps[i])<1e-12&&Math.abs(spin[0].a.northMps[i]+spin[1].a.northMps[i])<1e-12,'Retrograde Coriolis does not reverse');}
    const spinLimit=Math.max(...spin.map(s=>maxSpeed(s.a.eastMps,s.a.northMps)));
    for(const s of spin)map(figure('spin-fields',`${s.retrograde?'Retrograde':'Prograde'} · perturbation only · common scale 0–${spinLimit.toFixed(4)} m/s`),g,zero,s.a.eastMps,s.a.northMps,spinLimit);
    const report={status:'PASS',seed,grid:{width:g.width,height:g.height},days,steps:rt.map(r=>r.model!.steps),initialClimateReady:true,windMaxMps:winds.map(w=>maxSpeed(w.u,w.v)),perturbationMaxMps:maxSpeed(p.eastMps,p.northMps),currentMaxMps:ocean.map(o=>maxSpeed(o.eastMps,o.northMps)),budgets:rt.map(r=>({waterResidualMm:r.water!.diagnostics().residualMm,enthalpyResidualJm2:r.environment!.diagnostics().energyResidualJm2})),comparisonUsesActualVectors:true,memory:{targetMps:target,responseDays:5,series},heat,spin:{elapsedS:10000,temperatureContrastK:40,retrogradeReversesCoriolis:true,maxPerturbationMps:spinLimit},fixtureScope:'Controlled temperature, wind-shear and closed-loop heat inputs isolate kernels; coupled panels hydrate actual browser-downloaded state without advancing it.'};
    output.textContent=JSON.stringify(report,null,2);
}catch(error){output.textContent=`FAIL\n${(error as Error).stack}`;}
