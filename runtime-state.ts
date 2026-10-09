import type {ThermalConfig,ThermalCheckpoint} from './thermal.ts';
import type {WaterConfig,WaterCheckpoint} from './water.ts';
import type {EnvironmentConfig} from './environment.ts';
import type {VegetationCheckpoint} from './vegetation.ts';
import {BIOMES,type SurfaceReference} from './surface.ts';
import {SURFACE_WIDTH,SURFACE_HEIGHT} from './surface-grid.ts';

export interface RuntimeState {
    version:1;grid:{width:number;height:number};enabled:boolean;waterEnabled:boolean;
    config:ThermalConfig;waterConfig:WaterConfig;environmentConfig:EnvironmentConfig;
    state:null|{
        land:Float64Array;height:Float64Array;localLand:Float64Array;localHeight:Float64Array;
        epochS:number;stepS:number;lastTarget:number;initialEnergyJm2:number;initialEnthalpy:number|null;
        thermal:ThermalCheckpoint;radiationScale:Float64Array;
        water:(WaterCheckpoint&{initialTotalMm:number})|null;vegetation:VegetationCheckpoint|null;
        initialTemperature:Float64Array;initialSoil:Float64Array;
        initialSnow:Float64Array|null;initialIce:Float64Array|null;localSnowSeed:Float64Array|null;localIceSeed:Float64Array|null;
        surfaceReference:SurfaceReference;surfaceInitial:{temperatureK:Float64Array;soilFraction:Float64Array};iceEnergy:Float64Array;
    };
}
export function record(v:unknown):Record<string,unknown> {
    if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Expected snapshot object');return v as Record<string,unknown>;
}
export function scalar(v:unknown,name:string,min=-1e30,max=1e30,integer=false):number {
    if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||(integer&&!Number.isSafeInteger(v)))throw new Error(`Invalid ${name}`);return v;
}
export function boolean(v:unknown):boolean {if(typeof v!=='boolean')throw new Error('Invalid snapshot switch');return v;}
export function field(v:unknown,name:string,n:number,min=-1e30,max=1e30):Float64Array {
    if((!Array.isArray(v)&&!(v instanceof Float64Array)&&!(v instanceof Uint8Array))||v.length!==n)throw new Error(`Invalid ${name} dimensions`);
    return Float64Array.from(v as ArrayLike<number>,x=>scalar(x,name,min,max));
}
export function thermalConfig(v:unknown):ThermalConfig {
    const c=record(v);return {emissivity:scalar(c.emissivity,'emissivity',.1,1),landHeatCapacity:scalar(c.landHeatCapacity,'heat capacity',1e5,1e8),oceanDepthM:scalar(c.oceanDepthM,'mixed layer',.1,100),diffusion:scalar(c.diffusion,'diffusion',0,5)};
}
export function waterConfig(v:unknown):WaterConfig {
    const c=record(v);return {evaporationFraction:scalar(c.evaporationFraction,'evaporation fraction',0,1),soilCapacityKgM2:scalar(c.soilCapacityKgM2,'soil capacity',1,1000),initialOceanDepthM:scalar(c.initialOceanDepthM,'water inventory',0,10000),windMps:scalar(c.windMps,'wind',-100,100),moistureDiffusivityM2s:scalar(c.moistureDiffusivityM2s,'moisture mixing',0,1e7),routingSpeedMps:scalar(c.routingSpeedMps,'routing speed',.01,10)};
}
export function environmentConfig(v:unknown):EnvironmentConfig {
    const c=record(v);return {oceanStrengthMps:scalar(c.oceanStrengthMps,'ocean current',0,2),vegetation:boolean(c.vegetation),iceAlbedo:boolean(c.iceAlbedo)};
}
export function decodeRuntimeState(value:unknown):RuntimeState {
    const d=record(value),g=record(d.grid);if(d.version!==1)throw new Error('Unsupported simulation state version');
    const width=scalar(g.width,'grid width',4,8192,true),height=scalar(g.height,'grid height',2,4096,true),n=width*height,sn=SURFACE_WIDTH*SURFACE_HEIGHT;
    if(n>16384)throw new Error('Simulation grid too large');
    const result:RuntimeState={version:1,grid:{width,height},enabled:boolean(d.enabled),waterEnabled:boolean(d.waterEnabled),config:thermalConfig(d.config),waterConfig:waterConfig(d.waterConfig),environmentConfig:environmentConfig(d.environmentConfig),state:null};
    if(d.state===null)return result;
    if(!result.enabled)throw new Error('Disabled simulation has active state');
    const s=record(d.state),t=record(s.thermal),ref=record(s.surfaceReference),initial=record(s.surfaceInitial);
    const f=(o:Record<string,unknown>,key:string,len=n,min=0,max=1e30)=>field(o[key],key,len,min,max);
    const thermal:ThermalCheckpoint={temperatureK:f(t,'temperatureK',n,0,1e5),absorbedWm2:f(t,'absorbedWm2'),albedo:f(t,'albedo',n,0,1),
        steps:scalar(t.steps,'steps',0,Number.MAX_SAFE_INTEGER,true),radiationJm2:scalar(t.radiationJm2,'radiation'),exchangeJm2:scalar(t.exchangeJm2,'exchange'),radiationCorrection:scalar(t.radiationCorrection,'radiation correction'),exchangeCorrection:scalar(t.exchangeCorrection,'exchange correction')};
    let water:RuntimeState['state']['water']=null,vegetation:VegetationCheckpoint|null=null;
    if(result.waterEnabled) {
        const w=record(s.water),v=record(s.vegetation),wind=Math.abs(result.waterConfig.windMps)+1e-9;
        water={atmosphereKgM2:f(w,'atmosphereKgM2'),soilKgM2:f(w,'soilKgM2'),surfaceKgM2:f(w,'surfaceKgM2'),snowKgM2:f(w,'snowKgM2'),seaIceKgM2:f(w,'seaIceKgM2'),meltKgM2S:f(w,'meltKgM2S'),precipitationKgM2S:f(w,'precipitationKgM2S'),evaporationKgM2S:f(w,'evaporationKgM2S'),dischargeM3S:f(w,'dischargeM3S'),windEastMps:f(w,'windEastMps',n,-wind,wind),windNorthMps:f(w,'windNorthMps',n,-wind,wind),oceanGlobalKgM2:scalar(w.oceanGlobalKgM2,'ocean store',0),elapsedS:scalar(w.elapsedS,'water age',0,Number.MAX_SAFE_INTEGER),initialTotalMm:scalar(w.initialTotalMm,'initial water',0)};
        vegetation={meanK:f(v,'meanK',sn,0,1e5),rainMm:f(v,'rainMm',sn),cover:f(v,'cover',sn,0,1),weights:f(v,'weights',sn*Object.keys(BIOMES).length,0,1)};
        const types=Object.keys(BIOMES).length;
        for(let i=0;i<sn;i++){let sum=0;for(let b=0;b<types;b++)sum+=vegetation.weights[i*types+b];if(Math.abs(sum-1)>1e-8)throw new Error('Invalid vegetation mixture');}
    }else if(s.water!==null||s.vegetation!==null||s.initialEnthalpy!==null)throw new Error('Unexpected water state');
    const nullable=(key:string,len:number)=>result.waterEnabled?f(s,key,len):s[key]===null?null:(()=>{throw new Error(`Unexpected ${key}`);})();
    result.state={land:f(s,'land',n,0,1),height:f(s,'height',n,0,1),localLand:f(s,'localLand',sn,0,1),localHeight:f(s,'localHeight',sn,0,1),
        epochS:scalar(s.epochS,'epoch',0,Number.MAX_SAFE_INTEGER),stepS:scalar(s.stepS,'step',Number.MIN_VALUE,1800),lastTarget:scalar(s.lastTarget,'target time',0,Number.MAX_SAFE_INTEGER),initialEnergyJm2:scalar(s.initialEnergyJm2,'initial heat',0),initialEnthalpy:result.waterEnabled?scalar(s.initialEnthalpy,'initial enthalpy'):null,
        thermal,radiationScale:f(s,'radiationScale',n,.55,1),water,vegetation,initialTemperature:f(s,'initialTemperature',n,0,1e5),initialSoil:f(s,'initialSoil',n,0,1),initialSnow:nullable('initialSnow',n),initialIce:nullable('initialIce',n),localSnowSeed:nullable('localSnowSeed',sn),localIceSeed:nullable('localIceSeed',sn),
        surfaceReference:{meanTemperatureK:f(ref,'meanTemperatureK',sn,0,1e5),warmestTemperatureK:f(ref,'warmestTemperatureK',sn,0,1e5),annualRainMm:f(ref,'annualRainMm',sn),monthlyIceCooling:f(ref,'monthlyIceCooling',12*sn,-1e30)},
        surfaceInitial:{temperatureK:f(initial,'temperatureK',sn,0,1e5),soilFraction:f(initial,'soilFraction',sn,0,1)},iceEnergy:f(s,'iceEnergy',sn)};
    const state=result.state,age=thermal.steps*state.stepS,time=state.epochS+age;
    if(!Number.isFinite(time)||time>Number.MAX_SAFE_INTEGER||time>state.lastTarget+1e-6||state.lastTarget-time>=state.stepS+1e-6)throw new Error('Inconsistent simulation time');
    if(water&&Math.abs(water.elapsedS-age)>Math.max(1e-6,age*1e-10))throw new Error('Inconsistent water age');
    return result;
}
