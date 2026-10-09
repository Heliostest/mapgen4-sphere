import type {PlanetConfig} from './planet.ts';
import {deriveOrbit,type OrbitConfig} from './astronomy.ts';
import {DEFAULT_THERMAL,ThermalModel,makeThermalGrid,thermalCell,type ThermalCheckpoint} from './thermal.ts';
import {DEFAULT_WATER,WaterModel,type WaterCheckpoint} from './water.ts';
import {generateClimate,circulationWinds} from './climate.ts';
import {generateSurfaceReference,surfaceCover,type SurfaceReference} from './surface.ts';
import {makeSurfaceGrid,SurfaceTerrainSampler,resampleClimateField,surfaceCell,type SurfaceTerrain} from './surface-grid.ts';
import {EnvironmentModel,DEFAULT_ENVIRONMENT} from './environment.ts';
import {VegetationModel,type VegetationCheckpoint} from './vegetation.ts';
import {aggregateSurface,downscaleStore} from './surface-reservoirs.ts';
import {FUSION_J_KG} from './water.ts';
import {generateSeaIce,advanceSeaIce,seaIceCooling,seaIceFraction} from './sea-ice.ts';

export interface ThermalTexture {width:number;height:number;pixels:Uint8Array;timeS:number;}
/** Synchronous ownership avoids stale worker replies. Retain the acknowledged
 * visible state across any number of updates queued before the next draw. */
export class ThermalRuntime {
    environmentConfig={...DEFAULT_ENVIRONMENT};
    environment:EnvironmentModel|null=null;
    vegetation:VegetationModel|null=null;
    private initialSnow:Float64Array|null=null;
    private initialIce:Float64Array|null=null;
    private localSnowSeed:Float64Array|null=null;
    private localIceSeed:Float64Array|null=null;
    private localSnow:Float64Array|null=null;
    private localIce:Float64Array|null=null;
    enabled=false;
    waterEnabled=false;
    waterConfig={...DEFAULT_WATER};
    water:WaterModel|null=null;
    waterTexture:ThermalTexture|null=null;
    surfaceTexture:ThermalTexture|null=null;
    config={...DEFAULT_THERMAL};
    model:ThermalModel|null=null;
    status='Thermal model off';
    private land:Float64Array|null=null;
    private landElevation:Float64Array|null=null;
    private key='';
    private presented:{thermal:ThermalCheckpoint;water:WaterCheckpoint|null;ice:Float64Array;vegetation:VegetationCheckpoint|null}|null=null;
    private lastTarget=0;
    private texture:ThermalTexture|null=null;
    private wind:{eastMps:Float64Array;northMps:Float64Array}|null=null;
    private surfaceReference:SurfaceReference|null=null;
    private initialSoil:Float64Array|null=null;
    private readonly surfaceGrid=makeSurfaceGrid();
    private surfaceSampler:SurfaceTerrainSampler|null=null;
    private surfaceTerrain:{land:Float64Array;height:Float64Array}|null=null;
    private surfaceInitial:{temperatureK:Float64Array;soilFraction:Float64Array}|null=null;
    private initialTemperature:Float64Array|null=null;
    private surfaceTemperature:Float64Array|null=null;
    private surfaceSoil:Float64Array|null=null;
    private iceEnergy:Float64Array|null=null;
    constructor(readonly grid=makeThermalGrid()) {}
    invalidate() {this.environment=null;this.vegetation=null;this.initialSnow=this.initialIce=this.localSnowSeed=this.localIceSeed=this.localSnow=this.localIce=null;this.key='';this.model=null;this.water=null;this.presented=null;this.texture=null;this.waterTexture=null;this.wind=null;this.surfaceTexture=null;this.surfaceReference=null;this.initialSoil=null;this.initialTemperature=null;this.surfaceInitial=null;this.surfaceTemperature=null;this.surfaceSoil=null;this.iceEnergy=null;}
    setTerrain(land:Float64Array,height=new Float64Array(this.grid.count),source?:SurfaceTerrain) {
        this.land=land.slice();this.landElevation=height.slice();
        if(source) {
            if(this.surfaceSampler?.directions!==source.directions)this.surfaceSampler=new SurfaceTerrainSampler(source.directions,this.surfaceGrid);
            this.surfaceTerrain=this.surfaceSampler.sample(source.elevation);
        } else this.surfaceTerrain={land:resampleClimateField(this.grid,land,this.surfaceGrid).map(f=>Math.max(0,Math.min(1,f))),height:resampleClimateField(this.grid,height,this.surfaceGrid)};
        this.invalidate();
    }
    get maxAdvanceS() {return this.model?32*this.model.stepS:Infinity;}
    sample(u:number,v:number) {return this.model?.temperatureK[thermalCell(this.grid,u,v)]??null;}
    sampleWind(u:number,v:number){if(!this.wind)return null;const k=thermalCell(this.grid,u,v);return {eastMps:this.wind.eastMps[k],northMps:this.wind.northMps[k]};}
    sampleSurface(u:number,v:number) {return this.surfaceReference&&this.surfaceTemperature?this.surfaceAt(surfaceCell(this.surfaceGrid,u,v)):null;}
    private surfaceAt(k:number) {
        const r=this.surfaceReference!;
        const climate={meanTemperatureK:r.meanTemperatureK[k],warmestTemperatureK:r.warmestTemperatureK[k],annualRainMm:r.annualRainMm[k]};
        const base=surfaceCover(climate,this.surfaceTemperature![k],this.surfaceSoil![k]);
        if(!this.environment)return {...climate,localTemperatureK:this.surfaceTemperature![k],seaIceFraction:seaIceFraction(this.iceEnergy![k]),vegetationFraction:0,...base};
        const snow=Math.min(1,this.localSnow![k]/30),ice=Math.min(1,this.localIce![k]/(917*.5));
        const vegetation=this.vegetation!.sample(k);
        const color=vegetation.color.map((v,c)=>v*(1-snow)+[234,242,240][c]*snow);
        const localTemperatureK=Math.min(this.surfaceTemperature![k],this.surfaceTerrain!.land[k]<.5&&ice>0?271.35:snow>0?273.15:Infinity);
        return {...climate,...vegetation,localTemperatureK,seaIceFraction:ice,snowFraction:snow,color};
    }
    sampleWater(u:number,v:number) {
        if(!this.water)return null;
        const w=this.water,k=thermalCell(this.grid,u,v),f=w.land[k];
        return {rainMmDay:86400*w.precipitationKgM2S[k],soilMm:f>0?w.soilKgM2[k]/f:null,
            surfaceMm:f>0?w.surfaceKgM2[k]/f:null,dischargeM3S:w.dischargeM3S[k],atmosphereMm:w.atmosphereKgM2[k],snowMm:f>0?w.snowKgM2[k]/f:0,iceM:f<1?w.seaIceKgM2[k]/((1-f)*917):0,meltMmDay:f>0?86400*w.meltKgM2S[k]/f:0};
    }
    private checkpoint() {return {thermal:this.model!.checkpoint(),water:this.water?.checkpoint()??null,ice:this.iceEnergy!.slice(),vegetation:this.vegetation?.checkpoint()??null};}
    private localTemperature(temperature:Float64Array) {
        const delta=temperature.map((t,i)=>t-this.initialTemperature![i]);
        return resampleClimateField(this.grid,delta,this.surfaceGrid).map((d,i)=>Math.max(0,this.surfaceInitial!.temperatureK[i]+d));
    }
    private refreshEnvironment() {
        if(!this.environment||!this.vegetation)return;
        this.environment.refresh(aggregateSurface(this.grid,this.surfaceGrid,this.vegetation.cover,this.surfaceTerrain!.land));
        this.environment.ocean.step(0,this.environmentConfig.oceanStrengthMps);
    }
    surfaceState() {
        if(!this.surfaceTexture||!this.surfaceTerrain||!this.surfaceTemperature)return null;
        return {texture:this.surfaceTexture,land:this.surfaceTerrain.land,temperatureK:this.surfaceTemperature,snowMm:this.localSnow,iceKgM2:this.localIce,vegetation:this.vegetation?.cover??null};
    }
    sync(planet:PlanetConfig,orbit:OrbitConfig,timeS:number,presentedTimeS:number|null):ThermalTexture|null {
        if(!this.enabled || !this.land) {
            this.invalidate();this.status=this.enabled?'Waiting for terrain':'Thermal model off';return null;
        }
        const derived=deriveOrbit(planet,orbit);
        if(derived.solarDayS>derived.yearS/20) {
            this.invalidate();this.status='Daily mean unavailable for slow / synchronous spin (solar day > year / 20).';return null;
        }
        const key=JSON.stringify([planet,orbit,this.config,this.waterEnabled,this.waterConfig,this.environmentConfig]);
        if(key!==this.key) {
            const heights=this.landElevation!.map(e=>e*planet.reliefM);
            const reference=generateClimate(this.grid,planet,orbit,this.config,this.waterConfig,this.land,heights,timeS);
            const local=this.surfaceTerrain!,localHeights=local.height.map(e=>e*planet.reliefM);
            this.surfaceReference=generateSurfaceReference(this.surfaceGrid,planet,orbit,this.config,this.waterConfig,local.land,localHeights);
            this.surfaceInitial=generateClimate(this.surfaceGrid,planet,orbit,this.config,this.waterConfig,local.land,localHeights,timeS);
            this.iceEnergy=generateSeaIce(this.surfaceReference.monthlyIceCooling,this.surfaceGrid.count,derived.yearS,orbit.orbitPhaseRad+2*Math.PI*(timeS%derived.yearS)/derived.yearS);
            this.initialSoil=reference.soilFraction;
            this.initialTemperature=reference.temperatureK.slice();
            this.model=new ThermalModel(planet,orbit,this.config,this.land,timeS,this.grid,reference);
            this.water=this.waterEnabled?new WaterModel(this.grid,planet.radiusM,this.land,
                heights,this.model.temperatureK,this.waterConfig,reference):null;
            if(this.water) {
                const w=this.water,land=this.land!,sea=land.map(f=>1-f),localSea=local.land.map(f=>1-f);
                this.localSnowSeed=this.surfaceInitial.temperatureK.map((t,i)=>150*surfaceCover({meanTemperatureK:this.surfaceReference!.meanTemperatureK[i],warmestTemperatureK:this.surfaceReference!.warmestTemperatureK[i],annualRainMm:this.surfaceReference!.annualRainMm[i]},t,this.surfaceInitial!.soilFraction[i]).snowFraction);
                this.localIceSeed=this.iceEnergy.map(e=>e/FUSION_J_KG);
                const snow=aggregateSurface(this.grid,this.surfaceGrid,this.localSnowSeed,local.land).map((v,i)=>v*land[i]);
                const ice=aggregateSurface(this.grid,this.surfaceGrid,this.localIceSeed,localSea).map((v,i)=>v*sea[i]);
                w.seedFrozen(snow,ice);
                // Display reflects inventory limits at generation, including dry planets.
                const snowScale=resampleClimateField(this.grid,snow.map((v,i)=>v>0?w.snowKgM2[i]/v:0),this.surfaceGrid);
                const iceScale=resampleClimateField(this.grid,ice.map((v,i)=>v>0?w.seaIceKgM2[i]/v:0),this.surfaceGrid);
                this.localSnowSeed=this.localSnowSeed.map((v,i)=>v*snowScale[i]);this.localIceSeed=this.localIceSeed.map((v,i)=>v*iceScale[i]);
                this.initialSnow=w.snowKgM2.slice();this.initialIce=w.seaIceKgM2.slice();
                this.environment=new EnvironmentModel(this.model,w,this.environmentConfig);
                this.initialTemperature=this.model.temperatureK.slice();
                this.vegetation=new VegetationModel(this.surfaceReference);
                this.model.stepS=Math.min(this.model.stepS,w.maxStepS);
                this.refreshEnvironment();
            }
            this.key=key;this.presented=this.checkpoint();this.texture=null;this.waterTexture=null;this.lastTarget=timeS;
        }
        const m=this.model!;
        // The renderer can only present the latest submitted view. Several
        // DOM events may advance it before a draw; those must not replace this
        // checkpoint until that view's timestamp is acknowledged by rendering.
        if(presentedTimeS!==null && presentedTimeS>=this.lastTarget) this.presented=this.checkpoint();
        if(timeS<this.lastTarget) {
            if(this.presented && m.epochS+this.presented.thermal.steps*m.stepS<=timeS) {
                m.restore(this.presented.thermal);
                if(this.water&&this.presented.water)this.water.restore(this.presented.water);
                this.iceEnergy=this.presented.ice.slice();
                if(this.vegetation&&this.presented.vegetation)this.vegetation.restore(this.presented.vegetation);
                this.refreshEnvironment();
            }
            else {this.invalidate();return this.sync(planet,orbit,timeS,presentedTimeS);}
            this.texture=null;this.waterTexture=null;
        }
        const before=m.steps;
        if(timeS>=m.timeS+m.stepS) {
            m.advanceTo(timeS,32,(dt,t,q)=>{
                if(!this.environment) {
                    const local=this.localTemperature(t);
                    for(let i=0;i<local.length;i++)this.iceEnergy![i]=advanceSeaIce(this.iceEnergy![i],seaIceCooling(local[i],this.config.emissivity),dt);
                }
                if(this.water) {
                    const wind=circulationWinds(this.grid,planet,orbit,m.timeS+dt/2,this.land!,this.waterConfig.windMps);
                    this.water.setWinds(wind.eastMps,wind.northMps);this.environment!.step(dt);
                    if(this.environmentConfig.vegetation) {
                        const soil=resampleClimateField(this.grid,this.water.soilKgM2.map((v,i)=>this.water!.land[i]>0?v/(this.water!.land[i]*this.waterConfig.soilCapacityKgM2):0),this.surfaceGrid);
                        const rain=resampleClimateField(this.grid,this.water.precipitationKgM2S.map(v=>v*86400),this.surfaceGrid);
                        this.vegetation!.step(dt,this.localTemperature(t),rain,soil);
                    }
                    this.refreshEnvironment();
                }
            });
        }
        this.lastTarget=timeS;
        if(!this.texture || before!==m.steps) {
            const pixels=new Uint8Array(this.grid.count*4);
            this.wind=this.water?{eastMps:this.water.windEastMps,northMps:this.water.windNorthMps}:circulationWinds(this.grid,planet,orbit,m.timeS,this.land!,this.waterConfig.windMps);
            const byte=(x:number)=>Math.round(Math.max(0,Math.min(1,x))*255);
            for(let i=0;i<this.grid.count;i++) {
                pixels[4*i]=byte((m.temperatureK[i]-193.15)/140);pixels[4*i+1]=128+Math.round(1.27*this.wind.eastMps[i]);
                pixels[4*i+2]=128+Math.round(1.27*this.wind.northMps[i]);pixels[4*i+3]=255;
            }
            this.texture={width:this.grid.width,height:this.grid.height,pixels,timeS:m.timeS};
            const soilDelta=this.initialSoil!.map((initial,i)=>this.water&&this.water.land[i]>0?
                this.water.soilKgM2[i]/(this.water.land[i]*this.water.config.soilCapacityKgM2)-initial:0);
            this.surfaceTemperature=this.localTemperature(m.temperatureK);
            this.surfaceSoil=resampleClimateField(this.grid,soilDelta,this.surfaceGrid).map((d,i)=>Math.max(0,Math.min(1,this.surfaceInitial!.soilFraction[i]+d)));
            if(this.water) {
                this.localSnow=downscaleStore(this.grid,this.surfaceGrid,this.water.snowKgM2,this.initialSnow!,this.water.land,this.localSnowSeed!);
                this.localIce=downscaleStore(this.grid,this.surfaceGrid,this.water.seaIceKgM2,this.initialIce!,this.water.land.map(f=>1-f),this.localIceSeed!);
            }
            const surfacePixels=new Uint8Array(this.surfaceGrid.count*4);
            for(let i=0;i<this.surfaceGrid.count;i++) {
                const cover=this.surfaceAt(i);
                for(let c=0;c<3;c++)surfacePixels[4*i+c]=Math.round(cover.color[c]);
                surfacePixels[4*i+3]=byte(cover.seaIceFraction);
            }
            this.surfaceTexture={width:this.surfaceGrid.width,height:this.surfaceGrid.height,pixels:surfacePixels,timeS:m.timeS};
            if(this.water) {
                const w=this.water,waterPixels=new Uint8Array(this.grid.count*4);
                const byte=(x:number)=>Math.round(Math.max(0,Math.min(1,x))*255);
                for(let i=0;i<this.grid.count;i++) {
                    waterPixels[4*i]=byte(86400*w.precipitationKgM2S[i]/20);
                    waterPixels[4*i+1]=byte(w.land[i]>0?w.soilKgM2[i]/(w.land[i]*w.config.soilCapacityKgM2):0);
                    waterPixels[4*i+2]=byte(Math.log10(1+w.dischargeM3S[i])/7);
                    waterPixels[4*i+3]=byte(w.land[i]);
                }
                this.waterTexture={width:this.grid.width,height:this.grid.height,pixels:waterPixels,timeS:m.timeS};
            }
        }
        this.status=`Daily-mean model · ${m.steps===0?'Generated reference climate — no Play needed':'Evolving from generated climate'} · ${this.grid.count} cells · ${(m.stepS/60).toFixed(1)} min step`;
        return this.texture;
    }
}
