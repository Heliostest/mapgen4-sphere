import {finiteInRange} from './planet.ts';
import type {ThermalGrid} from './thermal.ts';
import type {GeneratedClimate} from './climate.ts';

export interface WaterConfig {
    evaporationFraction:number;soilCapacityKgM2:number;initialOceanDepthM:number;
    windMps:number;moistureDiffusivityM2s:number;routingSpeedMps:number;
}
export const DEFAULT_WATER:Readonly<WaterConfig>=Object.freeze({
    evaporationFraction:.5,soilCapacityKgM2:150,initialOceanDepthM:1000,
    windMps:10,moistureDiffusivityM2s:1e6,routingSpeedMps:1,
});
/** Illustrative column capacity, not a measured atmosphere or humidity profile. */
export function moistureCapacity(t:number) {return 20*Math.exp(.06*(Math.max(250,Math.min(330,t))-288.15));}
const DAY=86400,WATER_DENSITY=1000;
export const VAPORIZATION_J_KG=2.45e6,FUSION_J_KG=334000;
export interface WaterCoupling {heatJm2:Float64Array;landEvaporation:Float64Array;iceCover:Float64Array;}
export interface WaterCheckpoint {
    atmosphereKgM2:Float64Array;soilKgM2:Float64Array;surfaceKgM2:Float64Array;
    precipitationKgM2S:Float64Array;evaporationKgM2S:Float64Array;dischargeM3S:Float64Array;
    snowKgM2:Float64Array;seaIceKgM2:Float64Array;meltKgM2S:Float64Array;
    oceanGlobalKgM2:number;elapsedS:number;
    windEastMps:Float64Array;windNorthMps:Float64Array;
}

/** Conservative water reservoirs. All columns are per WHOLE cell area. Ocean storage is
 * per global area, so each local transfer contributes 1/N to that reservoir. */
export class WaterModel {
    readonly atmosphereKgM2:Float64Array;
    readonly soilKgM2:Float64Array;
    readonly surfaceKgM2:Float64Array;
    readonly precipitationKgM2S:Float64Array;
    readonly evaporationKgM2S:Float64Array;
    readonly dischargeM3S:Float64Array;
    readonly snowKgM2:Float64Array;
    readonly seaIceKgM2:Float64Array;
    readonly meltKgM2S:Float64Array;
    readonly cellAreaM2:number;
    readonly maxStepS:number;
    readonly land:Float64Array;
    readonly heightM:Float64Array;
    readonly config:WaterConfig;
    readonly windEastMps:Float64Array;
    readonly windNorthMps:Float64Array;
    readonly initialTotalMm:number;
    oceanGlobalKgM2=0;
    elapsedS=0;
    private readonly delta:Float64Array;
    private readonly oceanDemand:Float64Array;
    private readonly airRates:Float64Array;
    private readonly windRates:Float64Array;
    private readonly windFactors:Float64Array;
    private readonly neighbors:{cell:number;distanceM:number}[][];
    constructor(readonly grid:ThermalGrid,readonly radiusM:number,land:ArrayLike<number>,heightM:ArrayLike<number>,initialTemperatureK:ArrayLike<number>,config:WaterConfig,reference?:GeneratedClimate,initialTotalMm?:number) {
        finiteInRange(radiusM,'water radius',1);
        finiteInRange(config.evaporationFraction,'evaporation fraction',0,1);
        finiteInRange(config.soilCapacityKgM2,'soil capacity',1,1000);
        finiteInRange(config.initialOceanDepthM,'initial ocean depth',0,10000);
        finiteInRange(config.windMps,'zonal wind',-100,100);
        finiteInRange(config.moistureDiffusivityM2s,'moisture mixing',0,1e7);
        finiteInRange(config.routingSpeedMps,'surface routing speed',.01,10);
        if([land,heightM,initialTemperatureK].some(a=>a.length!==grid.count))throw new RangeError('Water grid mismatch');
        this.land=Float64Array.from(land,f=>{finiteInRange(f,'water land fraction',0,1);return f;});
        this.heightM=Float64Array.from(heightM,h=>{finiteInRange(h,'land altitude',0,1e6);return h;});
        this.config={...config};this.cellAreaM2=grid.solidAngle*radiusM**2;
        this.atmosphereKgM2=Float64Array.from(initialTemperatureK,t=>{finiteInRange(t,'water temperature',0);return .5*moistureCapacity(t);});
        this.soilKgM2=Float64Array.from(land,f=>f*config.soilCapacityKgM2*.5);
        this.surfaceKgM2=new Float64Array(grid.count);
        this.snowKgM2=new Float64Array(grid.count);this.seaIceKgM2=new Float64Array(grid.count);this.meltKgM2S=new Float64Array(grid.count);
        this.precipitationKgM2S=new Float64Array(grid.count);this.evaporationKgM2S=new Float64Array(grid.count);this.dischargeM3S=new Float64Array(grid.count);
        this.oceanGlobalKgM2=config.initialOceanDepthM*WATER_DENSITY*(1-this.land.reduce((a,b)=>a+b,0)/grid.count);
        this.delta=new Float64Array(grid.count);this.oceanDemand=new Float64Array(grid.count);
        const outgoing=new Float64Array(grid.count),dl=2*Math.PI/grid.width;
        this.airRates=Float64Array.from(grid.edges,e=>config.moistureDiffusivityM2s/radiusM**2*e.geometry/grid.solidAngle);
        const dx=2/grid.height;
        this.windFactors=Float64Array.from(grid.edges,e=>{
            const row=Math.floor(e.a/grid.width);
            return Math.floor(e.b/grid.width)===row?1/(radiusM*Math.sqrt(1-grid.sinLat[row]**2)*dl):
                -Math.sqrt(Math.max(0,1-(1-(row+1)*dx)**2))/(radiusM*dx);
        });
        this.windRates=new Float64Array(grid.edges.length);
        this.windEastMps=new Float64Array(grid.count);this.windNorthMps=new Float64Array(grid.count);
        this.setWinds(reference?.windEastMps??new Float64Array(grid.count).fill(config.windMps),reference?.windNorthMps??new Float64Array(grid.count));
        const xyz=Array.from({length:grid.count},(_,i)=>{
            const y=grid.sinLat[Math.floor(i/grid.width)],lon=((i%grid.width+.5)/grid.width-.5)*2*Math.PI,r=Math.sqrt(1-y*y);
            return [r*Math.sin(lon),y,r*Math.cos(lon)];
        });
        this.neighbors=Array.from({length:grid.count},()=>[]);
        let shortest=Infinity;
        grid.edges.forEach((e,k)=>{
            outgoing[e.a]+=this.airRates[k];outgoing[e.b]+=this.airRates[k];
            // Bound both possible donors, independent of future wind direction.
            const windLimit=Math.abs(config.windMps*this.windFactors[k]);outgoing[e.a]+=windLimit;outgoing[e.b]+=windLimit;
            const dot=xyz[e.a].reduce((sum,v,i)=>sum+v*xyz[e.b][i],0),distanceM=radiusM*Math.acos(Math.max(-1,Math.min(1,dot)));
            this.neighbors[e.a].push({cell:e.b,distanceM});this.neighbors[e.b].push({cell:e.a,distanceM});shortest=Math.min(shortest,distanceM);
        });
        let maxRate=0;
        for(let i=0;i<grid.count;i++)maxRate=Math.max(maxRate,outgoing[i]);
        this.maxStepS=Math.min(maxRate>0?.45/maxRate:Infinity,.45*shortest/config.routingSpeedMps,21600);
        if(reference) {
            const fields=['humidityFraction','soilFraction','surfaceMm','rainMmDay','evaporationMmDay'] as const;
            for(const key of fields) {
                if(reference[key].length!==grid.count)throw new RangeError('Water reference size mismatch');
                for(const v of reference[key])finiteInRange(v,key,0,key.endsWith('Fraction')?1:1e6);
            }
            for(let i=0;i<grid.count;i++) {
                this.atmosphereKgM2[i]=reference.humidityFraction[i]*moistureCapacity(initialTemperatureK[i]);
                this.soilKgM2[i]=land[i]*config.soilCapacityKgM2*reference.soilFraction[i];
                this.surfaceKgM2[i]=land[i]*reference.surfaceMm[i];
                this.precipitationKgM2S[i]=reference.rainMmDay[i]/DAY;this.evaporationKgM2S[i]=reference.evaporationMmDay[i]/DAY;
            }
            // Diagnose routing from generated stores without transferring water
            // or claiming elapsed simulation time. These are initial estimates.
            this.diagnoseRouting();
        }
        this.initialTotalMm=initialTotalMm??this.total();
    }
    diagnoseRouting() {
        const surface=this.surfaceKgM2.slice(),ocean=this.oceanGlobalKgM2;
        this.routeSurface(this.maxStepS);this.surfaceKgM2.set(surface);this.oceanGlobalKgM2=ocean;
    }
    setWinds(east:ArrayLike<number>,north:ArrayLike<number>) {
        if(east.length!==this.grid.count||north.length!==this.grid.count)throw new RangeError('Wind field size mismatch');
        const limit=Math.abs(this.config.windMps)+1e-9;
        for(let i=0;i<this.grid.count;i++){finiteInRange(east[i],'east wind',-limit,limit);finiteInRange(north[i],'north wind',-limit,limit);}
        this.windEastMps.set(east);this.windNorthMps.set(north);
        this.grid.edges.forEach((e,k)=>{
            const wind=this.windFactors[k]>0?east:north;
            this.windRates[k]=.5*(wind[e.a]+wind[e.b])*this.windFactors[k];
        });
    }
    private total() {
        return this.oceanGlobalKgM2+this.atmosphereKgM2.reduce((sum,v,i)=>sum+v+this.soilKgM2[i]+this.surfaceKgM2[i]+this.snowKgM2[i]+this.seaIceKgM2[i],0)/this.grid.count;
    }
    /** Allocate generated ice from real stores, with no elapsed time or new water. */
    seedFrozen(snow:ArrayLike<number>,ice:ArrayLike<number>) {
        const n=this.grid.count;let demand=0;
        const deficit=new Float64Array(n);
        for(let i=0;i<n;i++) {
            // Limit each donor separately: (soil + surface) - surface can
            // round above soil, leaving a negative store when it is exhausted.
            const top=Math.min(snow[i],this.surfaceKgM2[i]);
            const soil=Math.min(Math.max(0,snow[i]-top),this.soilKgM2[i]),amount=top+soil;
            this.surfaceKgM2[i]-=top;this.soilKgM2[i]-=soil;
            this.snowKgM2[i]+=amount;deficit[i]=Math.max(0,snow[i]-amount);
            demand+=(deficit[i]+ice[i])/n;
        }
        const fraction=demand>0?Math.min(1,this.oceanGlobalKgM2/demand):0;
        this.oceanGlobalKgM2-=demand*fraction;
        for(let i=0;i<n;i++) {this.snowKgM2[i]+=deficit[i]*fraction;this.seaIceKgM2[i]+=ice[i]*fraction;}
        this.diagnoseRouting();
    }
    step(dt:number,temperatureK:ArrayLike<number>,absorbedWm2:ArrayLike<number>,coupling?:WaterCoupling) {
        finiteInRange(dt,'water time step',Number.MIN_VALUE,this.maxStepS*(1+1e-10));
        if(temperatureK.length!==this.grid.count||absorbedWm2.length!==this.grid.count)throw new RangeError('Water forcing grid mismatch');
        const n=this.grid.count,{config,land}=this;
        let oceanRequest=0;
        for(let i=0;i<n;i++) {
            const t=temperatureK[i],q=absorbedWm2[i];
            finiteInRange(t,'water temperature',0);finiteInRange(q,'absorbed sunlight',0);
            const liquid=Math.max(0,Math.min(1,(t-273.15)/5));
            const deficit=Math.max(0,1-this.atmosphereKgM2[i]/moistureCapacity(t));
            const demand=dt*config.evaporationFraction*q/VAPORIZATION_J_KG*liquid*deficit;
            const landDemand=demand*land[i]*(coupling?.landEvaporation[i]??1);
            const surface=Math.min(this.surfaceKgM2[i],landDemand);
            const soil=Math.min(this.soilKgM2[i],landDemand-surface);
            this.surfaceKgM2[i]-=surface;this.soilKgM2[i]-=soil;
            this.atmosphereKgM2[i]+=surface+soil;this.evaporationKgM2S[i]=(surface+soil)/dt;
            this.oceanDemand[i]=demand*(1-land[i])*(1-(coupling?.iceCover[i]??0));oceanRequest+=this.oceanDemand[i]/n;
        }
        const fraction=oceanRequest>0?Math.min(1,this.oceanGlobalKgM2/oceanRequest):0;
        this.oceanGlobalKgM2=Math.max(0,this.oceanGlobalKgM2-oceanRequest*fraction);
        for(let i=0;i<n;i++) {const amount=this.oceanDemand[i]*fraction;this.atmosphereKgM2[i]+=amount;this.evaporationKgM2S[i]+=amount/dt;}

        // Simultaneous donor-cell advection and pairwise diffusion. The combined
        // outgoing-rate bound guarantees positivity without hiding a loss in clamps.
        this.delta.fill(0);
        this.grid.edges.forEach((e,k)=>{
            const q=dt*this.airRates[k]*(this.atmosphereKgM2[e.b]-this.atmosphereKgM2[e.a]);
            this.delta[e.a]+=q;this.delta[e.b]-=q;
            const rate=this.windRates[k],from=rate>=0?e.a:e.b,to=rate>=0?e.b:e.a;
            const amount=dt*Math.abs(rate)*this.atmosphereKgM2[from];this.delta[from]-=amount;this.delta[to]+=amount;
        });
        const rainFraction=-Math.expm1(-dt/21600),drainFraction=-Math.expm1(-dt/(3*DAY));
        for(let i=0;i<n;i++) {
            this.atmosphereKgM2[i]+=this.delta[i];
            const rain=Math.max(0,this.atmosphereKgM2[i]-moistureCapacity(temperatureK[i]))*rainFraction;
            this.atmosphereKgM2[i]-=rain;this.precipitationKgM2S[i]=rain/dt;
            this.oceanGlobalKgM2+=rain*(1-land[i])/n;
            const snow=coupling&&temperatureK[i]<273.15?rain*land[i]:0;
            this.snowKgM2[i]+=snow;
            if(coupling)coupling.heatJm2[i]=VAPORIZATION_J_KG*(rain-this.evaporationKgM2S[i]*dt)+FUSION_J_KG*snow;
            const liquidRain=rain*land[i]-snow;
            const capacity=config.soilCapacityKgM2*land[i],infiltration=Math.min(liquidRain,capacity-this.soilKgM2[i]);
            this.soilKgM2[i]+=infiltration;this.surfaceKgM2[i]+=liquidRain-infiltration;
            const drainage=Math.max(0,this.soilKgM2[i]-.7*capacity)*drainFraction;
            this.soilKgM2[i]-=drainage;this.surfaceKgM2[i]+=drainage;
        }
        if(!coupling)this.routeSurface(dt);this.elapsedS+=dt;
    }
    /** Reservoir routing, not a shallow-water solver. A basin has no forced
     * outlet; its stored head must exceed a neighboring saddle before spilling. */
    routeSurface(dt:number) {
        const n=this.grid.count;this.delta.fill(0);this.dischargeM3S.fill(0);
        const head=(i:number)=>this.land[i]>0?this.heightM[i]+this.surfaceKgM2[i]/(WATER_DENSITY*this.land[i]):0;
        for(let i=0;i<n;i++) {
            if(this.surfaceKgM2[i]<=0||this.land[i]===0)continue;
            const sourceHead=head(i);
            let target=-1,best=sourceHead,distance=Math.sqrt(this.cellAreaM2),outletFraction=1;
            // A fractional coastal cell also contains a local sea-level outlet.
            if(this.land[i]<1 && sourceHead>0){target=-2;best=0;outletFraction=1-this.land[i];}
            for(const neighbor of this.neighbors[i]) {
                const f=this.land[neighbor.cell],h=head(neighbor.cell);
                if(f>0&&h<best){best=h;target=neighbor.cell;distance=neighbor.distanceM;outletFraction=f;}
                // Coast contains separate land and ocean destinations. Sending
                // a sea-level transfer into its elevated land would lift water.
                if(f<1&&0<best){best=0;target=-2;distance=neighbor.distanceM;outletFraction=1-f;}
            }
            if(target===-1)continue;
            const inverseStorage=1/(WATER_DENSITY*this.land[i])+(target>=0?1/(WATER_DENSITY*this.land[target]):0);
            const available=Math.min(this.surfaceKgM2[i],(sourceHead-best)/inverseStorage);
            const amount=available*(-Math.expm1(-dt*this.config.routingSpeedMps/distance))*outletFraction;
            this.delta[i]-=amount;
            if(target===-2)this.oceanGlobalKgM2+=amount/n;
            else this.delta[target]+=amount;
            this.dischargeM3S[i]=amount*this.cellAreaM2/WATER_DENSITY/dt;
        }
        for(let i=0;i<n;i++)this.surfaceKgM2[i]+=this.delta[i];
    }
    checkpoint():WaterCheckpoint {
        return {atmosphereKgM2:this.atmosphereKgM2.slice(),soilKgM2:this.soilKgM2.slice(),surfaceKgM2:this.surfaceKgM2.slice(),
            precipitationKgM2S:this.precipitationKgM2S.slice(),evaporationKgM2S:this.evaporationKgM2S.slice(),dischargeM3S:this.dischargeM3S.slice(),
            snowKgM2:this.snowKgM2.slice(),seaIceKgM2:this.seaIceKgM2.slice(),meltKgM2S:this.meltKgM2S.slice(),
            oceanGlobalKgM2:this.oceanGlobalKgM2,elapsedS:this.elapsedS,windEastMps:this.windEastMps.slice(),windNorthMps:this.windNorthMps.slice()};
    }
    restore(state:WaterCheckpoint) {
        for(const key of ['atmosphereKgM2','soilKgM2','surfaceKgM2','precipitationKgM2S','evaporationKgM2S','dischargeM3S','snowKgM2','seaIceKgM2','meltKgM2S'] as const)this[key].set(state[key]);
        this.oceanGlobalKgM2=state.oceanGlobalKgM2;this.elapsedS=state.elapsedS;
        this.setWinds(state.windEastMps,state.windNorthMps);
    }
    diagnostics() {
        const mean=(a:Float64Array)=>a.reduce((sum,v)=>sum+v,0)/this.grid.count,totalMm=this.total();
        return {snowMm:mean(this.snowKgM2),iceMm:mean(this.seaIceKgM2),meltMmDay:DAY*mean(this.meltKgM2S),totalMm,residualMm:totalMm-this.initialTotalMm,atmosphereMm:mean(this.atmosphereKgM2),soilMm:mean(this.soilKgM2),surfaceMm:mean(this.surfaceKgM2),oceanMm:this.oceanGlobalKgM2,
            rainMmDay:DAY*mean(this.precipitationKgM2S),evaporationMmDay:DAY*mean(this.evaporationKgM2S),maxDischargeM3S:Math.max(...this.dischargeM3S)};
    }
}
