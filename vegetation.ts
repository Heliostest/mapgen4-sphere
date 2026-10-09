import {BIOMES,classifyBiome,type Biome,type SurfaceReference} from './surface.ts';
const YEAR=365.2425*86400,clamp=(v:number)=>Math.max(0,Math.min(1,v));
const types=Object.keys(BIOMES) as Biome[];
export type VegetationCheckpoint={meanK:Float64Array;rainMm:Float64Array;cover:Float64Array;weights:Float64Array};
export class VegetationModel {
    readonly meanK:Float64Array;readonly rainMm:Float64Array;readonly cover:Float64Array;readonly weights:Float64Array;
    constructor(readonly reference:SurfaceReference) {
        this.meanK=reference.meanTemperatureK.slice();this.rainMm=reference.annualRainMm.slice();
        this.cover=new Float64Array(this.meanK.length);this.weights=new Float64Array(this.meanK.length*types.length);
        for(let i=0;i<this.meanK.length;i++) {
            const biome=classifyBiome(this.meanK[i],reference.warmestTemperatureK[i],this.rainMm[i]);
            this.weights[i*types.length+types.indexOf(biome)]=1;this.cover[i]=this.suitability(i);
        }
    }
    private suitability(i:number) {
        const warm=this.reference.warmestTemperatureK[i]+this.meanK[i]-this.reference.meanTemperatureK[i];
        return clamp((warm-268.15)/15)*clamp((323.15-this.meanK[i])/15)*clamp(this.rainMm[i]/800);
    }
    step(dt:number,temperature:ArrayLike<number>,rainMmDay:ArrayLike<number>,soil:ArrayLike<number>) {
        const climate=-Math.expm1(-dt/YEAR),composition=-Math.expm1(-dt/(5*YEAR));
        for(let i=0;i<this.meanK.length;i++) {
            this.meanK[i]+=(temperature[i]-this.meanK[i])*climate;
            this.rainMm[i]+=(rainMmDay[i]*365.2425-this.rainMm[i])*climate;
            const target=this.suitability(i)*(.35+.65*clamp(soil[i]/.5));
            this.cover[i]+=(target-this.cover[i])*(-Math.expm1(-dt/((target<this.cover[i]?.5:3)*YEAR)));
            const warm=this.reference.warmestTemperatureK[i]+this.meanK[i]-this.reference.meanTemperatureK[i];
            const targetBiome=types.indexOf(classifyBiome(this.meanK[i],warm,this.rainMm[i]));
            for(let b=0;b<types.length;b++)this.weights[i*types.length+b]+=((b===targetBiome?1:0)-this.weights[i*types.length+b])*composition;
        }
    }
    sample(i:number) {
        const color=[0,0,0];let best=0;
        for(let b=0;b<types.length;b++) {
            if(this.weights[i*types.length+b]>this.weights[i*types.length+best])best=b;
            const rgb=BIOMES[types[b]==='ice'?'barren':types[b]].color;
            for(let c=0;c<3;c++)color[c]+=rgb[c]*this.weights[i*types.length+b];
        }
        const bare=BIOMES.barren.color,greenness=.4+.6*this.cover[i];
        return {biome:types[best],vegetationFraction:this.cover[i],color:color.map((c,j)=>c*greenness+bare[j]*(1-greenness))};
    }
    checkpoint():VegetationCheckpoint {return {meanK:this.meanK.slice(),rainMm:this.rainMm.slice(),cover:this.cover.slice(),weights:this.weights.slice()};}
    restore(s:VegetationCheckpoint){this.meanK.set(s.meanK);this.rainMm.set(s.rainMm);this.cover.set(s.cover);this.weights.set(s.weights);}
}
