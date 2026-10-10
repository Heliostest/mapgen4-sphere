import type {ThermalModel} from './thermal.ts';
import {FUSION_J_KG as LF,VAPORIZATION_J_KG as LV,type WaterModel} from './water.ts';
import {OceanTransport,type OceanCheckpoint} from './ocean.ts';
import {AtmosphericCirculation,type AtmosphereCheckpoint} from './circulation.ts';
import {derivePlanet} from './planet.ts';
export const SEA_FREEZE_K=271.35,SNOW_MELT_K=273.15;
export const DEFAULT_ENVIRONMENT:Readonly<EnvironmentConfig>=Object.freeze({oceanStrengthMps:.3,vegetation:true,iceAlbedo:true,terrainWater:false,glaciers:false,dynamicCirculation:false});
export type EnvironmentConfig={oceanStrengthMps:number;vegetation:boolean;iceAlbedo:boolean;terrainWater?:boolean;glaciers?:boolean;dynamicCirculation?:boolean};
export interface EnvironmentCheckpoint {atmosphere:AtmosphereCheckpoint;ocean:OceanCheckpoint;}
const clamp=(x:number)=>Math.max(0,Math.min(1,x));

/** Total enthalpy is the sum of sensible reservoirs + Lv*vapor - Lf*ice.
 * Sensible heat of moving rain/runoff is omitted. */
export class EnvironmentModel {
    readonly ocean:OceanTransport;
    readonly atmosphere:AtmosphericCirculation|null;
    readonly iceCover:Float64Array;readonly snowCover:Float64Array;readonly landEvaporation:Float64Array;
    readonly glacierCover:Float64Array;
    readonly shelfLandCover:Float64Array;readonly shelfSeaCover:Float64Array;readonly oceanFrozenCover:Float64Array;
    readonly heatJm2:Float64Array;
    readonly landHeatJm2:Float64Array;readonly oceanHeatJm2:Float64Array;
    get landTemperatureK() {return this.thermal.config.separateReservoirs?this.thermal.landTemperatureK:undefined;}
    get oceanTemperatureK() {return this.thermal.config.separateReservoirs?this.thermal.oceanTemperatureK:undefined;}
    readonly vegetation:Float64Array;
    readonly initialEnthalpy:number;
    constructor(readonly thermal:ThermalModel,readonly water:WaterModel,readonly config:EnvironmentConfig,initialEnthalpy?:number) {
        const n=thermal.grid.count;this.ocean=new OceanTransport(thermal,water,!!config.dynamicCirculation);
        this.atmosphere=config.dynamicCirculation?new AtmosphericCirculation(thermal,water):null;
        if(config.glaciers)water.attachGlacier(derivePlanet(thermal.planet).gravityMps2);
        this.iceCover=new Float64Array(n);this.snowCover=new Float64Array(n);this.landEvaporation=new Float64Array(n).fill(1);this.heatJm2=new Float64Array(n);this.vegetation=new Float64Array(n).fill(.5);
        this.glacierCover=new Float64Array(n);
        this.shelfLandCover=new Float64Array(n);this.shelfSeaCover=new Float64Array(n);this.oceanFrozenCover=new Float64Array(n);
        this.landHeatJm2=new Float64Array(n);this.oceanHeatJm2=new Float64Array(n);
        // Generated ice is an initial condition. Set a consistent column rather
        // than spending its complete winter reserve to correct an ice-free seed.
        for(let i=0;i<n;i++) {
            if(thermal.config.separateReservoirs) {
                const landLimit=water.snowKgM2[i]>0||water.landIceKgM2[i]>0||water.shelfLandIceKgM2[i]>0?SNOW_MELT_K:Infinity;
                const seaLimit=water.seaIceKgM2[i]>0?SEA_FREEZE_K:water.shelfSeaIceKgM2[i]>0?SNOW_MELT_K:Infinity;
                this.landHeatJm2[i]=Math.min(0,landLimit-thermal.landTemperatureK[i])*thermal.landCapacity[i];
                const delta=water.seaIceKgM2[i]>0&&water.oceanGlobalKgM2>0?seaLimit-thermal.oceanTemperatureK[i]:Math.min(0,seaLimit-thermal.oceanTemperatureK[i]);
                this.oceanHeatJm2[i]=delta*thermal.oceanCapacity[i];continue;
            }
            const limit=water.seaIceKgM2[i]>0?SEA_FREEZE_K:water.snowKgM2[i]>0||water.landIceKgM2[i]>0||water.shelfLandIceKgM2[i]>0||water.shelfSeaIceKgM2[i]>0?SNOW_MELT_K:Infinity;
            const delta=water.seaIceKgM2[i]>0&&water.oceanGlobalKgM2>0?limit-thermal.temperatureK[i]:Math.min(0,limit-thermal.temperatureK[i]);
            this.heatJm2[i]=delta*thermal.capacity[i];
        }
        if(initialEnthalpy===undefined) {
            if(thermal.config.separateReservoirs){thermal.applyLandHeat(this.landHeatJm2);thermal.applyOceanHeat(this.oceanHeatJm2);}
            else thermal.applyHeat(this.heatJm2);
        }
        this.initialEnthalpy=initialEnthalpy??this.enthalpy();this.refresh();this.ocean.step(0,config.oceanStrengthMps);
    }
    checkpoint():EnvironmentCheckpoint|null {return this.atmosphere?{atmosphere:this.atmosphere.checkpoint(),ocean:this.ocean.checkpoint()!}:null;}
    restore(s:EnvironmentCheckpoint|null) {
        if(!!s!==!!this.atmosphere)throw new Error('Mismatched circulation state');
        if(s){this.atmosphere!.restore(s.atmosphere);this.ocean.restore(s.ocean,this.config.oceanStrengthMps);}
        this.ocean.step(0,this.config.oceanStrengthMps);
    }
    enthalpy() {
        const w=this.water;let sum=0,correction=0;
        for(let i=0;i<w.grid.count;i++) {
            const increment=(LV*w.atmosphereKgM2[i]-LF*(w.snowKgM2[i]+w.seaIceKgM2[i]+w.landIceKgM2[i]+w.shelfLandIceKgM2[i]+w.shelfSeaIceKgM2[i]))/w.grid.count-correction,total=sum+increment;
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
            this.shelfLandCover[i]=f>0?clamp(w.shelfLandIceKgM2[i]/(f*917*5)):0;
            this.shelfSeaCover[i]=f<1?clamp(w.shelfSeaIceKgM2[i]/((1-f)*917*5)):0;
            this.oceanFrozenCover[i]=Math.max(this.iceCover[i],this.shelfSeaCover[i]);
            const landFrozen=Math.max(this.snowCover[i],this.glacierCover[i],this.shelfLandCover[i]),frozen=f*landFrozen+(1-f)*this.oceanFrozenCover[i];
            const base=clamp(m.orbit.bondAlbedo+(this.config.vegetation?f*.06*(.5-v):0));
            m.albedo[i]=this.config.iceAlbedo?base+(Math.max(base,.65)-base)*frozen:base;
            this.landEvaporation[i]=this.config.vegetation?(.6+.4*v)*(1-landFrozen):1-landFrozen;
        }
    }
    /** Project available sensible heat into phase changes, conserving enthalpy. */
    phase(dt:number) {
        if(this.thermal.config.separateReservoirs){this.phaseSeparated(dt);return;}
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
            for(const shelf of [w.shelfLandIceKgM2,w.shelfSeaIceKgM2]) {
                const melt=Math.min(shelf[i],Math.max(0,(t-SNOW_MELT_K)*c/LF));
                shelf[i]-=melt;w.oceanGlobalKgM2+=melt/n;t-=melt*LF/c;this.heatJm2[i]-=melt*LF;
            }
            const ice=Math.min(w.seaIceKgM2[i],Math.max(0,(t-SEA_FREEZE_K)*c/LF));
            w.seaIceKgM2[i]-=ice;w.oceanGlobalKgM2+=ice/n;
            t-=ice*LF/c;this.heatJm2[i]-=ice*LF;
            // Mixed cells share one temperature; limit freezing by their wet area.
            freeze[i]=Math.max(0,(SEA_FREEZE_K-t)*c/LF)*(1-w.land[i]-w.inlandWaterFraction[i]);freezeRequest+=freeze[i]/n;
        }
        const fraction=freezeRequest>0?Math.min(1,w.oceanGlobalKgM2/freezeRequest):0;
        w.oceanGlobalKgM2-=freezeRequest*fraction;
        for(let i=0;i<n;i++){const amount=freeze[i]*fraction;w.seaIceKgM2[i]+=amount;this.heatJm2[i]+=amount*LF;}
        m.applyHeat(this.heatJm2);
    }
    private phaseSeparated(dt:number) {
        const m=this.thermal,w=this.water,n=w.grid.count;
        this.heatJm2.fill(0);this.landHeatJm2.fill(0);this.oceanHeatJm2.fill(0);
        const freeze=new Float64Array(n);let freezeRequest=0;
        for(let i=0;i<n;i++) {
            const lc=m.landCapacity[i],oc=m.oceanCapacity[i];let lt=m.landTemperatureK[i],ot=m.oceanTemperatureK[i];
            if(lc>0) {
                const snow=Math.min(w.snowKgM2[i],Math.max(0,(lt-SNOW_MELT_K)*lc/LF));
                w.snowKgM2[i]-=snow;w.surfaceKgM2[i]+=snow;w.meltKgM2S[i]+=snow/dt;lt-=snow*LF/lc;this.landHeatJm2[i]-=snow*LF;
                const glacier=Math.min(w.landIceKgM2[i],Math.max(0,(lt-SNOW_MELT_K)*lc/LF));
                w.addLandIce(i,-glacier);w.surfaceKgM2[i]+=glacier;w.meltKgM2S[i]+=glacier/dt;lt-=glacier*LF/lc;this.landHeatJm2[i]-=glacier*LF;
                const shelf=Math.min(w.shelfLandIceKgM2[i],Math.max(0,(lt-SNOW_MELT_K)*lc/LF));
                w.shelfLandIceKgM2[i]-=shelf;w.oceanGlobalKgM2+=shelf/n;this.landHeatJm2[i]-=shelf*LF;
            }
            if(oc>0) {
                const shelf=Math.min(w.shelfSeaIceKgM2[i],Math.max(0,(ot-SNOW_MELT_K)*oc/LF));
                w.shelfSeaIceKgM2[i]-=shelf;w.oceanGlobalKgM2+=shelf/n;ot-=shelf*LF/oc;this.oceanHeatJm2[i]-=shelf*LF;
                const ice=Math.min(w.seaIceKgM2[i],Math.max(0,(ot-SEA_FREEZE_K)*oc/LF));
                w.seaIceKgM2[i]-=ice;w.oceanGlobalKgM2+=ice/n;ot-=ice*LF/oc;this.oceanHeatJm2[i]-=ice*LF;
                // oc already contains wet fraction: applying it again would
                // leave a coastal ocean colder than its freezing boundary.
                const wet=1-w.land[i],open=wet>0?(wet-w.inlandWaterFraction[i])/wet:0;
                freeze[i]=Math.max(0,(SEA_FREEZE_K-ot)*oc/LF)*open;freezeRequest+=freeze[i]/n;
            }
        }
        const fraction=freezeRequest>0?Math.min(1,w.oceanGlobalKgM2/freezeRequest):0;
        w.oceanGlobalKgM2-=freezeRequest*fraction;
        for(let i=0;i<n;i++){const amount=freeze[i]*fraction;w.seaIceKgM2[i]+=amount;this.oceanHeatJm2[i]+=amount*LF;}
        m.applyLandHeat(this.landHeatJm2);m.applyOceanHeat(this.oceanHeatJm2);
    }
    step(dt:number) {
        const m=this.thermal,w=this.water;
        w.meltKgM2S.fill(0);this.ocean.step(dt,this.config.oceanStrengthMps);this.phase(dt);this.refresh();
        w.step(dt,m.temperatureK,m.absorbedWm2,this);m.applyHeat(this.heatJm2);
        if(m.config.separateReservoirs){m.applyLandHeat(this.landHeatJm2);m.applyOceanHeat(this.oceanHeatJm2);}
        this.phase(dt);w.glacier?.step(dt,m.landTemperatureK);w.routeSurface(dt);
    }
    diagnostics() {
        const m=this.thermal,w=this.water,n=w.grid.count;let land=0,wet=0,ice=0,snow=0,albedo=0,current=0;
        for(let i=0;i<n;i++){land+=w.land[i];wet+=1-w.land[i];snow+=w.land[i]*this.snowCover[i];ice+=(1-w.land[i])*this.iceCover[i];albedo+=m.albedo[i];current=Math.max(current,Math.hypot(this.ocean.eastMps[i],this.ocean.northMps[i]));}
        return {energyResidualJm2:this.enthalpy()-this.initialEnthalpy-m.radiationJm2,iceFraction:wet?ice/wet:0,snowFraction:land?snow/land:0,albedo:albedo/n,maxCurrentMps:current};
    }
}
