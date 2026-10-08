import type {PlanetConfig} from './planet.ts';
import {deriveOrbit,type OrbitConfig} from './astronomy.ts';
import {DEFAULT_THERMAL,ThermalModel,makeThermalGrid,thermalCell,type ThermalCheckpoint} from './thermal.ts';

export interface ThermalTexture {width:number;height:number;pixels:Uint8Array;timeS:number;}
/** Synchronous ownership avoids stale worker replies. Retain the acknowledged
 * visible state across any number of updates queued before the next draw. */
export class ThermalRuntime {
    enabled=false;
    config={...DEFAULT_THERMAL};
    model:ThermalModel|null=null;
    status='Thermal model off';
    private land:Float64Array|null=null;
    private key='';
    private presented:ThermalCheckpoint|null=null;
    private lastTarget=0;
    private texture:ThermalTexture|null=null;
    constructor(readonly grid=makeThermalGrid()) {}
    invalidate() {this.key='';this.model=null;this.presented=null;this.texture=null;}
    setTerrain(land:Float64Array) {this.land=land.slice();this.invalidate();}
    get maxAdvanceS() {return this.model?32*this.model.stepS:Infinity;}
    sample(u:number,v:number) {return this.model?.temperatureK[thermalCell(this.grid,u,v)]??null;}
    sync(planet:PlanetConfig,orbit:OrbitConfig,timeS:number,presentedTimeS:number|null):ThermalTexture|null {
        if(!this.enabled || !this.land) {
            this.invalidate();this.status=this.enabled?'Waiting for terrain':'Thermal model off';return null;
        }
        const derived=deriveOrbit(planet,orbit);
        if(derived.solarDayS>derived.yearS/20) {
            this.invalidate();this.status='Daily mean unavailable for slow / synchronous spin (solar day > year / 20).';return null;
        }
        const key=JSON.stringify([planet,orbit,this.config]);
        if(key!==this.key) {
            this.model=new ThermalModel(planet,orbit,this.config,this.land,timeS,this.grid);
            this.key=key;this.presented=this.model.checkpoint();this.texture=null;this.lastTarget=timeS;
        }
        const m=this.model!;
        // The renderer can only present the latest submitted view. Several
        // DOM events may advance it before a draw; those must not replace this
        // checkpoint until that view's timestamp is acknowledged by rendering.
        if(presentedTimeS!==null && presentedTimeS>=this.lastTarget) this.presented=m.checkpoint();
        if(timeS<this.lastTarget) {
            if(this.presented && m.epochS+this.presented.steps*m.stepS<=timeS) m.restore(this.presented);
            else {this.invalidate();return this.sync(planet,orbit,timeS,presentedTimeS);}
            this.texture=null;
        }
        const before=m.steps;
        if(timeS>=m.timeS+m.stepS) {
            m.advanceTo(timeS);
        }
        this.lastTarget=timeS;
        if(!this.texture || before!==m.steps) {
            const pixels=new Uint8Array(this.grid.count*4);
            for(let i=0;i<this.grid.count;i++) {pixels[4*i]=Math.round(Math.max(0,Math.min(1,(m.temperatureK[i]-193.15)/140))*255);pixels[4*i+3]=255;}
            this.texture={width:this.grid.width,height:this.grid.height,pixels,timeS:m.timeS};
        }
        this.status=`Daily-mean model · ${this.grid.count} cells · ${(m.stepS/60).toFixed(1)} min step`;
        return this.texture;
    }
}
