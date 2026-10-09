import type {ThermalModel} from './thermal.ts';
import {FUSION_J_KG as LF,VAPORIZATION_J_KG as LV,type WaterModel} from './water.ts';
import {OceanTransport} from './ocean.ts';
import {derivePlanet} from './planet.ts';
export const SEA_FREEZE_K=271.35,SNOW_MELT_K=273.15;
export const DEFAULT_ENVIRONMENT:Readonly<EnvironmentConfig>=Object.freeze({oceanStrengthMps:.3,vegetation:true,iceAlbedo:true,terrainWater:false,glaciers:false});
export type EnvironmentConfig={oceanStrengthMps:number;vegetation:boolean;iceAlbedo:boolean;terrainWater?:boolean;glaciers?:boolean};
const clamp=(x:number)=>Math.max(0,Math.min(1,x));

/** One mixed thermal column per cell. Total enthalpy is C*T + Lv*vapor - Lf*ice.
 * Sensible heat of moving water and separate land/ocean temperatures are omitted. */
export class EnvironmentModel {
    readonly ocean:OceanTransport;
    readonly iceCover:Float64Array;readonly snowCover:Float64Array;readonly landEvaporation:Float64Array;
    readonly glacierCover:Float64Array;
    readonly heatJm2:Float64Array;
    readonly vegetation:Float64Array;
    readonly initialEnthalpy:number;
    constructor(readonly thermal:ThermalModel,readonly water:WaterModel,readonly config:EnvironmentConfig,initialEnthalpy?:number) {
        const n=thermal.grid.count;this.ocean=new OceanTransport(thermal,water);
        if(config.glaciers)water.attachGlacier(derivePlanet(thermal.planet).gravityMps2);
        this.iceCover=new Float64Array(n);this.snowCover=new Float64Array(n);this.landEvaporation=new Float64Array(n).fill(1);this.heatJm2=new Float64Array(n);this.vegetation=new Float64Array(n).fill(.5);
        this.glacierCover=new Float64Array(n);
        // Generated ice is an initial condition. Set a consistent column rather
        // than spending its complete winter reserve to correct an ice-free seed.
        for(let i=0;i<n;i++) {
            const limit=water.seaIceKgM2[i]>0?SEA_FREEZE_K:water.snowKgM2[i]>0||water.landIceKgM2[i]>0?SNOW_MELT_K:Infinity;
            const delta=water.seaIceKgM2[i]>0&&water.oceanGlobalKgM2>0?limit-thermal.temperatureK[i]:Math.min(0,limit-thermal.temperatureK[i]);
            this.heatJm2[i]=delta*thermal.capacity[i];
        }
        if(initialEnthalpy===undefined)thermal.applyHeat(this.heatJm2);
        this.initialEnthalpy=initialEnthalpy??this.enthalpy();this.refresh();this.ocean.step(0,config.oceanStrengthMps);
    }
    enthalpy() {
        const w=this.water;let sum=0,correction=0;
        for(let i=0;i<w.grid.count;i++) {
            const increment=(LV*w.atmosphereKgM2[i]-LF*(w.snowKgM2[i]+w.seaIceKgM2[i]+w.landIceKgM2[i]))/w.grid.count-correction,total=sum+increment;
            correction=(total-sum)-increment;sum=total;
        }
        return this.thermal.energy()+sum;
    }
    refresh(vegetation?:ArrayLike<number>) {
        const m=this.thermal,w=this.water;
        if(vegetation)this.vegetation.set(vegetation);
        for(let i=0;i<w.grid.count;i++) {
            const f=w.land[i],v=this.vegetation[i];
            this.iceCover[i]=f<1?clamp(w.seaIceKgM2[i]/((1-f)*917*.5)):0;
            this.snowCover[i]=f>0?clamp(w.snowKgM2[i]/(f*30)):0;
            this.glacierCover[i]=f>0?clamp(w.landIceKgM2[i]/(f*917*5)):0;
            const landFrozen=Math.max(this.snowCover[i],this.glacierCover[i]),frozen=f*landFrozen+(1-f)*this.iceCover[i];
            const base=clamp(m.orbit.bondAlbedo+(this.config.vegetation?f*.06*(.5-v):0));
            m.albedo[i]=this.config.iceAlbedo?base+(Math.max(base,.65)-base)*frozen:base;
            this.landEvaporation[i]=this.config.vegetation?(.6+.4*v)*(1-landFrozen):1-landFrozen;
        }
    }
    /** Project available sensible heat into phase changes, conserving enthalpy. */
    phase(dt:number) {
        const m=this.thermal,w=this.water,n=w.grid.count;this.heatJm2.fill(0);
        let freezeRequest=0;const freeze=new Float64Array(n);
        for(let i=0;i<n;i++) {
            const c=m.capacity[i];let t=m.temperatureK[i];
            const snow=Math.min(w.snowKgM2[i],Math.max(0,(t-SNOW_MELT_K)*c/LF));
            w.snowKgM2[i]-=snow;w.surfaceKgM2[i]+=snow;w.meltKgM2S[i]+=snow/dt;
            t-=snow*LF/c;this.heatJm2[i]-=snow*LF;
            const glacier=Math.min(w.landIceKgM2[i],Math.max(0,(t-SNOW_MELT_K)*c/LF));
            w.addLandIce(i,-glacier);w.surfaceKgM2[i]+=glacier;w.meltKgM2S[i]+=glacier/dt;
            t-=glacier*LF/c;this.heatJm2[i]-=glacier*LF;
            const ice=Math.min(w.seaIceKgM2[i],Math.max(0,(t-SEA_FREEZE_K)*c/LF));
            w.seaIceKgM2[i]-=ice;w.oceanGlobalKgM2+=ice/n;
            t-=ice*LF/c;this.heatJm2[i]-=ice*LF;
            // Mixed cells share one temperature; limit freezing by their wet area.
            freeze[i]=Math.max(0,(SEA_FREEZE_K-t)*c/LF)*(1-w.land[i]);freezeRequest+=freeze[i]/n;
        }
        const fraction=freezeRequest>0?Math.min(1,w.oceanGlobalKgM2/freezeRequest):0;
        w.oceanGlobalKgM2-=freezeRequest*fraction;
        for(let i=0;i<n;i++){const amount=freeze[i]*fraction;w.seaIceKgM2[i]+=amount;this.heatJm2[i]+=amount*LF;}
        m.applyHeat(this.heatJm2);
    }
    step(dt:number) {
        const m=this.thermal,w=this.water;
        w.meltKgM2S.fill(0);this.ocean.step(dt,this.config.oceanStrengthMps);this.phase(dt);this.refresh();
        w.step(dt,m.temperatureK,m.absorbedWm2,this);m.applyHeat(this.heatJm2);
        this.phase(dt);w.glacier?.step(dt,m.temperatureK);w.routeSurface(dt);
    }
    diagnostics() {
        const m=this.thermal,w=this.water,n=w.grid.count;let land=0,wet=0,ice=0,snow=0,albedo=0,current=0;
        for(let i=0;i<n;i++){land+=w.land[i];wet+=1-w.land[i];snow+=w.land[i]*this.snowCover[i];ice+=(1-w.land[i])*this.iceCover[i];albedo+=m.albedo[i];current=Math.max(current,Math.hypot(this.ocean.eastMps[i],this.ocean.northMps[i]));}
        return {energyResidualJm2:this.enthalpy()-this.initialEnthalpy-m.radiationJm2,iceFraction:wet?ice/wet:0,snowFraction:land?snow/land:0,albedo:albedo/n,maxCurrentMps:current};
    }
}
