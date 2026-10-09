import type {ThermalModel} from './thermal.ts';
import {moistureCapacity,type WaterModel} from './water.ts';
import type {ThermalRuntime,ThermalTexture} from './thermal-runtime.ts';
import {makeSurfaceGrid,resampleClimateField} from './surface-grid.ts';
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const displayGrid=makeSurfaceGrid();
export function weatherFields(m:ThermalModel,w:WaterModel) {
    const saturation=w.atmosphereKgM2.map((v,i)=>v/moistureCapacity(m.temperatureK[i]));
    const cloud=saturation.map(v=>{const f=clamp((v-.7)/.3);return f*f*(3-2*f);});
    // Older saves lack precipitation phase. Wait for a real step, never infer
    // old snowfall from a temperature changed by subsequent latent heating.
    const active=m.steps>0&&w.snowfallKgM2S!==null;
    const snowMmDay=w.precipitationKgM2S.map((_,i)=>active?w.snowfallKgM2S![i]*86400:0);
    const rainMmDay=w.precipitationKgM2S.map((v,i)=>active?Math.max(0,v*86400-snowMmDay[i]):0);
    return {saturation,cloud,rainMmDay,snowMmDay};
}
export function weatherTexture(m:ThermalModel,w:WaterModel):ThermalTexture {
    const fields=weatherFields(m,w),cloud=resampleClimateField(m.grid,fields.cloud,displayGrid),rain=resampleClimateField(m.grid,fields.rainMmDay,displayGrid),snow=resampleClimateField(m.grid,fields.snowMmDay,displayGrid);
    const pixels=new Uint8Array(displayGrid.count*4),amount=(v:number)=>Math.round(255*clamp(Math.log1p(v)/Math.log(51)));
    for(let i=0;i<displayGrid.count;i++)pixels.set([Math.round(255*cloud[i]),amount(rain[i]),amount(snow[i]),255],4*i);
    return {width:displayGrid.width,height:displayGrid.height,pixels,timeS:m.timeS};
}
const cache=new WeakMap<ThermalRuntime,{model:ThermalModel;steps:number;texture:ThermalTexture}>();
export function weatherView(rt:ThermalRuntime) {
    const m=rt.model,w=rt.water;if(!m||!w)return null;
    const old=cache.get(rt);if(old?.model===m&&old.steps===m.steps)return old.texture;
    const texture=weatherTexture(m,w);cache.set(rt,{model:m,steps:m.steps,texture});return texture;
}
