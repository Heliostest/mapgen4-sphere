import {finiteInRange} from './planet.ts';
import type {ThermalGrid} from './thermal.ts';
import type {GeneratedClimate} from './climate.ts';
import {TerrainWater,type TerrainWaterCheckpoint,type RoutingNetwork} from './terrain-water.ts';
import {GlacierModel,type GlacierCheckpoint} from './glacier.ts';

export interface WaterConfig {
    /** Missing in old saves: retain their saturation-only closure and winds. */
    moistureScheme?:'transport';
    /** Ice cover, rather than a freshwater-temperature ramp, gates marine liquid. */
    liquidOceanEvaporation?:boolean;
    /** Opt-in compensated accumulation for many sub-ulp ocean transfers. */
    compensatedOceanTransfers?:boolean;
    /** Experimental split between tracer mixing and mechanically lifted flow. */
    upliftScheme?:'advective'|'eddy-front';
    consistentLiftTemperature?:boolean;
    buoyantConvection?:boolean;
    /** Cold coherent inflow lifts only its displaced warm resident fraction. */
    coldFrontDisplacement?:boolean;
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
export interface WaterCoupling {heatJm2:Float64Array;landEvaporation:Float64Array;iceCover:Float64Array;landTemperatureK?:Float64Array;oceanTemperatureK?:Float64Array;landHeatJm2?:Float64Array;oceanHeatJm2?:Float64Array;oceanFrozenCover?:Float64Array;surfaceAlbedo?:{land:ArrayLike<number>;ocean:ArrayLike<number>;mean:ArrayLike<number>};}
export interface WaterCheckpoint {
    snowfallKgM2S:Float64Array|null;
    /** Optional in transport saves; old coarse rain was uniform, while old
     * refined saves may have an unrecoverable land/sea diagnostic split. */
    landPrecipitationKgM2S?:Float64Array;
    atmosphereKgM2:Float64Array;soilKgM2:Float64Array;surfaceKgM2:Float64Array;
    precipitationKgM2S:Float64Array;evaporationKgM2S:Float64Array;dischargeM3S:Float64Array;
    snowKgM2:Float64Array;seaIceKgM2:Float64Array;meltKgM2S:Float64Array;
    oceanGlobalKgM2:number;oceanCorrection?:number;elapsedS:number;
    windEastMps:Float64Array;windNorthMps:Float64Array;
    routing:TerrainWaterCheckpoint|null;
    landIceKgM2:Float64Array;landIceCorrection:Float64Array;glacier:GlacierCheckpoint|null;
    shelfLandIceKgM2:Float64Array;shelfSeaIceKgM2:Float64Array;
}

/** Conservative water reservoirs. All columns are per WHOLE cell area. Ocean storage is
 * per global area, so each local transfer contributes 1/N to that reservoir. */
export class WaterModel {
    surfaceSolver:{evaporate(k:number,dt:number,potential:number,deficit:number):{landEvap:number;lakeEvap:number;oceanDemand:number};oceanEvaporate(k:number,amount:number):void;precipitate(k:number,rain:number,dt:number,landRain?:number):number}|null=null;
    snowfallKgM2S:Float64Array|null=null;
    glacier:GlacierModel|null=null;
    glacierBedM:Float64Array|null=null;
    private pendingGlacier:GlacierCheckpoint|null=null;
    attachGlacier(gravityMps2:number) {this.glacier=new GlacierModel(this,gravityMps2,this.glacierBedM);if(this.pendingGlacier){this.glacier.restore(this.pendingGlacier);this.pendingGlacier=null;}}
    routing:TerrainWater|null=null;
    /** Derived from confirmed inland bathymetry, never an additional store. */
    readonly inlandWaterFraction:Float64Array;
    private pendingRouting:TerrainWaterCheckpoint|null=null;
    attachRouting(network:RoutingNetwork) {
        this.inlandWaterFraction.fill(0);
        for(let t=0;t<network.cell.length;t++)if(network.cell[t]>=0&&(network.inlandLakeId?.[t]??0)>0)this.inlandWaterFraction[network.cell[t]]+=network.areaM2[t]/this.cellAreaM2;
        for(let k=0;k<this.grid.count;k++)this.inlandWaterFraction[k]=Math.min(1-this.land[k],this.inlandWaterFraction[k]);
        this.routing=new TerrainWater(network,this);
        if(this.pendingRouting){this.routing.restore(this.pendingRouting,this);this.pendingRouting=null;}
        else this.routing.route(this,this.maxStepS,this.config.routingSpeedMps,true);
    }
    readonly atmosphereKgM2:Float64Array;
    readonly soilKgM2:Float64Array;
    readonly surfaceKgM2:Float64Array;
    readonly precipitationKgM2S:Float64Array;
    /** Deposited land/ocean amounts per WHOLE cell area. Initial estimates and
     * old coarse saves are uniform. Check landPrecipitationKnown for old refined saves. */
    readonly landPrecipitationKgM2S:Float64Array;
    readonly oceanPrecipitationKgM2S:Float64Array;
    /** Old refined remapping did not retain the recorded land/sea split.
     * A bounded estimate must never be serialized or labeled as an actual rate. */
    landPrecipitationKnown=true;
    readonly evaporationKgM2S:Float64Array;
    /** Actual net vapor exchange during the latest step; not a persisted store. */
    readonly vaporTransportKgM2:Float64Array;
    /** Signed a-to-b vapor transport at each face during the actual step,
     * before recipient condensation and after windward rainout. */
    readonly faceVaporTransportKgM2:Float64Array;
    /** Unsaved signed face flux attribution; their sum is the actual face flux. */
    readonly faceAdvectiveVaporKgM2:Float64Array;
    readonly faceDiffusiveVaporKgM2:Float64Array;
    /** Actual step precipitation by mechanism. Lift shares partition the
     * incremental column rain; these diagnostics are not additional stocks. */
    readonly precipitationComponents:{saturation:Float64Array;convection:Float64Array;front:Float64Array;convergence:Float64Array;orographic:Float64Array};
    readonly landPrecipitationComponents:WaterModel['precipitationComponents'];
    /** Unsaved causal attribution of intercepted finite parcels. */
    readonly transportRain:{orographicAdvection:Float64Array;orographicDiffusion:Float64Array;frontAdvection:Float64Array;frontDiffusion:Float64Array;coldFrontAdvection:Float64Array};
    precipitationComponentsValid=false;
    readonly dischargeM3S:Float64Array;
    readonly snowKgM2:Float64Array;
    readonly landIceKgM2:Float64Array;
    /** Floating freshwater ice; the DEM mask selects its thermal surface only. */
    readonly shelfLandIceKgM2:Float64Array;
    readonly shelfSeaIceKgM2:Float64Array;
    readonly landIceCorrection:Float64Array;
    addLandIce(i:number,amount:number) {
        if(amount===-this.landIceKgM2[i]){this.landIceKgM2[i]=0;this.landIceCorrection[i]=0;return;}
        const increment=amount-this.landIceCorrection[i],total=this.landIceKgM2[i]+increment;
        this.landIceCorrection[i]=(total-this.landIceKgM2[i])-increment;this.landIceKgM2[i]=total;
    }
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
    oceanCorrection=0;
    /** A real signed reservoir transfer; compensation retains roundoff only. */
    addOceanWater(amount:number) {
        if(!this.config.compensatedOceanTransfers){this.oceanGlobalKgM2+=amount;return;}
        if(!Number.isFinite(amount))throw new RangeError('Invalid ocean transfer');
        if(amount<=-this.oceanGlobalKgM2){
            if(amount<-this.oceanGlobalKgM2-4*Number.EPSILON*Math.max(1,this.oceanGlobalKgM2))throw new RangeError('Ocean transfer exceeds finite inventory');
            this.oceanGlobalKgM2=0;this.oceanCorrection=0;return;
        }
        const increment=amount-this.oceanCorrection,total=this.oceanGlobalKgM2+increment;
        this.oceanCorrection=(total-this.oceanGlobalKgM2)-increment;this.oceanGlobalKgM2=total;
    }
    elapsedS=0;
    private readonly delta:Float64Array;
    private readonly oceanDemand:Float64Array;
    private readonly airRates:Float64Array;
    private readonly windRates:Float64Array;
    private readonly windFactors:Float64Array;
    private readonly convergence:Float64Array;
    private readonly upslope:Float64Array;
    private readonly edgeDistanceM:Float64Array;
    private readonly neighbors:{cell:number;distanceM:number}[][];
    constructor(readonly grid:ThermalGrid,readonly radiusM:number,land:ArrayLike<number>,heightM:ArrayLike<number>,initialTemperatureK:ArrayLike<number>,config:WaterConfig,reference?:GeneratedClimate,initialTotalMm?:number) {
        finiteInRange(radiusM,'water radius',1);
        finiteInRange(config.evaporationFraction,'evaporation fraction',0,1);
        finiteInRange(config.soilCapacityKgM2,'soil capacity',1,1000);
        finiteInRange(config.initialOceanDepthM,'initial ocean depth',0,10000);
        finiteInRange(config.windMps,'zonal wind',-100,100);
        finiteInRange(config.moistureDiffusivityM2s,'moisture mixing',0,1e7);
        finiteInRange(config.routingSpeedMps,'surface routing speed',.01,10);
        if(config.compensatedOceanTransfers!==undefined&&typeof config.compensatedOceanTransfers!=='boolean')throw new RangeError('Invalid ocean accumulation switch');
        if(config.upliftScheme!==undefined&&!['advective','eddy-front'].includes(config.upliftScheme))throw new RangeError('Invalid uplift scheme');
        for(const key of ['consistentLiftTemperature','buoyantConvection','coldFrontDisplacement'] as const)if(config[key]!==undefined&&typeof config[key]!=='boolean')throw new RangeError('Invalid lift switch');
        if([land,heightM,initialTemperatureK].some(a=>a.length!==grid.count))throw new RangeError('Water grid mismatch');
        this.land=Float64Array.from(land,f=>{finiteInRange(f,'water land fraction',0,1);return f;});
        this.heightM=Float64Array.from(heightM,h=>{finiteInRange(h,'land altitude',0,1e6);return h;});
        this.config={...config};this.cellAreaM2=grid.solidAngle*radiusM**2;
        this.inlandWaterFraction=new Float64Array(grid.count);
        this.atmosphereKgM2=Float64Array.from(initialTemperatureK,t=>{finiteInRange(t,'water temperature',0);return .5*moistureCapacity(t);});
        this.soilKgM2=Float64Array.from(land,f=>f*config.soilCapacityKgM2*.5);
        this.surfaceKgM2=new Float64Array(grid.count);
        this.snowKgM2=new Float64Array(grid.count);this.landIceKgM2=new Float64Array(grid.count);this.seaIceKgM2=new Float64Array(grid.count);this.meltKgM2S=new Float64Array(grid.count);
        this.landIceCorrection=new Float64Array(grid.count);
        this.shelfLandIceKgM2=new Float64Array(grid.count);this.shelfSeaIceKgM2=new Float64Array(grid.count);
        this.precipitationKgM2S=new Float64Array(grid.count);this.evaporationKgM2S=new Float64Array(grid.count);this.dischargeM3S=new Float64Array(grid.count);
        this.vaporTransportKgM2=new Float64Array(grid.count);
        this.faceVaporTransportKgM2=new Float64Array(grid.edges.length);
        this.faceAdvectiveVaporKgM2=new Float64Array(grid.edges.length);this.faceDiffusiveVaporKgM2=new Float64Array(grid.edges.length);
        this.landPrecipitationKgM2S=new Float64Array(grid.count);this.oceanPrecipitationKgM2S=new Float64Array(grid.count);
        this.precipitationComponents={saturation:new Float64Array(grid.count),convection:new Float64Array(grid.count),front:new Float64Array(grid.count),convergence:new Float64Array(grid.count),orographic:new Float64Array(grid.count)};
        this.landPrecipitationComponents={saturation:new Float64Array(grid.count),convection:new Float64Array(grid.count),front:new Float64Array(grid.count),convergence:new Float64Array(grid.count),orographic:new Float64Array(grid.count)};
        this.transportRain={orographicAdvection:new Float64Array(grid.count),orographicDiffusion:new Float64Array(grid.count),frontAdvection:new Float64Array(grid.count),frontDiffusion:new Float64Array(grid.count),coldFrontAdvection:new Float64Array(grid.count)};
        this.oceanGlobalKgM2=config.initialOceanDepthM*WATER_DENSITY*(1-this.land.reduce((a,b)=>a+b,0)/grid.count);
        this.delta=new Float64Array(grid.count);this.oceanDemand=new Float64Array(grid.count);
        this.convergence=new Float64Array(grid.count);this.upslope=new Float64Array(grid.count);
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
        this.edgeDistanceM=new Float64Array(grid.edges.length);
        let shortest=Infinity;
        grid.edges.forEach((e,k)=>{
            const mixingBound=this.airRates[k]*(config.moistureScheme==='transport'?10:1);
            outgoing[e.a]+=mixingBound;outgoing[e.b]+=mixingBound;
            // Bound both possible donors, independent of future wind direction.
            const windLimit=Math.abs(config.windMps*this.windFactors[k]);outgoing[e.a]+=windLimit;outgoing[e.b]+=windLimit;
            const dot=xyz[e.a].reduce((sum,v,i)=>sum+v*xyz[e.b][i],0),distanceM=radiusM*Math.acos(Math.max(-1,Math.min(1,dot)));
            this.edgeDistanceM[k]=distanceM;
            this.neighbors[e.a].push({cell:e.b,distanceM});this.neighbors[e.b].push({cell:e.a,distanceM});shortest=Math.min(shortest,distanceM);
        });
        let maxRate=0;
        for(let i=0;i<grid.count;i++)maxRate=Math.max(maxRate,outgoing[i]);
        this.maxStepS=Math.min(config.moistureScheme==='transport'?Infinity:maxRate>0?.45/maxRate:Infinity,.45*shortest/config.routingSpeedMps,21600);
        if(reference) {
            if(reference.atmosphereKgM2&&reference.atmosphereKgM2.length!==grid.count)throw new RangeError('Water reference vapor size mismatch');
            const fields=['humidityFraction','soilFraction','surfaceMm','rainMmDay','evaporationMmDay'] as const;
            for(const key of fields) {
                if(reference[key].length!==grid.count)throw new RangeError('Water reference size mismatch');
                for(const v of reference[key])finiteInRange(v,key,0,key.endsWith('Fraction')?1:1e6);
            }
            for(let i=0;i<grid.count;i++) {
                const column=reference.atmosphereKgM2?.[i]??reference.humidityFraction[i]*moistureCapacity(initialTemperatureK[i]);
                finiteInRange(column,'reference vapor',0,1e6);this.atmosphereKgM2[i]=column;
                this.soilKgM2[i]=land[i]*config.soilCapacityKgM2*reference.soilFraction[i];
                this.surfaceKgM2[i]=land[i]*reference.surfaceMm[i];
                this.precipitationKgM2S[i]=reference.rainMmDay[i]/DAY;this.evaporationKgM2S[i]=reference.evaporationMmDay[i]/DAY;
            }
            // Diagnose routing from generated stores without transferring water
            // or claiming elapsed simulation time. These are initial estimates.
            this.diagnoseRouting();
        }
        if(config.moistureScheme==='transport') {
            // Seed all liquid stores from the same finite ocean inventory.
            // Legacy worlds retain their historical initialization accounting.
            const demand=(this.atmosphereKgM2.reduce((s,v)=>s+v,0)+this.soilKgM2.reduce((s,v)=>s+v,0)+this.surfaceKgM2.reduce((s,v)=>s+v,0))/grid.count;
            const fraction=demand>0?Math.min(1,this.oceanGlobalKgM2/demand):0;
            for(const store of [this.atmosphereKgM2,this.soilKgM2,this.surfaceKgM2])for(let i=0;i<grid.count;i++)store[i]*=fraction;
            this.oceanGlobalKgM2=Math.max(0,this.oceanGlobalKgM2-demand*fraction);
        }
        for(let i=0;i<grid.count;i++){this.landPrecipitationKgM2S[i]=this.precipitationKgM2S[i]*this.land[i];this.oceanPrecipitationKgM2S[i]=this.precipitationKgM2S[i]-this.landPrecipitationKgM2S[i];}
        this.initialTotalMm=initialTotalMm??this.total();
    }
    diagnoseRouting() {
        if(this.routing){this.routing.route(this,this.maxStepS,this.config.routingSpeedMps,true);return;}
        const surface=this.surfaceKgM2.slice(),ocean=this.oceanGlobalKgM2,correction=this.oceanCorrection;
        this.routeSurface(this.maxStepS);this.surfaceKgM2.set(surface);this.oceanGlobalKgM2=ocean;this.oceanCorrection=correction;
    }
    setWinds(east:ArrayLike<number>,north:ArrayLike<number>) {
        if(east.length!==this.grid.count||north.length!==this.grid.count)throw new RangeError('Wind field size mismatch');
        const limit=Math.abs(this.config.windMps)+1e-9;
        for(let i=0;i<this.grid.count;i++){finiteInRange(east[i],'east wind',-limit,limit);finiteInRange(north[i],'north wind',-limit,limit);}
        this.windEastMps.set(east);this.windNorthMps.set(north);
        this.convergence.fill(0);this.upslope.fill(0);
        this.grid.edges.forEach((e,k)=>{
            const wind=this.windFactors[k]>0?east:north;
            this.windRates[k]=.5*(wind[e.a]+wind[e.b])*this.windFactors[k];
            const rate=this.windRates[k],from=rate>=0?e.a:e.b,to=rate>=0?e.b:e.a;
            this.convergence[e.a]-=rate;this.convergence[e.b]+=rate;
            this.upslope[to]+=Math.abs(rate)*Math.max(0,this.heightM[to]-this.heightM[from]);
        });
    }
    private total() {
        return this.oceanGlobalKgM2+this.atmosphereKgM2.reduce((sum,v,i)=>sum+v+this.soilKgM2[i]+this.surfaceKgM2[i]+this.snowKgM2[i]+this.seaIceKgM2[i]+this.landIceKgM2[i]+this.shelfLandIceKgM2[i]+this.shelfSeaIceKgM2[i],0)/this.grid.count;
    }
    seedShelves(landRequest:ArrayLike<number>,seaRequest:ArrayLike<number>) {
        const n=this.grid.count;if(landRequest.length!==n||seaRequest.length!==n)throw new RangeError('Ice shelf grid mismatch');
        let demand=0;
        for(let i=0;i<n;i++) {
            finiteInRange(landRequest[i],'initial land-mask shelf ice',0);finiteInRange(seaRequest[i],'initial sea-mask shelf ice',0);
            if((landRequest[i]>0&&this.land[i]===0)||(seaRequest[i]>0&&this.land[i]===1))throw new RangeError('Ice shelf requires its thermal surface');
            demand+=(landRequest[i]+seaRequest[i])/n;
        }
        const fraction=demand>0?Math.min(1,this.oceanGlobalKgM2/demand):0;
        // Multiplying the exhausted donor's ratio can round one ulp above
        // the available mass. Keep that finite donor nonnegative.
        if(this.config.compensatedOceanTransfers)this.addOceanWater(-Math.min(this.oceanGlobalKgM2,demand*fraction));
        else this.oceanGlobalKgM2=Math.max(0,this.oceanGlobalKgM2-demand*fraction);
        for(let i=0;i<n;i++){this.shelfLandIceKgM2[i]+=landRequest[i]*fraction;this.shelfSeaIceKgM2[i]+=seaRequest[i]*fraction;}
    }
    seedLandIce(request:ArrayLike<number>) {
        const n=this.grid.count,remaining=new Float64Array(n);let demand=0;
        for(let i=0;i<n;i++) {
            let left=this.land[i]>0?request[i]:0;finiteInRange(left,'initial land ice',0);
            for(const store of [this.snowKgM2,this.surfaceKgM2,this.soilKgM2]){const amount=Math.min(left,store[i]);store[i]-=amount;this.addLandIce(i,amount);left-=amount;}
            remaining[i]=left;demand+=left/n;
        }
        const fraction=demand>0?Math.min(1,this.oceanGlobalKgM2/demand):0;this.addOceanWater(-demand*fraction);
        for(let i=0;i<n;i++)this.addLandIce(i,remaining[i]*fraction);
        this.diagnoseRouting();
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
        this.addOceanWater(-demand*fraction);
        for(let i=0;i<n;i++) {this.snowKgM2[i]+=deficit[i]*fraction;this.seaIceKgM2[i]+=ice[i]*fraction;}
        this.diagnoseRouting();
    }
    step(dt:number,temperatureK:ArrayLike<number>,absorbedWm2:ArrayLike<number>,coupling?:WaterCoupling) {
        if(this.pendingRouting)throw new Error('Attach restored terrain before advancing water');
        if(this.pendingGlacier)throw new Error('Attach restored glacier before advancing water');
        finiteInRange(dt,'water time step',Number.MIN_VALUE,this.maxStepS*(1+1e-10));
        if(temperatureK.length!==this.grid.count||absorbedWm2.length!==this.grid.count)throw new RangeError('Water forcing grid mismatch');
        const n=this.grid.count,{config,land}=this;
        this.precipitationComponentsValid=false;
        for(const a of Object.values(this.precipitationComponents))a.fill(0);
        for(const a of Object.values(this.transportRain))a.fill(0);
        const split=!!(coupling?.landTemperatureK&&coupling?.oceanTemperatureK);
        this.snowfallKgM2S??=new Float64Array(n);
        let oceanRequest=0;
        coupling?.landHeatJm2?.fill(0);coupling?.oceanHeatJm2?.fill(0);
        for(let i=0;i<n;i++) {
            const t=temperatureK[i],q=absorbedWm2[i];
            finiteInRange(t,'water temperature',0);finiteInRange(q,'absorbed sunlight',0);
            const landT=coupling?.landTemperatureK?.[i]??t,oceanT=coupling?.oceanTemperatureK?.[i]??t;
            finiteInRange(landT,'land evaporation temperature',0);finiteInRange(oceanT,'ocean evaporation temperature',0);
            const landLiquid=Math.max(0,Math.min(1,(landT-273.15)/5)),oceanLiquid=config.liquidOceanEvaporation?1:Math.max(0,Math.min(1,(oceanT-273.15)/5));
            const deficit=Math.max(0,1-this.atmosphereKgM2[i]/moistureCapacity(t));
            const potential=dt*config.evaporationFraction*q/VAPORIZATION_J_KG;
            if(this.surfaceSolver) {
                const e=this.surfaceSolver.evaporate(i,dt,potential,deficit);
                this.atmosphereKgM2[i]+=e.landEvap+e.lakeEvap;this.evaporationKgM2S[i]=(e.landEvap+e.lakeEvap)/dt;
                this.oceanDemand[i]=e.oceanDemand;oceanRequest+=e.oceanDemand/n;continue;
            }
            const landDeficit=config.moistureScheme==='transport'&&split?Math.max(0,1-this.atmosphereKgM2[i]/moistureCapacity(landT)):deficit;
            const oceanDeficit=config.moistureScheme==='transport'&&split?Math.max(0,1-this.atmosphereKgM2[i]/moistureCapacity(oceanT)):deficit;
            const alb=coupling?.surfaceAlbedo,landPotential=alb&&alb.mean[i]<1?potential*(1-alb.land[i])/(1-alb.mean[i]):potential,oceanPotential=alb&&alb.mean[i]<1?potential*(1-alb.ocean[i])/(1-alb.mean[i]):potential;
            const landDemand=landPotential*landDeficit*landLiquid*land[i]*(coupling?.landEvaporation[i]??1);
            const lakeDemand=oceanPotential*oceanDeficit*Math.max(0,Math.min(1,(oceanT-273.15)/5))*this.inlandWaterFraction[i];
            const surface=Math.min(this.surfaceKgM2[i],landDemand+lakeDemand),lakeEvap=Math.min(surface,lakeDemand);
            const soil=Math.min(this.soilKgM2[i],Math.max(0,landDemand-(surface-lakeEvap)));
            this.surfaceKgM2[i]-=surface;this.soilKgM2[i]-=soil;
            this.atmosphereKgM2[i]+=surface+soil;this.evaporationKgM2S[i]=(surface+soil)/dt;
            if(split&&coupling?.landHeatJm2&&coupling.oceanHeatJm2){coupling.landHeatJm2[i]=-VAPORIZATION_J_KG*(surface-lakeEvap+soil);coupling.oceanHeatJm2[i]=-VAPORIZATION_J_KG*lakeEvap;}
            this.oceanDemand[i]=oceanPotential*oceanDeficit*oceanLiquid*(1-land[i]-this.inlandWaterFraction[i])*(1-(coupling?.oceanFrozenCover?.[i]??coupling?.iceCover[i]??0));oceanRequest+=this.oceanDemand[i]/n;
        }
        const fraction=oceanRequest>0?Math.min(1,this.oceanGlobalKgM2/oceanRequest):0;
        if(this.config.compensatedOceanTransfers)this.addOceanWater(-Math.min(this.oceanGlobalKgM2,oceanRequest*fraction));
        else this.oceanGlobalKgM2=Math.max(0,this.oceanGlobalKgM2-oceanRequest*fraction);
        for(let i=0;i<n;i++) {
            const amount=this.oceanDemand[i]*fraction;this.atmosphereKgM2[i]+=amount;this.evaporationKgM2S[i]+=amount/dt;
            if(this.surfaceSolver){this.surfaceSolver.oceanEvaporate(i,amount);continue;}
            if(split&&coupling?.oceanHeatJm2)coupling.oceanHeatJm2[i]-=VAPORIZATION_J_KG*amount;
        }

        // Conservative pair exchanges in transport mode; the legacy simultaneous
        // update retains its outgoing-rate stability bound.
        this.delta.fill(0);
        this.faceVaporTransportKgM2.fill(0);
        this.faceAdvectiveVaporKgM2.fill(0);this.faceDiffusiveVaporKgM2.fill(0);
        this.vaporTransportKgM2.set(this.atmosphereKgM2);
        const scales=this.heightM.map((h,i)=>{
            if(!config.consistentLiftTemperature)return Math.max(.55,Math.exp(-.0065*h*land[i]/288.15));
            const scale=Math.max(.55,Math.exp(-.0065*h/288.15));
            return (land[i]/scale**4+1-land[i])**(-.25);
        });
        const commonTemperature=Float64Array.from(temperatureK,(t,i)=>t/scales[i]);
        const eddyFactor=(a:number,b:number,lat:number)=>1+9*Math.min(1,Math.abs(commonTemperature[b]-commonTemperature[a])/8)*Math.max(0,(lat-.25)/.75);
        const orographicRain=new Float64Array(n),frontalRain=new Float64Array(n);
        if(config.moistureScheme==='transport') {
            // Positive exact diffusion and upwind parcel transfers. Reverse
            // operator order on the return sweep. Rainout intercepts an uphill
            // donor parcel before its remaining vapor reaches the plateau.
            const transferParcel=(k:number,from:number,to:number,amount:number,vapor=this.atmosphereKgM2[from],diffusive=false)=>{
                const ascent=diffusive&&config.upliftScheme?0:Math.max(0,this.heightM[to]-this.heightM[from]);
                const uphillT=temperatureK[from]-.0065*ascent;
                const orographicFraction=ascent>0&&vapor>0?land[to]*Math.max(0,1-moistureCapacity(uphillT)/vapor):0;
                // Remove terrain lapse before identifying a front, and require
                // actual warm-to-cold travel. Condense only the exchanged
                // parcel, never repeatedly lift a whole resident cold column.
                const cooling=Math.max(0,Math.min(temperatureK[from]-temperatureK[to],commonTemperature[from]-commonTemperature[to]));
                // A stable 6.5 K/km environmental lapse has isentropic slope
                // d(theta)/dz = Gamma_dry-Gamma_environment. A warm parcel
                // crossing the colder wedge rises and cools at Gamma_dry.
                // This illustrative lapse closure uses the same terrestrial
                // environment as orographic cooling; supply remains finite.
                const frontLift=cooling*.0098/(.0098-.0065);
                const totalFraction=cooling>0&&vapor>0?Math.max(orographicFraction,1-moistureCapacity(uphillT-frontLift)/vapor):orographicFraction;
                const mountain=amount*orographicFraction,front=amount*(totalFraction-orographicFraction);
                this.atmosphereKgM2[from]-=amount;this.atmosphereKgM2[to]+=amount-mountain-front;
                // A marine part of the donor has no windward land on which
                // to deposit mountain rain. Carry its condensate across the
                // face to the continental slope; already-land parcels rain
                // before their residual vapor reaches the plateau.
                const beforeFace=land[from]*mountain;
                orographicRain[from]+=beforeFace;orographicRain[to]+=mountain-beforeFace;frontalRain[to]+=front;
                const oro=diffusive?this.transportRain.orographicDiffusion:this.transportRain.orographicAdvection,fr=diffusive?this.transportRain.frontDiffusion:this.transportRain.frontAdvection;
                oro[from]+=beforeFace/dt;oro[to]+=(mountain-beforeFace)/dt;fr[to]+=front/dt;
                const flux=(from===this.grid.edges[k].a?1:-1)*(amount-beforeFace);
                this.faceVaporTransportKgM2[k]+=flux;(diffusive?this.faceDiffusiveVaporKgM2:this.faceAdvectiveVaporKgM2)[k]+=flux;
            };
            const exchange=(k:number)=>{
                const e=this.grid.edges[k],lat=Math.abs(this.grid.sinLat[Math.floor(e.a/this.grid.width)]);
                const mixing=this.airRates[k]*eddyFactor(e.a,e.b,lat);
                // Exact two-cell mixing comprises opposing finite parcels.
                // Equal tracer depths have zero *net* diffusion but do not
                // suppress warm-air ascent or windward eddy rainout. Sample
                // both donor states before either transfer to avoid making
                // the second parcel from its just-arrived counterpart.
                const fraction=-Math.expm1(-mixing*dt)/2,a=this.atmosphereKgM2[e.a],b=this.atmosphereKgM2[e.b];
                if(config.upliftScheme==='advective'){
                    const amount=fraction*(a-b);this.atmosphereKgM2[e.a]-=amount;this.atmosphereKgM2[e.b]+=amount;this.faceVaporTransportKgM2[k]+=amount;this.faceDiffusiveVaporKgM2[k]+=amount;
                }else{transferParcel(k,e.a,e.b,fraction*a,a,true);transferParcel(k,e.b,e.a,fraction*b,b,true);}
            };
            const advect=(k:number)=>{
                const e=this.grid.edges[k],rate=this.windRates[k],from=rate>=0?e.a:e.b,to=rate>=0?e.b:e.a;
                const displacement=-Math.expm1(-Math.abs(rate)*dt/2);
                if(config.coldFrontDisplacement){
                    // Cold air advancing underneath a warmer column displaces
                    // a fraction fixed by this SAME resolved face velocity.
                    // Its dry donor need not bring vapor; condensate comes
                    // from the displaced resident warm parcel, not a whole
                    // column lifted at every neighboring face. Terrain lapse
                    // alone is not a horizontal cold wedge.
                    const contrast=Math.max(0,Math.min(temperatureK[to]-temperatureK[from],commonTemperature[to]-commonTemperature[from]));
                    const lift=contrast*.0098/(.0098-.0065),resident=this.atmosphereKgM2[to];
                    const rain=contrast>0?displacement*Math.max(0,resident-moistureCapacity(temperatureK[to]-lift)):0;
                    this.atmosphereKgM2[to]-=rain;frontalRain[to]+=rain;this.transportRain.coldFrontAdvection[to]+=rain/dt;
                }
                const vapor=this.atmosphereKgM2[from],amount=displacement*vapor;
                transferParcel(k,from,to,amount);
            };
            for(let k=0;k<this.grid.edges.length;k++){exchange(k);advect(k);}
            for(let k=this.grid.edges.length-1;k>=0;k--){advect(k);exchange(k);}
        } else {
        this.grid.edges.forEach((e,k)=>{
            const q=dt*this.airRates[k]*(this.atmosphereKgM2[e.b]-this.atmosphereKgM2[e.a]);
            this.delta[e.a]+=q;this.delta[e.b]-=q;
            const rate=this.windRates[k],from=rate>=0?e.a:e.b,to=rate>=0?e.b:e.a;
            const amount=dt*Math.abs(rate)*this.atmosphereKgM2[from];this.delta[from]-=amount;this.delta[to]+=amount;
            this.faceVaporTransportKgM2[k]+=-q+(rate>=0?amount:-amount);
            this.faceDiffusiveVaporKgM2[k]+=-q;this.faceAdvectiveVaporKgM2[k]+=rate>=0?amount:-amount;
        });
        }
        const rainFraction=-Math.expm1(-dt/21600),drainFraction=-Math.expm1(-dt/(3*DAY));
        for(let i=0;i<n;i++) {
            this.atmosphereKgM2[i]+=this.delta[i];
            this.vaporTransportKgM2[i]=this.atmosphereKgM2[i]-this.vaporTransportKgM2[i]+orographicRain[i]+frontalRain[i];
            // Lift moist air to a cooler cloud level. Convergence diagnoses
            // vertical mass export; upslope has units m/s. Both use the same
            // face winds as conservative vapor transport.
            const convergenceDay=Math.max(0,this.convergence[i])*DAY;
            // Vapor belongs to the air reservoir. Warm ground drives ascent,
            // but cannot assign its hotter saturation capacity to cooler air;
            // conversely, cold ground cannot condense a dry warm column.
            const parcelT=temperatureK[i];
            const heating=Math.max(0,Math.min(1,absorbedWm2[i]/250));
            // A solar-heated warm surface supports unresolved deep parcels.
            // Up to 2 km over land and 1 km over sea at 6.5 K/km. Rain requires
            // existing vapor above cloud capacity, including in hot deserts.
            const humidity=this.atmosphereKgM2[i]/moistureCapacity(parcelT);
            // Entrainment reduces the supported cloud depth continuously in
            // dry air. The existing saturation test then supplies the lifting
            // condensation level, instead of a second sharp humidity switch.
            const moistParcel=Math.max(0,Math.min(1,humidity));
            // The divergent branch warms the parcel and inhibits ascent.
            const subsidence=16*DAY*Math.max(0,-this.convergence[i]);
            const vapor=this.atmosphereKgM2[i],saturated=Math.max(0,vapor-moistureCapacity(parcelT))*rainFraction;
            const cloud=(surface:number,depth:number)=>{
                const buoyant=Math.max(0,Math.min(1,(surface-parcelT)/8)),thermalInstability=Math.max(0,Math.min(1,(surface-290)/12)),unstable=config.buoyantConvection?1:thermalInstability;
                const convection=depth*unstable*heating*moistParcel*buoyant,convergence=(6+10*thermalInstability)*convergenceDay;
                const liftK=Math.max(0,Math.min(24,convection+convergence-subsidence)),rain=Math.max(0,vapor-moistureCapacity(parcelT-liftK))*rainFraction,extra=Math.max(0,rain-saturated),requested=convection+convergence;
                return {rain,convection:requested>0?extra*convection/requested:0,convergence:requested>0?extra*convergence/requested:0};
            };
            const modern=config.moistureScheme==='transport';
            const lc=modern?cloud(coupling?.landTemperatureK?.[i]??temperatureK[i],13):{rain:saturated,convection:0,convergence:0};
            const oc=modern?cloud(coupling?.oceanTemperatureK?.[i]??temperatureK[i],6.5):{rain:saturated,convection:0,convergence:0};
            const landColumn=land[i]*lc.rain,seaColumn=(1-land[i])*oc.rain,columnRain=modern?landColumn+seaColumn:saturated;
            this.atmosphereKgM2[i]-=columnRain;
            const rain=columnRain+orographicRain[i]+frontalRain[i];this.precipitationKgM2S[i]=rain/dt;
            const saturation=Math.min(columnRain,saturated);
            this.precipitationComponents.saturation[i]=saturation/dt;this.precipitationComponents.orographic[i]=orographicRain[i]/dt;this.precipitationComponents.front[i]=frontalRain[i]/dt;
            this.precipitationComponents.convection[i]=(land[i]*lc.convection+(1-land[i])*oc.convection)/dt;this.precipitationComponents.convergence[i]=(land[i]*lc.convergence+(1-land[i])*oc.convergence)/dt;
            const landRain=modern?landColumn+orographicRain[i]+land[i]*frontalRain[i]:rain*land[i],seaRain=modern?seaColumn+(1-land[i])*frontalRain[i]:rain*(1-land[i]);
            this.landPrecipitationKgM2S[i]=landRain/dt;this.oceanPrecipitationKgM2S[i]=seaRain/dt;
            this.landPrecipitationComponents.saturation[i]=land[i]*saturation/dt;this.landPrecipitationComponents.convection[i]=land[i]*lc.convection/dt;this.landPrecipitationComponents.convergence[i]=land[i]*lc.convergence/dt;this.landPrecipitationComponents.front[i]=land[i]*frontalRain[i]/dt;this.landPrecipitationComponents.orographic[i]=orographicRain[i]/dt;
            if(this.surfaceSolver) {
                const snow=this.surfaceSolver.precipitate(i,rain,dt,modern?landRain:undefined);this.snowfallKgM2S[i]=snow/dt;
                if(coupling)coupling.heatJm2[i]=VAPORIZATION_J_KG*rain+FUSION_J_KG*snow;continue;
            }
            const lakeRain=modern?(1-land[i]>0?seaRain*this.inlandWaterFraction[i]/(1-land[i]):0):rain*this.inlandWaterFraction[i];
            this.addOceanWater((modern?seaRain-lakeRain:rain*(1-land[i]-this.inlandWaterFraction[i]))/n);
            this.surfaceKgM2[i]+=lakeRain;
            const phaseT=config.moistureScheme==='transport'&&split?coupling!.landTemperatureK![i]:temperatureK[i];
            const snow=coupling&&phaseT<273.15?landRain:0;
            this.snowfallKgM2S[i]=snow/dt;
            this.snowKgM2[i]+=snow;
            if(coupling)coupling.heatJm2[i]=VAPORIZATION_J_KG*(rain-(split&&coupling.landHeatJm2&&coupling.oceanHeatJm2?0:this.evaporationKgM2S[i]*dt))+FUSION_J_KG*snow;
            const liquidRain=landRain-snow;
            const capacity=config.soilCapacityKgM2*land[i],infiltration=Math.min(liquidRain,capacity-this.soilKgM2[i]);
            this.soilKgM2[i]+=infiltration;this.surfaceKgM2[i]+=liquidRain-infiltration;
            const drainage=Math.max(0,this.soilKgM2[i]-.7*capacity)*drainFraction;
            this.soilKgM2[i]-=drainage;this.surfaceKgM2[i]+=drainage;
        }
        if(!coupling)this.routeSurface(dt);this.elapsedS+=dt;this.precipitationComponentsValid=true;this.landPrecipitationKnown=true;
    }
    /** Reservoir routing, not a shallow-water solver. A basin has no forced
     * outlet; its stored head must exceed a neighboring saddle before spilling. */
    routeSurface(dt:number) {
        if(this.pendingRouting)throw new Error('Attach restored terrain before routing water');
        if(this.routing){this.routing.route(this,dt,this.config.routingSpeedMps);return;}
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
            if(target===-2)this.addOceanWater(amount/n);
            else this.delta[target]+=amount;
            this.dischargeM3S[i]=amount*this.cellAreaM2/WATER_DENSITY/dt;
        }
        for(let i=0;i<n;i++)this.surfaceKgM2[i]+=this.delta[i];
    }
    checkpoint():WaterCheckpoint {
        return {snowfallKgM2S:this.snowfallKgM2S?.slice()??null,atmosphereKgM2:this.atmosphereKgM2.slice(),soilKgM2:this.soilKgM2.slice(),surfaceKgM2:this.surfaceKgM2.slice(),
            ...(this.config.moistureScheme==='transport'&&this.landPrecipitationKnown?{landPrecipitationKgM2S:this.landPrecipitationKgM2S.slice()}:{}),
            precipitationKgM2S:this.precipitationKgM2S.slice(),evaporationKgM2S:this.evaporationKgM2S.slice(),dischargeM3S:this.dischargeM3S.slice(),
            snowKgM2:this.snowKgM2.slice(),seaIceKgM2:this.seaIceKgM2.slice(),meltKgM2S:this.meltKgM2S.slice(),
            oceanGlobalKgM2:this.oceanGlobalKgM2,...(this.config.compensatedOceanTransfers?{oceanCorrection:this.oceanCorrection}:{}),elapsedS:this.elapsedS,windEastMps:this.windEastMps.slice(),windNorthMps:this.windNorthMps.slice(),routing:this.routing?.checkpoint()??structuredClone(this.pendingRouting),landIceKgM2:this.landIceKgM2.slice(),landIceCorrection:this.landIceCorrection.slice(),glacier:this.glacier?.checkpoint()??structuredClone(this.pendingGlacier),shelfLandIceKgM2:this.shelfLandIceKgM2.slice(),shelfSeaIceKgM2:this.shelfSeaIceKgM2.slice()};
    }
    restore(state:WaterCheckpoint,oldRefinedLandEstimate?:Float64Array) {
        for(const a of [this.vaporTransportKgM2,this.faceVaporTransportKgM2,this.faceAdvectiveVaporKgM2,this.faceDiffusiveVaporKgM2])a.fill(0);
        this.precipitationComponentsValid=false;for(const a of [...Object.values(this.precipitationComponents),...Object.values(this.landPrecipitationComponents),...Object.values(this.transportRain)])a.fill(0);this.landPrecipitationKgM2S.fill(0);this.oceanPrecipitationKgM2S.fill(0);
        this.snowfallKgM2S=state.snowfallKgM2S?.slice()??null;
        for(const key of ['atmosphereKgM2','soilKgM2','surfaceKgM2','precipitationKgM2S','evaporationKgM2S','dischargeM3S','snowKgM2','seaIceKgM2','meltKgM2S'] as const)this[key].set(state[key]);
        this.landPrecipitationKnown=!!state.landPrecipitationKgM2S||!oldRefinedLandEstimate;
        for(let i=0;i<this.grid.count;i++){this.landPrecipitationKgM2S[i]=state.landPrecipitationKgM2S?.[i]??oldRefinedLandEstimate?.[i]??this.precipitationKgM2S[i]*this.land[i];this.oceanPrecipitationKgM2S[i]=Math.max(0,this.precipitationKgM2S[i]-this.landPrecipitationKgM2S[i]);}
        this.oceanGlobalKgM2=state.oceanGlobalKgM2;this.oceanCorrection=this.config.compensatedOceanTransfers?(state.oceanCorrection??0):0;this.elapsedS=state.elapsedS;
        this.setWinds(state.windEastMps,state.windNorthMps);
        this.landIceKgM2.set(state.landIceKgM2);
        this.landIceCorrection.set(state.landIceCorrection);
        this.shelfLandIceKgM2.set(state.shelfLandIceKgM2);this.shelfSeaIceKgM2.set(state.shelfSeaIceKgM2);
        if(state.glacier){if(this.glacier)this.glacier.restore(state.glacier);else this.pendingGlacier=structuredClone(state.glacier);}else {this.glacier=null;this.pendingGlacier=null;}
        if(state.routing) {if(this.routing)this.routing.restore(state.routing,this);else this.pendingRouting=structuredClone(state.routing);}
        else {this.routing=null;this.pendingRouting=null;}
    }
    diagnostics() {
        const mean=(a:Float64Array)=>a.reduce((sum,v)=>sum+v,0)/this.grid.count,totalMm=this.total();
        return {shelfIceMm:mean(this.shelfLandIceKgM2)+mean(this.shelfSeaIceKgM2),landIceMm:mean(this.landIceKgM2),snowMm:mean(this.snowKgM2),iceMm:mean(this.seaIceKgM2),meltMmDay:DAY*mean(this.meltKgM2S),totalMm,residualMm:totalMm-this.initialTotalMm,atmosphereMm:mean(this.atmosphereKgM2),soilMm:mean(this.soilKgM2),surfaceMm:mean(this.surfaceKgM2),oceanMm:this.oceanGlobalKgM2,
            rainMmDay:DAY*mean(this.precipitationKgM2S),evaporationMmDay:DAY*mean(this.evaporationKgM2S),maxDischargeM3S:Math.max(...this.dischargeM3S)};
    }
}
