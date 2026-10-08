import type {PlanetConfig} from './planet.ts';
import {deriveOrbit,type OrbitConfig} from './astronomy.ts';
import {DEFAULT_THERMAL,ThermalModel,makeThermalGrid,thermalCell,type ThermalCheckpoint} from './thermal.ts';
import {DEFAULT_WATER,WaterModel,type WaterCheckpoint} from './water.ts';

export interface ThermalTexture {width:number;height:number;pixels:Uint8Array;timeS:number;}
/** Synchronous ownership avoids stale worker replies. Retain the acknowledged
 * visible state across any number of updates queued before the next draw. */
export class ThermalRuntime {
    enabled=false;
    waterEnabled=false;
    waterConfig={...DEFAULT_WATER};
    water:WaterModel|null=null;
    waterTexture:ThermalTexture|null=null;
    config={...DEFAULT_THERMAL};
    model:ThermalModel|null=null;
    status='Thermal model off';
    private land:Float64Array|null=null;
    private landElevation:Float64Array|null=null;
    private key='';
    private presented:{thermal:ThermalCheckpoint;water:WaterCheckpoint|null}|null=null;
    private lastTarget=0;
    private texture:ThermalTexture|null=null;
    constructor(readonly grid=makeThermalGrid()) {}
    invalidate() {this.key='';this.model=null;this.water=null;this.presented=null;this.texture=null;this.waterTexture=null;}
    setTerrain(land:Float64Array,height=new Float64Array(this.grid.count)) {this.land=land.slice();this.landElevation=height.slice();this.invalidate();}
    get maxAdvanceS() {return this.model?32*this.model.stepS:Infinity;}
    sample(u:number,v:number) {return this.model?.temperatureK[thermalCell(this.grid,u,v)]??null;}
    sampleWater(u:number,v:number) {
        if(!this.water)return null;
        const w=this.water,k=thermalCell(this.grid,u,v),f=w.land[k];
        return {rainMmDay:86400*w.precipitationKgM2S[k],soilMm:f>0?w.soilKgM2[k]/f:null,
            surfaceMm:f>0?w.surfaceKgM2[k]/f:null,dischargeM3S:w.dischargeM3S[k],atmosphereMm:w.atmosphereKgM2[k]};
    }
    private checkpoint() {return {thermal:this.model!.checkpoint(),water:this.water?.checkpoint()??null};}
    sync(planet:PlanetConfig,orbit:OrbitConfig,timeS:number,presentedTimeS:number|null):ThermalTexture|null {
        if(!this.enabled || !this.land) {
            this.invalidate();this.status=this.enabled?'Waiting for terrain':'Thermal model off';return null;
        }
        const derived=deriveOrbit(planet,orbit);
        if(derived.solarDayS>derived.yearS/20) {
            this.invalidate();this.status='Daily mean unavailable for slow / synchronous spin (solar day > year / 20).';return null;
        }
        const key=JSON.stringify([planet,orbit,this.config,this.waterEnabled,this.waterConfig]);
        if(key!==this.key) {
            this.model=new ThermalModel(planet,orbit,this.config,this.land,timeS,this.grid);
            this.water=this.waterEnabled?new WaterModel(this.grid,planet.radiusM,this.land,
                this.landElevation!.map(e=>e*planet.reliefM),this.model.temperatureK,this.waterConfig):null;
            if(this.water)this.model.stepS=Math.min(this.model.stepS,this.water.maxStepS);
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
            }
            else {this.invalidate();return this.sync(planet,orbit,timeS,presentedTimeS);}
            this.texture=null;this.waterTexture=null;
        }
        const before=m.steps;
        if(timeS>=m.timeS+m.stepS) {
            m.advanceTo(timeS,32,(dt,t,q)=>this.water?.step(dt,t,q));
        }
        this.lastTarget=timeS;
        if(!this.texture || before!==m.steps) {
            const pixels=new Uint8Array(this.grid.count*4);
            for(let i=0;i<this.grid.count;i++) {pixels[4*i]=Math.round(Math.max(0,Math.min(1,(m.temperatureK[i]-193.15)/140))*255);pixels[4*i+3]=255;}
            this.texture={width:this.grid.width,height:this.grid.height,pixels,timeS:m.timeS};
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
        this.status=`Daily-mean model · ${this.grid.count} cells · ${(m.stepS/60).toFixed(1)} min step`;
        return this.texture;
    }
}
