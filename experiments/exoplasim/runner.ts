// Built against a separately downloaded, pinned GPL ExoPlaSim checkout.
// No model code or bundled Earth geography is copied into the product sources.
import {GCM} from '@exoplasim/config';
import {GCM_WASM_RUNNER} from '@exoplasim/wasm';
import {GCM_GRID} from '@exoplasim/grid';
import {GCM_FIELDS} from '@exoplasim/fields';
import {GCM_NAMELIST} from '@exoplasim/namelist';
import {makeRemap,remap,rawFields,FIELDS,sampleMonth} from './data.ts';
import {referenceConfig} from './reference-config.ts';

const state=(window as any).exoRun={status:'loading',day:0,result:null,error:null};
try{
 if(!crossOriginIsolated)throw new Error('Cross-origin isolation is required for the CPU model');
 const input=await (await fetch('/build/exoplasim/input.json')).json();
 const config=referenceConfig(GCM.DEFAULT_CONFIG,input.config);
 const manifest=await GCM_WASM_RUNNER.manifest(),cpu=manifest!.resolutions.find(x=>x.truncation===21&&x.layers===10)!;
 const grid=GCM_GRID.forLatitudes(32),mapping=makeRemap(grid.longitudes,grid.latitudeWeights),dt=config.timestepMinutes*60;
 const sums=Array.from({length:12},()=>Object.fromEntries(FIELDS.map(k=>[k,new Float64Array(grid.points)])));
 const counts=new Uint32Array(12),dates:any[]=[];let firstYear:number|null=null,lastStep:number|null=null,total=0,initialization:any=null;
 const started=performance.now();
 const run=GCM_WASM_RUNNER.start({engine:'cpu',ranks:4,config,terrain:{...input.terrain,land:Float32Array.from(input.terrain.land),elevationM:Float32Array.from(input.terrain.elevationM)},resolution:{...cpu,cpu,gpu:null},publishEvery:1,restart:null,previousConfig:null,averager:null,targeting:null,startPaused:false,
  onStatus(s){state.status=s.status;if(s.status==='failed')state.error=s.message;},onDevice(d){state.device=d;},onAverages(){},onCheckpoint(){},onTargeting(){},
  onSnapshot(s){try{
   if(firstYear===null){firstYear=s.date.year;state.firstSample={step:s.step,date:s.date};if(s.date.month!==1||s.date.day!==1||s.date.hour*60+s.date.minute!==config.timestepMinutes)throw new Error(`Unexpected first step date: ${JSON.stringify(s.date)}`);
    const land=GCM_FIELDS.field({snapshot:s,field:'landFraction'}),glacier=GCM_FIELDS.field({snapshot:s,field:'glacierCover'}),albedo=GCM_FIELDS.field({snapshot:s,field:'albedo'});
    const landFraction=GCM_GRID.globalMean(land),landGlacier=GCM_GRID.globalMean(Float64Array.from(land,(v,k)=>v*glacier[k]))/landFraction;
    initialization={landFraction,landGlacierFraction:Number.isFinite(landGlacier)?landGlacier:0,landAlbedo:landFraction?GCM_GRID.globalMean(Float64Array.from(land,(v,k)=>v*albedo[k]))/landFraction:null,forcedGlacierSeeding:false,seaTemperatureInput:'native cold start, no SST input; native mixed-layer initialization 271.25 K',validation:'First-step diagnostics, not a climate-accuracy check'};
   }
   if(lastStep!==null&&s.step!==lastStep+1)throw new Error('A model step was skipped in the statistics');lastStep=s.step;
   const m=sampleMonth(total,dt),values=rawFields(GCM_FIELDS.field({snapshot:s,field:'airTemperature'}),GCM_FIELDS.field({snapshot:s,field:'precipitation'}),GCM_FIELDS.field({snapshot:s,field:'windU'}),GCM_FIELDS.field({snapshot:s,field:'windV'}));
   for(const key of FIELDS)for(let k=0;k<grid.points;k++){const v=values[key][k];if(!Number.isFinite(v)||(key==='rainMmDay'&&v<0))throw new Error(`Invalid ${key} at step ${s.step}`);sums[m][key][k]+=v;}
   counts[m]++;total++;dates.push({step:s.step,...s.date});state.day=total*dt/86400;
   if(total===365*86400/dt){
    run.stop();const months=sums.map((sum,m)=>({month:m+1,width:48,height:24,seconds:counts[m]*dt,samples:counts[m],...Object.fromEntries(FIELDS.map(key=>[key,remap(mapping,Float64Array.from(sum[key],v=>v/counts[m]))]))}));
    const expected=[31,28,31,30,31,30,31,31,30,31,30,31].map(d=>d*86400/dt);
    if(counts.some((n,i)=>n!==expected[i]))throw new Error(`Incomplete calendar sampling: ${Array.from(counts)}; expected ${expected}`);
    state.result={worldSha256:input.worldSha256,upstreamCommit:'daface8c0846dfa2beeda9c98756b2cfc4350937',engine:'CPU WASM FP64 (published diagnostics FP32)',config,namelists:GCM_NAMELIST.edits(config),grid:{longitudes:grid.longitudes,latitudesDeg:Array.from(grid.latitudesDeg),weights:Array.from(grid.latitudeWeights)},months,
     rawMonths:sums.map((sum,i)=>({month:i+1,...Object.fromEntries(FIELDS.map(k=>[k,Array.from(sum[k],v=>v/counts[i])]))})),
     firstSample:state.firstSample,lastSample:dates.at(-1),samples:total,initialization,wallSeconds:(performance.now()-started)/1000,notes:'Every physical step sampled; exact Gregorian non-leap calendar counts; first transient year, no spin-up. 2m air temperature, lowest sigma-layer wind, total precipitation. Area-conservative remapping to the display grid.'};
    state.status='complete';return;
   }
  }catch(error){run.stop();state.status='failed';state.error=String(error);}}
 });
}catch(error){state.status='failed';state.error=String(error);}
