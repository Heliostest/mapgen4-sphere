/** Diagnostic runs, separate from the published comparison and its inputs. */
import {GCM} from '@exoplasim/config';
import {GCM_WASM_RUNNER} from '@exoplasim/wasm';
import {GCM_GRID} from '@exoplasim/grid';
import {GCM_FIELDS} from '@exoplasim/fields';
import {GCM_BOUNDARY} from '@/model/climate/gcm/boundary';
import {referenceConfig} from './reference-config.ts';

const params=new URLSearchParams(location.search),scenario=params.get('scenario')||'original',days=Number(params.get('days')||2);
const state=(window as any).exoAudit={scenario,status:'loading',error:null,day:0,samples:[],first:null,inputs:null};
try{
 const input=await (await fetch('/build/exoplasim/input.json')).json();
 const config=scenario==='production'?referenceConfig(GCM.DEFAULT_CONFIG,input.config):{...GCM.DEFAULT_CONFIG,...input.config,timestepMinutes:45,earthSurfaceClimatology:scenario==='earth-files',targetTemperatureK:null,glaciers:{enabled:false,minDepthM:2,initialHeightM:0}};
 if(scenario==='no-glacier-seed'||scenario==='no-glacier-sst')config.glaciers.initialHeightM=-1;
 const terrain={...input.terrain,land:Float32Array.from(input.terrain.land),elevationM:Float32Array.from(input.terrain.elevationM)};
 if(scenario==='all-ocean'){terrain.land.fill(0);terrain.elevationM.fill(0);}
 if(scenario==='all-land'){terrain.land.fill(1);terrain.elevationM.fill(0);}
 const grid=GCM_GRID.forLatitudes(32),boundary=GCM_BOUNDARY.fromTerrain({grid,terrain,gravityMs2:config.gravityMs2});
 const manifest=await GCM_WASM_RUNNER.manifest(),cpu=manifest!.resolutions.find(x=>x.truncation===21&&x.layers===10)!;
 const expectedMask=Float32Array.from(boundary.landFraction,x=>x>.5?1:0),mean=(x:ArrayLike<number>)=>GCM_GRID.globalMean(Float64Array.from(x));
 state.inputs={config,worldSha256:input.worldSha256,expectedLandFraction:mean(expectedMask),boundaryLandFraction:mean(boundary.landFraction),orographyMin:Math.min(...boundary.geopotential),orographyMax:Math.max(...boundary.geopotential),expectedMask:Array.from(expectedMask)};
 let firstStep:number|null=null,done=false,checkpointing=false;
 const run=GCM_WASM_RUNNER.start({engine:'cpu',ranks:4,config,terrain,resolution:{...cpu,cpu,gpu:null},publishEvery:1,restart:null,previousConfig:null,averager:null,targeting:null,startPaused:false,
  onStatus(s){if(!done)state.status=s.status;if(s.status==='failed')state.error=s.message;},onDevice(){},onAverages(){},onTargeting(){},
  onCheckpoint(saved){try{
   const view=new DataView(saved.restart);let offset=0;const wanted=new Set(['dls','dglac','dicec','diced','xicec','xiced','ysst','xsst','xts','dts','xclsst','yclsst','albedo']);const fields:any={};
   const record=()=>{const bytes=view.getUint32(offset,true),start=offset+4;if(view.getUint32(start+bytes,true)!==bytes)throw new Error('Invalid native record');offset=start+bytes+4;return {bytes,start};};
   while(offset<view.byteLength){const name=record();if(name.bytes!==16)throw new Error('Invalid native field');const key=new TextDecoder().decode(new Uint8Array(saved.restart,name.start,16)).trim();const data=record();if(wanted.has(key)&&data.bytes%8===0)fields[key]=Array.from({length:data.bytes/8},(_,i)=>view.getFloat64(data.start+8*i,true));}
   state.nativeFields=fields;state.nativeSummary=Object.fromEntries(Object.entries(fields).map(([key,value]:[string,any])=>[key,{count:value.length,min:Math.min(...value),max:Math.max(...value),mean:value.length===grid.points?mean(value):value.reduce((s:number,v:number)=>s+v,0)/value.length}]));
   done=true;run.stop();state.status='complete';
  }catch(error){done=true;run.stop();state.error=String(error);state.status='failed';}},
  onSnapshot(s){try{
   if(done||checkpointing)return;if(firstStep===null)firstStep=s.step;
   const day=(s.step-firstStep+1)*config.timestepMinutes/1440;state.day=day;
   const field=(key:any)=>GCM_FIELDS.field({snapshot:s,field:key});
   const stats=()=>{
    const land=field('landFraction'),seaIce=field('seaIce'),skin=field('surfaceTemperature'),air=field('airTemperature'),ice=field('seaIceThickness');
    let maskErrors=0;for(let k=0;k<land.length;k++)if(Math.abs(land[k]-expectedMask[k])>1e-6)maskErrors++;
    const conditional=(a:ArrayLike<number>,ocean:boolean)=>{const weights=Float64Array.from(land,v=>ocean?1-v:v);const w=mean(weights);return w?mean(Float64Array.from(a,(x,k)=>x*weights[k]))/w:null;};
    return {day,date:s.date,landFraction:mean(land),maskErrors,landGlacierFraction:conditional(field('glacierCover'),false),airC:mean(air)-273.15,skinC:mean(skin)-273.15,landSkinC:conditional(skin,false)===null?null:conditional(skin,false)-273.15,oceanSkinC:conditional(skin,true)===null?null:conditional(skin,true)-273.15,globalSeaIceFraction:mean(seaIce),oceanSeaIceFraction:conditional(seaIce,true),oceanIceThicknessM:conditional(ice,true),albedo:mean(field('albedo')),landAlbedo:conditional(field('albedo'),false),toaShortwave:mean(field('toaShortwave')),toaLongwave:mean(field('toaLongwave')),toaNet:mean(field('toaNetRadiation')),surfaceNet:mean(field('surfaceNetHeat')),surfacePressurePa:mean(field('surfacePressure')),precipitationMmDay:mean(field('precipitation'))*86400000};
   };
   if(!state.first){state.first={...stats(),land:Array.from(field('landFraction')),skinK:Array.from(field('surfaceTemperature')),airK:Array.from(field('airTemperature')),seaIce:Array.from(field('seaIce')),iceM:Array.from(field('seaIceThickness'))};}
   if(Math.abs(day-Math.round(day))<1e-8)state.samples.push(stats());
   if(day>=days){checkpointing=true;run.checkpoint();}
  }catch(error){done=true;run.stop();state.error=String(error);state.status='failed';}}
 });
}catch(error){state.error=String(error);state.status='failed';}
