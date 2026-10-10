import {generateThermalClimate,circulationWinds,type ClimateGrid} from './climate.ts';
import {WaterModel,moistureCapacity,type WaterConfig} from './water.ts';
import {makeThermalGrid,ThermalModel,type ThermalGrid,type ThermalConfig} from './thermal.ts';
import {AtmosphericCirculation} from './circulation.ts';
import {EnvironmentModel,DEFAULT_ENVIRONMENT,type EnvironmentConfig} from './environment.ts';
import {deriveOrbit,type OrbitConfig} from './astronomy.ts';
import {finiteInRange,type PlanetConfig} from './planet.ts';
import {resampleClimateField} from './surface-grid.ts';

type MoistureMonth={atmosphereKgM2:Float64Array;rainMmDay:Float64Array;evaporationMmDay:Float64Array;soilFraction:Float64Array;humidityFraction:Float64Array;surfaceMm:Float64Array;temperatureK:Float64Array;landTemperatureK:Float64Array;oceanTemperatureK:Float64Array;windEastMps:Float64Array;windNorthMps:Float64Array};
export interface MoistureReference {months:MoistureMonth[];waterResidualMm:number;externalLatentHeatJm2:number;energyResidualJm2?:number;coupled:boolean;integratedYearS:number;forcingYearS:number;spinupYearS:number;referenceRadiusM:number;steps:number;}
const cache=new Map<string,MoistureReference>(),DAY=86400;
/** One spinup and one recorded cycle using the live moisture closure.
 * Stable ordinary configurations integrate the coupled thermal model at the
 * real year and radius at no more than the live time step, bounded by
 * 131072 steps and 200 million edge-steps across both orbits.
 * Stiff/long-year cases use prescribed periodic temperature heat baths over
 * an explicitly compressed cycle, <=4096 steps; external heat is reported.
 * This short initialization does not claim climate equilibrium. */
export function referenceMoisture(target:ClimateGrid,planet:PlanetConfig,orbit:OrbitConfig,thermal:ThermalConfig,water:WaterConfig,land:ArrayLike<number>,heightM:ArrayLike<number>,environmentConfig:EnvironmentConfig=DEFAULT_ENVIRONMENT,maxStepS=21600):MoistureReference {
    finiteInRange(maxStepS,'reference maximum step',Number.MIN_VALUE);
    const annualOrbit={...orbit,orbitPhaseRad:0,spinPhaseRad:0};
    const key=JSON.stringify([target.width,target.height,planet,annualOrbit,thermal,water,environmentConfig,maxStepS,Array.from(land),Array.from(heightM)]);
    const known=cache.get(key);if(known)return known;
    const physical='solidAngle' in target,grid=physical?target as ThermalGrid:makeThermalGrid();
    let f=Float64Array.from(land),h=Float64Array.from(heightM);
    if(!physical) {
        f=new Float64Array(grid.count);h=new Float64Array(grid.count);const weights=new Float64Array(grid.count);
        for(let j=0;j<target.height;j++)for(let x=0;x<target.width;x++) {
            const row=Math.max(0,Math.min(grid.height-1,Math.floor((1-target.sinLat[j])*grid.height/2)));
            const k=row*grid.width+Math.floor((x+.5)*grid.width/target.width),i=j*target.width+x;
            const a=Math.cos(Math.PI*Math.max(0,(j-.5)/(target.height-1)))-Math.cos(Math.PI*Math.min(1,(j+.5)/(target.height-1)));
            weights[k]+=a;f[k]+=a*land[i];h[k]+=a*land[i]*heightM[i];
        }
        for(let i=0;i<grid.count;i++){h[i]=f[i]>0?h[i]/f[i]:0;f[i]=weights[i]>0?f[i]/weights[i]:0;}
    }
    const {yearS}=deriveOrbit(planet,orbit),zero=()=>new Float64Array(grid.count),ones=()=>zero().fill(1);
    const forcing=generateThermalClimate(grid,planet,annualOrbit,thermal,water,f,h,0);
    const model=new ThermalModel(planet,annualOrbit,{...thermal,separateReservoirs:true},f,0,grid,forcing);
    const w=new WaterModel(grid,planet.radiusM,f,h,forcing.temperatureK,water,{...forcing,rainMmDay:zero(),evaporationMmDay:zero(),soilFraction:zero(),humidityFraction:zero(),surfaceMm:zero()});
    const effectiveStep=Math.min(maxStepS,w.maxStepS);
    const fallbackCount=Math.max(1,Math.min(2048,Math.floor(3e7/Math.max(1,grid.edges.length))));
    const initial=w.diagnostics().totalMm,period=Math.min(yearS,366*DAY,fallbackCount*effectiveStep);
    const count=Math.min(fallbackCount,Math.ceil(period/effectiveStep)),dt=period/count;
    const atmosphere=environmentConfig.dynamicCirculation?new AtmosphericCirculation(model,w):null;
    // Interpolated periodic samples avoid month-edge forcing jumps.
    const samples=Array.from({length:48},(_,s)=>{
        const t=s*yearS/48,air=generateThermalClimate(grid,planet,annualOrbit,thermal,water,f,h,t);
        const ground=generateThermalClimate(grid,planet,annualOrbit,thermal,water,ones(),h,t);
        const sea=generateThermalClimate(grid,planet,annualOrbit,thermal,water,zero(),zero(),t);
        return {air,ground:ground.temperatureK,sea:sea.temperatureK};
    });
    const coupling={heatJm2:zero(),landHeatJm2:zero(),oceanHeatJm2:zero(),landEvaporation:ones().fill(.8),iceCover:zero(),oceanFrozenCover:zero(),landTemperatureK:model.landTemperatureK,oceanTemperatureK:model.oceanTemperatureK};
    const fields=['atmosphereKgM2','rainMmDay','evaporationMmDay','soilFraction','humidityFraction','surfaceMm','temperatureK','landTemperatureK','oceanTemperatureK','windEastMps','windNorthMps'] as const;
    const months=Array.from({length:12},()=>Object.fromEntries(fields.map(k=>[k,zero()])) as MoistureMonth);
    const coupledStep=Math.min(maxStepS,model.stepS,w.maxStepS,yearS/720);
    if(2*Math.ceil(yearS/coupledStep)<=131072&&2*Math.ceil(yearS/coupledStep)*grid.edges.length<=2e8) {
        // Integrate the actual coupled model without enlarging its live step.
        // Exotic stiff configurations use the explicitly
        // marked prescribed-temperature approximation below.
        model.stepS=yearS/Math.ceil(yearS/coupledStep);
        const environment=new EnvironmentModel(model,w,{...environmentConfig,terrainWater:false,glaciers:false});
        const steps=2*Math.ceil(yearS/coupledStep);
        model.advanceTo(steps*model.stepS,steps,delta=>{
            if(environment.atmosphere)environment.atmosphere.step(delta,model.timeS+delta/2);
            else {const wind=circulationWinds(grid,planet,annualOrbit,model.timeS+delta/2,f,water.windMps);w.setWinds(wind.eastMps,wind.northMps);}
            environment.step(delta);
            for(let cursor=Math.max(yearS,model.timeS),right=Math.min(2*yearS,model.timeS+delta);cursor<right;){
                const month=Math.min(11,Math.floor((cursor-yearS)/(yearS/12)+1e-10)),next=Math.min(right,yearS+(month+1)*yearS/12),weight=(next-cursor)/(yearS/12),out=months[month];
                for(let i=0;i<grid.count;i++){
                    out.atmosphereKgM2[i]+=weight*w.atmosphereKgM2[i];
                    out.rainMmDay[i]+=w.precipitationKgM2S[i]*DAY*weight;out.evaporationMmDay[i]+=w.evaporationKgM2S[i]*DAY*weight;
                    out.soilFraction[i]+=weight*(f[i]>0?w.soilKgM2[i]/(water.soilCapacityKgM2*f[i]):0);out.humidityFraction[i]+=weight*Math.min(1,w.atmosphereKgM2[i]/moistureCapacity(model.temperatureK[i]));out.surfaceMm[i]+=weight*(f[i]>0?w.surfaceKgM2[i]/f[i]:0);
                    out.temperatureK[i]+=weight*model.temperatureK[i];out.landTemperatureK[i]+=weight*model.landTemperatureK[i];out.oceanTemperatureK[i]+=weight*model.oceanTemperatureK[i];out.windEastMps[i]+=weight*w.windEastMps[i];out.windNorthMps[i]+=weight*w.windNorthMps[i];
                }cursor=next;
            }
        });
        for(const month of months)for(const name of ['soilFraction','humidityFraction'] as const)for(let i=0;i<grid.count;i++)month[name][i]=Math.max(0,Math.min(1,month[name][i]));
        const result:MoistureReference={months:physical?months:months.map(month=>Object.fromEntries(Object.entries(month).map(([name,values])=>[name,resampleClimateField(grid,values,target)])) as MoistureMonth),waterResidualMm:w.diagnostics().totalMm-initial,externalLatentHeatJm2:0,energyResidualJm2:environment.diagnostics().energyResidualJm2,coupled:true,integratedYearS:yearS,forcingYearS:yearS,spinupYearS:yearS,referenceRadiusM:planet.radiusM,steps};
        cache.set(key,result);if(cache.size>4)cache.delete(cache.keys().next().value!);return result;
    }
    let externalLatentHeatJm2=0;
    for(let step=0;step<2*count;step++) {
        const phase=((step+.5)%count)/count,s=phase*48,a=Math.floor(s),b=(a+1)%48,blend=s-a,left=samples[a],right=samples[b];
        for(let i=0;i<grid.count;i++) {
            model.temperatureK[i]=left.air.temperatureK[i]*(1-blend)+right.air.temperatureK[i]*blend;
            model.landTemperatureK[i]=left.ground[i]*(1-blend)+right.ground[i]*blend;
            model.oceanTemperatureK[i]=left.sea[i]*(1-blend)+right.sea[i]*blend;
            model.absorbedWm2[i]=left.air.absorbedWm2[i]*(1-blend)+right.air.absorbedWm2[i]*blend;
            coupling.oceanFrozenCover[i]=model.oceanTemperatureK[i]<271.35?1:0;
            coupling.landEvaporation[i]=model.landTemperatureK[i]<273.15?0:.8;
            const melt=Math.min(w.snowKgM2[i],model.landTemperatureK[i]>273.15?dt*model.absorbedWm2[i]*f[i]/334000:0);
            w.snowKgM2[i]-=melt;w.surfaceKgM2[i]+=melt;externalLatentHeatJm2-=334000*melt/grid.count;
        }
        if(atmosphere)atmosphere.step(dt,phase*yearS);
        else {const wind=circulationWinds(grid,planet,annualOrbit,phase*yearS,f,water.windMps);w.setWinds(wind.eastMps,wind.northMps);}
        w.step(dt,model.temperatureK,model.absorbedWm2,coupling);w.routeSurface(dt);
        externalLatentHeatJm2+=(coupling.heatJm2.reduce((s,v)=>s+v,0)+coupling.landHeatJm2.reduce((s,v)=>s+v,0)+coupling.oceanHeatJm2.reduce((s,v)=>s+v,0))/grid.count;
        if(step<count)continue;
        const from=(step-count)*dt,to=from+dt;
        for(let cursor=from;cursor<to;) {
            const month=Math.min(11,Math.floor(cursor/(period/12)+1e-10)),next=Math.min(to,(month+1)*period/12),weight=(next-cursor)/(period/12),out=months[month];
            for(let i=0;i<grid.count;i++) {
                out.atmosphereKgM2[i]+=weight*w.atmosphereKgM2[i];
                out.rainMmDay[i]+=w.precipitationKgM2S[i]*DAY*weight;out.evaporationMmDay[i]+=w.evaporationKgM2S[i]*DAY*weight;
                out.soilFraction[i]+=weight*(f[i]>0?w.soilKgM2[i]/(water.soilCapacityKgM2*f[i]):0);
                out.humidityFraction[i]+=weight*Math.min(1,w.atmosphereKgM2[i]/moistureCapacity(model.temperatureK[i]));out.surfaceMm[i]+=weight*(f[i]>0?w.surfaceKgM2[i]/f[i]:0);
                out.temperatureK[i]+=weight*model.temperatureK[i];out.landTemperatureK[i]+=weight*model.landTemperatureK[i];out.oceanTemperatureK[i]+=weight*model.oceanTemperatureK[i];
                out.windEastMps[i]+=weight*w.windEastMps[i];out.windNorthMps[i]+=weight*w.windNorthMps[i];
            }
            cursor=next;
        }
    }
    for(const month of months)for(const key of ['humidityFraction','soilFraction'] as const)for(let i=0;i<grid.count;i++)month[key][i]=Math.max(0,Math.min(1,month[key][i]));
    const result:MoistureReference={months:physical?months:months.map(month=>Object.fromEntries(Object.entries(month).map(([name,values])=>[name,resampleClimateField(grid,values,target)])) as MoistureMonth),waterResidualMm:w.diagnostics().totalMm-initial,externalLatentHeatJm2,coupled:false,integratedYearS:period,forcingYearS:yearS,spinupYearS:period,referenceRadiusM:planet.radiusM,steps:2*count};
    cache.set(key,result);if(cache.size>4)cache.delete(cache.keys().next().value!);
    return result;
}
