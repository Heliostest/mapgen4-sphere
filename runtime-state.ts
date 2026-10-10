import type {ThermalConfig,ThermalCheckpoint} from './thermal.ts';
import type {WaterConfig,WaterCheckpoint} from './water.ts';
import type {EnvironmentConfig,EnvironmentCheckpoint} from './environment.ts';
import type {VegetationCheckpoint} from './vegetation.ts';
import {BIOMES,type SurfaceReference} from './surface.ts';
import {SURFACE_WIDTH,SURFACE_HEIGHT} from './surface-grid.ts';
import type {TerrainWaterCheckpoint} from './terrain-water.ts';
import type {GlacierCheckpoint} from './glacier.ts';

export interface RuntimeState {
    version:1;grid:{width:number;height:number};enabled:boolean;waterEnabled:boolean;
    config:ThermalConfig;waterConfig:WaterConfig;environmentConfig:EnvironmentConfig;
    state:null|{
        land:Float64Array;height:Float64Array;localLand:Float64Array;localHeight:Float64Array;
        epochS:number;stepS:number;lastTarget:number;initialEnergyJm2:number;initialEnthalpy:number|null;
        thermal:ThermalCheckpoint;radiationScale:Float64Array;
        circulation:EnvironmentCheckpoint|null;
        water:(WaterCheckpoint&{initialTotalMm:number})|null;vegetation:VegetationCheckpoint|null;
        initialTemperature:Float64Array;initialSoil:Float64Array;
        initialSnow:Float64Array|null;initialIce:Float64Array|null;localSnowSeed:Float64Array|null;localIceSeed:Float64Array|null;
        initialLandIce:Float64Array|null;localLandIceSeed:Float64Array|null;
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
    if((!Array.isArray(v)&&!(v instanceof Float64Array)&&!(v instanceof Uint8Array)&&!(v instanceof Int32Array))||v.length!==n)throw new Error(`Invalid ${name} dimensions`);
    return Float64Array.from(v as ArrayLike<number>,x=>scalar(x,name,min,max));
}
export function thermalConfig(v:unknown):ThermalConfig {
    const c=record(v);return {emissivity:scalar(c.emissivity,'emissivity',.1,1),landHeatCapacity:scalar(c.landHeatCapacity,'heat capacity',1e5,1e8),oceanDepthM:scalar(c.oceanDepthM,'mixed layer',.1,100),diffusion:scalar(c.diffusion,'diffusion',0,5)};
}
export function waterConfig(v:unknown):WaterConfig {
    const c=record(v);return {evaporationFraction:scalar(c.evaporationFraction,'evaporation fraction',0,1),soilCapacityKgM2:scalar(c.soilCapacityKgM2,'soil capacity',1,1000),initialOceanDepthM:scalar(c.initialOceanDepthM,'water inventory',0,10000),windMps:scalar(c.windMps,'wind',-100,100),moistureDiffusivityM2s:scalar(c.moistureDiffusivityM2s,'moisture mixing',0,1e7),routingSpeedMps:scalar(c.routingSpeedMps,'routing speed',.01,10)};
}
export function environmentConfig(v:unknown):EnvironmentConfig {
    const c=record(v);return {oceanStrengthMps:scalar(c.oceanStrengthMps,'ocean current',0,2),vegetation:boolean(c.vegetation),iceAlbedo:boolean(c.iceAlbedo),terrainWater:c.terrainWater===undefined?false:boolean(c.terrainWater),glaciers:c.glaciers===undefined?false:boolean(c.glaciers),dynamicCirculation:c.dynamicCirculation===undefined?false:boolean(c.dynamicCirculation)};
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
        let routing:TerrainWaterCheckpoint|null=null;
        let glacier:GlacierCheckpoint|null=null;
        const landIceKgM2=w.landIceKgM2===undefined&&!result.environmentConfig.glaciers?new Float64Array(n):f(w,'landIceKgM2');
        const landIceCorrection=w.landIceCorrection===undefined&&!result.environmentConfig.glaciers?new Float64Array(n):f(w,'landIceCorrection',n,-1e30);
        if(landIceCorrection.some((v,i)=>Math.abs(v)>Math.max(1e-12,Number.EPSILON*landIceKgM2[i])))throw new Error('Invalid grounded ice compensation');
        if(result.environmentConfig.glaciers) {
            const g=record(w.glacier);glacier={erodedM:f(g,'erodedM'),sedimentM:f(g,'sedimentM'),depositedM:f(g,'depositedM'),speedMps:f(g,'speedMps'),outflowM3S:f(g,'outflowM3S'),limitedCells:scalar(g.limitedCells,'ice limiter count',0,4*n,true)};
        }else if((w.glacier!==undefined&&w.glacier!==null)||landIceKgM2.some(v=>v!==0))throw new Error('Unexpected land ice state');
        if(result.environmentConfig.terrainWater) {
            // The opt-in 4x Earth mesh has 215,348 triangles. Keep a bounded
            // allocation limit while allowing its complete reservoir state.
            const r=record(w.routing),length=scalar((r.volumeM3 as number[])?.length,'terrain routing count',4,250000,true);
            const receivers=f(r,'receiverSide',length,-1,3*length-1);
            if(receivers.some(v=>!Number.isInteger(v)))throw new Error('Invalid terrain routing side');
            routing={volumeM3:f(r,'volumeM3',length),fluxM3S:f(r,'fluxM3S',length),receiverSide:new Int32Array(receivers)};
        }else if(w.routing!==undefined&&w.routing!==null)throw new Error('Unexpected terrain routing state');
        water={snowfallKgM2S:w.snowfallKgM2S===undefined||w.snowfallKgM2S===null?null:f(w,'snowfallKgM2S'),atmosphereKgM2:f(w,'atmosphereKgM2'),soilKgM2:f(w,'soilKgM2'),surfaceKgM2:f(w,'surfaceKgM2'),snowKgM2:f(w,'snowKgM2'),seaIceKgM2:f(w,'seaIceKgM2'),meltKgM2S:f(w,'meltKgM2S'),precipitationKgM2S:f(w,'precipitationKgM2S'),evaporationKgM2S:f(w,'evaporationKgM2S'),dischargeM3S:f(w,'dischargeM3S'),windEastMps:f(w,'windEastMps',n,-wind,wind),windNorthMps:f(w,'windNorthMps',n,-wind,wind),oceanGlobalKgM2:scalar(w.oceanGlobalKgM2,'ocean store',0),elapsedS:scalar(w.elapsedS,'water age',0,Number.MAX_SAFE_INTEGER),initialTotalMm:scalar(w.initialTotalMm,'initial water',0),routing,landIceKgM2,landIceCorrection,glacier};
        vegetation={meanK:f(v,'meanK',sn,0,1e5),rainMm:f(v,'rainMm',sn),cover:f(v,'cover',sn,0,1),weights:f(v,'weights',sn*Object.keys(BIOMES).length,0,1)};
        const types=Object.keys(BIOMES).length;
        for(let i=0;i<sn;i++){let sum=0;for(let b=0;b<types;b++)sum+=vegetation.weights[i*types+b];if(Math.abs(sum-1)>1e-8)throw new Error('Invalid vegetation mixture');}
    }else if(s.water!==null||s.vegetation!==null||s.initialEnthalpy!==null)throw new Error('Unexpected water state');
    let circulation:EnvironmentCheckpoint|null=null;
    if(result.waterEnabled&&result.environmentConfig.dynamicCirculation) {
        const c=record(s.circulation),a=record(c.atmosphere),o=record(c.ocean),limit=Math.abs(result.waterConfig.windMps)/2,speed=result.environmentConfig.oceanStrengthMps/4;
        circulation={atmosphere:{eastMps:field(a.eastMps,'circulation east',n,-limit,limit),northMps:field(a.northMps,'circulation north',n,-limit,limit)},ocean:{circulationMps:field(o.circulationMps,'ocean circulation',width*(height-1),-speed,speed)}};
    }else if(s.circulation!==undefined&&s.circulation!==null)throw new Error('Unexpected circulation state');
    const nullable=(key:string,len:number)=>result.waterEnabled?f(s,key,len):s[key]===null?null:(()=>{throw new Error(`Unexpected ${key}`);})();
    const optionalIce=(key:string,len:number)=>result.waterEnabled?(s[key]===undefined&&!result.environmentConfig.glaciers?new Float64Array(len):f(s,key,len)):null;
    result.state={land:f(s,'land',n,0,1),height:f(s,'height',n,0,1),localLand:f(s,'localLand',sn,0,1),localHeight:f(s,'localHeight',sn,0,1),
        epochS:scalar(s.epochS,'epoch',0,Number.MAX_SAFE_INTEGER),stepS:scalar(s.stepS,'step',Number.MIN_VALUE,1800),lastTarget:scalar(s.lastTarget,'target time',0,Number.MAX_SAFE_INTEGER),initialEnergyJm2:scalar(s.initialEnergyJm2,'initial heat',0),initialEnthalpy:result.waterEnabled?scalar(s.initialEnthalpy,'initial enthalpy'):null,
        thermal,circulation,radiationScale:f(s,'radiationScale',n,.55,1),water,vegetation,initialTemperature:f(s,'initialTemperature',n,0,1e5),initialSoil:f(s,'initialSoil',n,0,1),initialSnow:nullable('initialSnow',n),initialIce:nullable('initialIce',n),initialLandIce:optionalIce('initialLandIce',n),localLandIceSeed:optionalIce('localLandIceSeed',sn),localSnowSeed:nullable('localSnowSeed',sn),localIceSeed:nullable('localIceSeed',sn),
        surfaceReference:{meanTemperatureK:f(ref,'meanTemperatureK',sn,0,1e5),warmestTemperatureK:f(ref,'warmestTemperatureK',sn,0,1e5),annualRainMm:f(ref,'annualRainMm',sn),monthlyIceCooling:f(ref,'monthlyIceCooling',12*sn,-1e30)},
        surfaceInitial:{temperatureK:f(initial,'temperatureK',sn,0,1e5),soilFraction:f(initial,'soilFraction',sn,0,1)},iceEnergy:f(s,'iceEnergy',sn)};
    const state=result.state,age=thermal.steps*state.stepS,time=state.epochS+age;
    if(water?.landIceKgM2.some((v,i)=>state.land[i]===0&&v!==0))throw new Error('Grounded ice requires land');
    if(water?.snowfallKgM2S?.some((v,i)=>v>water!.precipitationKgM2S[i]*state.land[i]+1e-12))throw new Error('Snowfall exceeds precipitation on land');
    if(!Number.isFinite(time)||time>Number.MAX_SAFE_INTEGER||time>state.lastTarget+1e-6||state.lastTarget-time>=state.stepS+1e-6)throw new Error('Inconsistent simulation time');
    if(water&&Math.abs(water.elapsedS-age)>Math.max(1e-6,age*1e-10))throw new Error('Inconsistent water age');
    return result;
}
