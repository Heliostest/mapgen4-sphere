import {deriveOrbit,STEFAN_BOLTZMANN as SIGMA} from './astronomy.ts';
import type {ThermalModel} from './thermal.ts';
import {FUSION_J_KG as LF,VAPORIZATION_J_KG as LV,type WaterModel} from './water.ts';
import type {EnvironmentModel} from './environment.ts';
import {makeSurfacePartition,partitionCell,type SurfacePartition,type RefinementQuality,MAX_SURFACE_PATCHES} from './refinement-topology.ts';
import {type SurfaceTerrain} from './surface-grid.ts';
import {record,field} from './runtime-state.ts';

const stores=['snow','ice','grounded','shelfLand','shelfSea','soil','surface'] as const;
type Store=typeof stores[number];
const coarse={snow:'snowKgM2',ice:'seaIceKgM2',grounded:'landIceKgM2',shelfLand:'shelfLandIceKgM2',shelfSea:'shelfSeaIceKgM2',soil:'soilKgM2',surface:'surfaceKgM2'} as const;
export interface RefinedCheckpoint {partition:SurfacePartition;landK:Float64Array;seaK:Float64Array;snow:Float64Array;ice:Float64Array;grounded:Float64Array;shelfLand:Float64Array;shelfSea:Float64Array;soil:Float64Array;surface:Float64Array;rain:Float64Array;snowfall:Float64Array;melt:Float64Array;}
/** Surface mass is kg per parent m², each patch already includes its area.
 * Coarse arrays are sums/views, never a second inventory. Air/vapor and all
 * horizontal atmosphere transport retain the original parent grid. */
export class RefinedSurface {
    readonly maxStepS:number;
    readonly landK:Float64Array;readonly seaK:Float64Array;
    readonly snow:Float64Array;readonly ice:Float64Array;readonly grounded:Float64Array;readonly shelfLand:Float64Array;readonly shelfSea:Float64Array;readonly soil:Float64Array;readonly surface:Float64Array;
    readonly rain:Float64Array;readonly snowfall:Float64Array;readonly melt:Float64Array;
    private readonly albedo:Float64Array;private readonly oceanDemand:Float64Array;
    private readonly lastLand:Float64Array;private readonly lastSea:Float64Array;
    private readonly meanHeight:Float64Array;private readonly maxHeight:Float64Array;
    private environment:EnvironmentModel|null=null;
    private routePartition:Int32Array|null=null;
    private terrainSource:SurfaceTerrain|null=null;
    readonly lakeArea:Float64Array;
    constructor(readonly model:ThermalModel,readonly water:WaterModel,readonly partition:SurfacePartition) {
        const count=partition.parent.length,n=model.grid.count;
        for(const key of stores)this[key]=new Float64Array(count);
        this.landK=new Float64Array(count);this.seaK=new Float64Array(count);this.rain=new Float64Array(count);this.snowfall=new Float64Array(count);this.melt=new Float64Array(count);
        this.lakeArea=new Float64Array(count);this.albedo=new Float64Array(count);this.oceanDemand=new Float64Array(count);this.meanHeight=new Float64Array(n);this.maxHeight=new Float64Array(n);
        this.lastLand=model.landTemperatureK.slice();this.lastSea=model.oceanTemperatureK.slice();
        for(let t=0;t<count;t++){const k=partition.parent[t];this.meanHeight[k]+=partition.heightM[t]*partition.land[t];if(partition.land[t]>0)this.maxHeight[k]=Math.max(this.maxHeight[k],partition.heightM[t]);}
        for(let k=0;k<n;k++)if(water.land[k]>0)this.meanHeight[k]/=water.land[k];
        const initial=deriveOrbit(model.planet,model.orbit).equilibriumK/model.config.emissivity**.25,maxT=Math.max(initial,(model.fluxWm2/(model.config.emissivity*SIGMA))**.25),derivative=4*model.config.emissivity*SIGMA*maxT**3*(1-(model.config.airRadiationFraction??0));
        let bound=Infinity;for(let t=0;t<count;t++){if(partition.land[t]>0)bound=Math.min(bound,.45*model.config.landHeatCapacity*Math.max(.55,Math.exp(-.0065*partition.heightM[t]/288.15))**4/derivative);if(partition.sea[t]>0)bound=Math.min(bound,.45*model.config.oceanDepthM*4.2e6/derivative);}
        this.maxStepS=bound;
    }
    static create(m:ThermalModel,w:WaterModel,height:ArrayLike<number>,source:SurfaceTerrain|null,quality:RefinementQuality,seeds:(u:number,v:number,kind:Store)=>number) {
        const r=new RefinedSurface(m,w,makeSurfacePartition(m.grid,w.land,height,source,m.planet.reliefM,quality)),p=r.partition;
        // Candidate preparation must not install a routing partition before
        // the runtime accepts its stable step. Existing inland lakes carry
        // liquid even in parents with no dry land.
        r.terrainSource=source;r.attachRouting(false);
        for(let t=0;t<p.parent.length;t++) {
            const k=p.parent[t];r.rain[t]=w.precipitationKgM2S[k]*(p.land[t]+p.sea[t]);r.landK[t]=Math.max(1,m.landTemperatureK[k]-.0065*(p.heightM[t]-r.meanHeight[k]));r.seaK[t]=m.oceanTemperatureK[k];
        }
        // Recenter clipped contrasts exactly in sensible-heat space.
        for(let k=0;k<m.grid.count;k++) {
            const mean=r.meanTemperature(k,false),factor=mean>0?m.landTemperatureK[k]/mean:1;
            for(let t=p.offset[k];t<p.offset[k+1];t++)r.landK[t]*=factor;
            for(const kind of stores) {
                const ocean=kind==='ice'||kind==='shelfSea',weights=new Float64Array(p.offset[k+1]-p.offset[k]);let sum=0;
                for(let t=p.offset[k];t<p.offset[k+1];t++) {
                    const area=kind==='surface'?p.land[t]+r.lakeArea[t]:ocean?p.sea[t]:p.land[t];
                    const weight=kind==='snow'?Math.max(0,273.15-r.airK(t)):kind==='soil'||kind==='surface'?1:Math.max(0,seeds(p.u[t],p.v[t],kind));
                    weights[t-p.offset[k]]=area*weight;sum+=area*weight;
                }
                if(sum===0){for(let t=p.offset[k];t<p.offset[k+1];t++){weights[t-p.offset[k]]=kind==='surface'?p.land[t]+p.sea[t]:ocean?p.sea[t]:p.land[t];sum+=weights[t-p.offset[k]];}}
                for(let t=p.offset[k];t<p.offset[k+1];t++)r[kind][t]=sum>0?w[coarse[kind]][k]*weights[t-p.offset[k]]/sum:0;
            }
        }
        return r;
    }
    /** Conservative overlap on the registered, nested geographic tiling. */
    static remap(old:RefinedSurface,m:ThermalModel,w:WaterModel,part:SurfacePartition,source:SurfaceTerrain|null=null) {
        const r=new RefinedSurface(m,w,part),p=old.partition;if(source)r.setTerrainSource(source);
        for(let k=0;k<w.grid.count;k++) {
            const nq=part.level[k],oq=p.level[k];
            const landHeat=new Float64Array(nq*nq),seaHeat=new Float64Array(nq*nq),landWeight=new Float64Array(nq*nq),seaWeight=new Float64Array(nq*nq);
            for(let a=p.offset[k];a<p.offset[k+1];a++) {
                const local=a-p.offset[k],x=local%oq,y=Math.floor(local/oq),candidates:{t:number;overlap:number}[]=[];
                for(let yy=Math.floor(y*nq/oq);yy<Math.ceil((y+1)*nq/oq);yy++)for(let xx=Math.floor(x*nq/oq);xx<Math.ceil((x+1)*nq/oq);xx++) {
                    const overlap=(Math.min((x+1)/oq,(xx+1)/nq)-Math.max(x/oq,xx/nq))*(Math.min((y+1)/oq,(yy+1)/nq)-Math.max(y/oq,yy/nq));
                    candidates.push({t:part.offset[k]+yy*nq+xx,overlap:overlap*nq*nq});
                }
                for(const b of candidates){const i=b.t-part.offset[k],fraction=b.overlap*oq*oq/(nq*nq);landHeat[i]+=fraction*p.land[a]*old.landK[a];landWeight[i]+=fraction*p.land[a];seaHeat[i]+=fraction*p.sea[a]*old.seaK[a];seaWeight[i]+=fraction*p.sea[a];}
                for(const kind of stores) {
                    const ocean=kind==='ice'||kind==='shelfSea';let target:Store=kind;
                    const carrier=(t:number,sea:boolean)=>kind==='surface'?part.land[t]+r.lakeArea[t]:sea?part.sea[t]:part.land[t];
                    let sum=candidates.reduce((sum,b)=>sum+b.overlap*carrier(b.t,ocean),0),sea=ocean;
                    if(sum===0) {
                        if(kind==='soil'||kind==='surface'){w.oceanGlobalKgM2+=old[kind][a]/w.grid.count;continue;}
                        sea=!ocean;target=kind==='shelfLand'?'shelfSea':kind==='shelfSea'?'shelfLand':ocean?'snow':'ice';
                        sum=candidates.reduce((sum,b)=>sum+b.overlap*(sea?part.sea[b.t]:part.land[b.t]),0);
                    }
                    for(const b of candidates)r[target][b.t]+=sum>0?old[kind][a]*b.overlap*carrier(b.t,sea)/sum:0;
                }
                for(const b of candidates)for(const key of ['rain','snowfall','melt'] as const)r[key][b.t]+=old[key][a]*b.overlap*oq*oq/(nq*nq);
            }
            for(let b=part.offset[k];b<part.offset[k+1];b++) {
                const i=b-part.offset[k];r.landK[b]=landWeight[i]>0?landHeat[i]/landWeight[i]:old.model.landTemperatureK[k];r.seaK[b]=seaWeight[i]>0?seaHeat[i]/seaWeight[i]:old.model.oceanTemperatureK[k];
            }
            // Preserve each parent conditional heat mean during a quality or
            // geometric repartition; its air reservoir is unchanged.
            const ml=r.meanTemperature(k,false),ms=r.meanTemperature(k,true),fl=ml>0?old.model.landTemperatureK[k]/ml:1,fs=ms>0?old.model.oceanTemperatureK[k]/ms:1;
            for(let b=part.offset[k];b<part.offset[k+1];b++){r.landK[b]*=fl;r.seaK[b]*=fs;}
        }
        // Infiltration capacity changes move excess liquid into runoff.
        for(let t=0;t<part.parent.length;t++){const excess=Math.max(0,r.soil[t]-part.land[t]*w.config.soilCapacityKgM2);r.soil[t]-=excess;r.surface[t]+=excess;}
        r.aggregate();return r;
    }
    attach(e:EnvironmentModel) {this.environment=e;e.surfaceSolver=this;this.model.surfaceSolver=this;this.water.surfaceSolver=this;this.attachRouting();this.refresh();}
    resetRates() {this.melt.fill(0);this.rain.fill(0);this.snowfall.fill(0);}
    attachRouting(install=true) {
        const route=this.water.routing,source=this.terrainSource;
        if(!route||!source?.mesh)return;
        const mesh=source.mesh,p=this.partition;this.routePartition=Int32Array.from({length:mesh.numTriangles},(_,t)=>{
            const xyz=mesh.xyz_t.subarray(3*t,3*t+3),u=.5+Math.atan2(xyz[0],xyz[2])/(2*Math.PI),v=Math.acos(Math.max(-1,Math.min(1,xyz[1])))/Math.PI;
            return route.network.cell[t]>=0?partitionCell(this.model.grid,p,u,v):-1;
        });
        this.lakeArea.fill(0);
        const rawSea=new Float64Array(p.parent.length);
        for(let t=0;t<mesh.numTriangles;t++) {
            if(source.elevation[mesh.numRegions+t]>0)continue;
            const xyz=mesh.xyz_t.subarray(3*t,3*t+3),u=.5+Math.atan2(xyz[0],xyz[2])/(2*Math.PI),v=Math.acos(Math.max(-1,Math.min(1,xyz[1])))/Math.PI,a=partitionCell(this.model.grid,p,u,v);
            rawSea[a]+=route.network.areaM2[t];
            if((route.network.inlandLakeId?.[t]??0)>0)this.lakeArea[a]+=route.network.areaM2[t];
        }
        for(let a=0;a<rawSea.length;a++)this.lakeArea[a]=rawSea[a]>0?p.sea[a]*this.lakeArea[a]/rawSea[a]:0;
        // The finite lake mask is local; unrepresented wet tiles stay open sea.
        if(install)route.setPartition(this.routePartition,this.surface,p.parent);
    }
    setTerrainSource(source:SurfaceTerrain) {this.terrainSource=source;this.attachRouting();}
    private meanTemperature(k:number,ocean:boolean) {
        const p=this.partition,a=ocean?p.sea:p.land,t=ocean?this.seaK:this.landK;let sum=0,weight=0;
        for(let i=p.offset[k];i<p.offset[k+1];i++){sum+=a[i]*t[i];weight+=a[i];}
        return weight>0?sum/weight:(ocean?this.model.oceanTemperatureK[k]:this.model.landTemperatureK[k]);
    }
    private lapse(k:number) {return Math.min(.0065,Math.max(0,this.model.temperatureK[k]-1)/Math.max(1,this.maxHeight[k]-this.water.land[k]*this.meanHeight[k]));}
    landAirK(t:number) {const p=this.partition,k=p.parent[t];return this.model.temperatureK[k]-this.lapse(k)*(p.heightM[t]-this.water.land[k]*this.meanHeight[k]);}
    seaAirK(t:number) {const k=this.partition.parent[t];return this.model.temperatureK[k]+this.lapse(k)*this.water.land[k]*this.meanHeight[k];}
    airK(t:number) {const p=this.partition;return (p.land[t]*this.landAirK(t)+p.sea[t]*this.seaAirK(t))/(p.land[t]+p.sea[t]);}
    /** Import only a coarse ocean/ice-flow anomaly, preserving local contrasts. */
    pull() {
        const p=this.partition,m=this.model;
        for(let t=0;t<p.parent.length;t++){const k=p.parent[t];this.landK[t]+=m.landTemperatureK[k]-this.lastLand[k];this.seaK[t]+=m.oceanTemperatureK[k]-this.lastSea[k];}
        this.lastLand.set(m.landTemperatureK);this.lastSea.set(m.oceanTemperatureK);
    }
    private temperatures(k:number) {
        this.model.landTemperatureK[k]=this.lastLand[k]=this.meanTemperature(k,false);
        this.model.oceanTemperatureK[k]=this.lastSea[k]=this.meanTemperature(k,true);
    }
    aggregate() {
        const p=this.partition,w=this.water;
        for(let k=0;k<w.grid.count;k++){for(const kind of stores){let sum=0;for(let t=p.offset[k];t<p.offset[k+1];t++)sum+=this[kind][t];w[coarse[kind]][k]=sum;}this.temperatures(k);}
    }
    refresh() {
        if(!this.environment)return;
        const p=this.partition,e=this.environment,m=this.model,clamp=(v:number)=>Math.max(0,Math.min(1,v));
        for(let k=0;k<m.grid.count;k++) {
            let sum=0,snow=0,ice=0,ground=0,shelfLand=0,shelfSea=0,landFrozen=0,seaFrozen=0;
            for(let t=p.offset[k];t<p.offset[k+1];t++) {
                const l=p.land[t],s=p.sea[t],sn=l>0?clamp(this.snow[t]/(30*l)):0,g=l>0?clamp(this.grounded[t]/(917*5*l)):0,sl=l>0?clamp(this.shelfLand[t]/(917*5*l)):0,i=s>0?clamp(this.ice[t]/(917*.5*s)):0,ss=s>0?clamp(this.shelfSea[t]/(917*5*s)):0;
                const lf=Math.max(sn,g,sl),sf=Math.max(i,ss),base=clamp(m.orbit.bondAlbedo+(e.config.vegetation?l/(l+s)*.06*(.5-e.vegetation[k]):0));
                this.albedo[t]=e.config.iceAlbedo?base+(Math.max(base,.65)-base)*(l*lf+s*sf)/(l+s):base;sum+=(l+s)*this.albedo[t];
                snow+=l*sn;ground+=l*g;shelfLand+=l*sl;ice+=s*i;shelfSea+=s*ss;landFrozen+=l*lf;seaFrozen+=s*sf;
            }
            const l=this.water.land[k],s=1-l;m.albedo[k]=sum;
            e.snowCover[k]=l>0?snow/l:0;e.glacierCover[k]=l>0?ground/l:0;e.shelfLandCover[k]=l>0?shelfLand/l:0;
            e.iceCover[k]=s>0?ice/s:0;e.shelfSeaCover[k]=s>0?shelfSea/s:0;e.oceanFrozenCover[k]=s>0?seaFrozen/s:0;
            e.landEvaporation[k]=(e.config.vegetation?(.6+.4*e.vegetation[k]):1)*(l>0?1-landFrozen/l:1);
        }
    }
    stepSurface(k:number,dt:number,insolation:number) {
        const m=this.model,p=this.partition,airFraction=m.config.airRadiationFraction??0;let net=0;
        for(let t=p.offset[k];t<p.offset[k+1];t++)for(const ocean of [false,true]) {
            const area=ocean?p.sea[t]:p.land[t];if(area===0)continue;
            const a=ocean?this.seaK:this.landK,cs=area*(ocean?m.config.oceanDepthM*4.2e6:m.config.landHeatCapacity),scale=ocean?1:Math.max(.55,Math.exp(-.0065*p.heightM[t]/288.15));
            const radiation=area*((1-this.albedo[t])*insolation-(1-airFraction)*m.config.emissivity*SIGMA*(a[t]/scale)**4);
            a[t]+=dt*radiation/cs;net+=radiation;
            const ca=m.capacity[k],rate=10*area*(1/ca+1/cs),heat=(a[t]-(ocean?this.seaAirK(t):this.landAirK(t)))*(-Math.expm1(-dt*rate))/(1/ca+1/cs);
            a[t]-=heat/cs;m.temperatureK[k]+=heat/ca;
        }
        this.temperatures(k);return net;
    }
    phase(dt:number) {
        this.pull();const p=this.partition,m=this.model,w=this.water;
        const lh=new Float64Array(m.grid.count),sh=new Float64Array(m.grid.count),freeze=new Float64Array(p.parent.length);let request=0;
        for(let t=0;t<p.parent.length;t++) {
            const k=p.parent[t],lc=p.land[t]*m.config.landHeatCapacity,sc=p.sea[t]*m.config.oceanDepthM*4.2e6;
            if(lc>0)for(const kind of ['snow','grounded','shelfLand'] as const) {
                const melt=Math.min(this[kind][t],Math.max(0,(this.landK[t]-273.15)*lc/LF));this[kind][t]-=melt;this.landK[t]-=melt*LF/lc;lh[k]-=melt*LF;
                if(kind==='shelfLand')w.oceanGlobalKgM2+=melt/m.grid.count;else{this.surface[t]+=melt;this.melt[t]+=melt/dt;w.meltKgM2S[k]+=melt/dt;}
            }
            if(sc>0) {
                for(const [kind,limit] of [['shelfSea',273.15],['ice',271.35]] as const) {
                    const melt=Math.min(this[kind][t],Math.max(0,(this.seaK[t]-limit)*sc/LF));this[kind][t]-=melt;this.seaK[t]-=melt*LF/sc;sh[k]-=melt*LF;w.oceanGlobalKgM2+=melt/m.grid.count;
                }
                const open=p.sea[t]>0?Math.max(0,1-this.lakeArea[t]/p.sea[t]):0;
                freeze[t]=Math.max(0,(271.35-this.seaK[t])*sc/LF)*open;request+=freeze[t]/m.grid.count;
            }
        }
        const ratio=request>0?Math.min(1,w.oceanGlobalKgM2/request):0;w.oceanGlobalKgM2=Math.max(0,w.oceanGlobalKgM2-request*ratio);
        for(let t=0;t<freeze.length;t++)if(freeze[t]>0){const amount=freeze[t]*ratio,k=p.parent[t];this.ice[t]+=amount;this.seaK[t]+=amount*LF/(p.sea[t]*m.config.oceanDepthM*4.2e6);sh[k]+=amount*LF;}
        m.applyLandHeat(lh);m.applyOceanHeat(sh);this.aggregate();w.landIceCorrection.fill(0);
    }
    evaporate(k:number,dt:number,potential:number,deficit:number) {
        const p=this.partition,w=this.water,m=this.model,e=this.environment!;let landEvap=0,lakeEvap=0,ocean=0,lh=0,sh=0;
        for(let t=p.offset[k];t<p.offset[k+1];t++) {
            const l=p.land[t],s=p.sea[t],frozen=l>0?Math.min(1,Math.max(this.snow[t]/(l*30),this.grounded[t]/(l*917*5),this.shelfLand[t]/(l*917*5))):0;
            const demand=potential*deficit*Math.max(0,Math.min(1,(this.landK[t]-273.15)/5))*l*(e.config.vegetation?(.6+.4*e.vegetation[k]):1)*(1-frozen);
            const lakeArea=this.lakeArea[t];
            const lakeDemand=potential*deficit*Math.max(0,Math.min(1,(this.seaK[t]-273.15)/5))*lakeArea;
            const surface=Math.min(this.surface[t],demand+lakeDemand),lake=Math.min(surface,lakeDemand),soil=Math.min(this.soil[t],Math.max(0,demand-surface+lake));
            this.surface[t]-=surface;this.soil[t]-=soil;landEvap+=surface-lake+soil;lakeEvap+=lake;lh-=LV*(surface-lake+soil);sh-=LV*lake;
            if(l>0)this.landK[t]-=LV*(surface-lake+soil)/(l*m.config.landHeatCapacity);if(s>0)this.seaK[t]-=LV*lake/(s*m.config.oceanDepthM*4.2e6);
            const ice=s>0?Math.min(1,Math.max(this.ice[t]/(s*917*.5),this.shelfSea[t]/(s*917*5))):0;
            this.oceanDemand[t]=potential*deficit*Math.max(0,Math.min(1,(this.seaK[t]-273.15)/5))*Math.max(0,s-lakeArea)*(1-ice);ocean+=this.oceanDemand[t];
        }
        m.applySurfaceCellHeat(k,lh,sh);
        this.aggregateCell(k);return {landEvap,lakeEvap,oceanDemand:ocean};
    }
    oceanEvaporate(k:number,amount:number) {
        const p=this.partition,m=this.model;let sum=0;for(let t=p.offset[k];t<p.offset[k+1];t++)sum+=this.oceanDemand[t];
        for(let t=p.offset[k];t<p.offset[k+1];t++)if(p.sea[t]>0)this.seaK[t]-=sum>0?amount*this.oceanDemand[t]/sum*LV/(p.sea[t]*m.config.oceanDepthM*4.2e6):0;
        m.applySurfaceCellHeat(k,0,-amount*LV);this.temperatures(k);
    }
    private aggregateCell(k:number) {const p=this.partition;for(const kind of stores){let sum=0;for(let t=p.offset[k];t<p.offset[k+1];t++)sum+=this[kind][t];this.water[coarse[kind]][k]=sum;}this.temperatures(k);}
    precipitate(k:number,rain:number,dt:number) {
        const p=this.partition,w=this.water,q=p.level[k],start=p.offset[k],u=w.windEastMps[k],v=w.windNorthMps[k],speed=Math.hypot(u,v),weights=new Float64Array(q*q);let sum=0,snow=0;
        for(let t=start;t<p.offset[k+1];t++) {
            const x=(t-start)%q,y=Math.floor((t-start)/q),xx=Math.max(0,Math.min(q-1,x-Math.round(speed>0?u/speed:0))),yy=Math.max(0,Math.min(q-1,y+Math.round(speed>0?v/speed:0))),up=p.heightM[start+yy*q+xx];
            weights[t-start]=(p.land[t]+p.sea[t])*Math.exp(Math.max(-1,Math.min(1,(p.heightM[t]-up)/1000)));sum+=weights[t-start];
        }
        for(let t=start;t<p.offset[k+1];t++) {
            const amount=rain*weights[t-start]/sum,area=p.land[t]+p.sea[t],land=amount*p.land[t]/area;
            this.rain[t]=amount/dt;const frozen=this.landAirK(t)<273.15?land:0;this.snowfall[t]=frozen/dt;this.snow[t]+=frozen;snow+=frozen;
            const liquid=land-frozen,capacity=w.config.soilCapacityKgM2*p.land[t],infiltration=Math.min(liquid,Math.max(0,capacity-this.soil[t]));
            this.soil[t]+=infiltration;this.surface[t]+=liquid-infiltration;
            const drainage=Math.max(0,this.soil[t]-.7*capacity)*(-Math.expm1(-dt/(3*86400)));this.soil[t]-=drainage;this.surface[t]+=drainage;
            const lake=this.lakeArea[t];
            this.surface[t]+=amount*lake/area;w.oceanGlobalKgM2+=amount*Math.max(0,p.sea[t]-lake)/area/w.grid.count;
        }
        this.aggregateCell(k);return snow;
    }
    reconcileIce() {
        const p=this.partition,w=this.water;
        for(let k=0;k<w.grid.count;k++) {
            let total=0;for(let t=p.offset[k];t<p.offset[k+1];t++)total+=this.grounded[t];
            const target=w.landIceKgM2[k];
            for(let t=p.offset[k];t<p.offset[k+1];t++)this.grounded[t]=total>0?this.grounded[t]*target/total:w.land[k]>0?target*p.land[t]/w.land[k]:0;
        }
    }
    compact(dt:number) {
        const p=this.partition,f=-Math.expm1(-dt/(30*365.25*86400));
        if(!this.water.glacier)return;
        for(let t=0;t<p.parent.length;t++)if(this.landK[t]<273.15){const mass=Math.max(0,this.snow[t]-50*p.land[t])*f;this.snow[t]-=mass;this.grounded[t]+=mass;}
        this.aggregate();
    }
    route(dt:number) {
        const w=this.water;if(dt>0)w.routeSurface(dt);else w.routing?.synchronize(w);
        if(this.routePartition&&w.routing) {
            this.surface.fill(0);const conversion=1000/w.cellAreaM2;
            for(let t=0;t<this.routePartition.length;t++)if(this.routePartition[t]>=0)this.surface[this.routePartition[t]]+=w.routing.volumeM3[t]*conversion;
            // Parents without represented terrestrial triangles retain stores.
            for(let k=0;k<w.grid.count;k++){let sum=0;for(let t=this.partition.offset[k];t<this.partition.offset[k+1];t++)sum+=this.surface[t];if(sum===0&&w.surfaceKgM2[k]>0)this.redistributeSurface(k,w.surfaceKgM2[k]);}
        }else for(let k=0;k<w.grid.count;k++)this.redistributeSurface(k,w.surfaceKgM2[k]);
    }
    private redistributeSurface(k:number,target:number) {const p=this.partition;let sum=0;for(let t=p.offset[k];t<p.offset[k+1];t++)sum+=this.surface[t];for(let t=p.offset[k];t<p.offset[k+1];t++)this.surface[t]=sum>0?this.surface[t]*target/sum:this.water.land[k]>0?target*p.land[t]/this.water.land[k]:0;}
    private samplePatch(t:number) {
        const p=this.partition,l=p.land[t],s=p.sea[t],a=l+s;
        return {patch:t,parent:p.parent[t],landFraction:l/a,heightM:p.heightM[t],airK:this.airK(t),landK:this.landK[t],seaK:this.seaK[t],snowMm:l>0?this.snow[t]/l:0,iceKgM2:s>0?this.ice[t]/s:0,landIceKgM2:l>0?this.grounded[t]/l:0,shelfLandKgM2:l>0?this.shelfLand[t]/l:0,shelfSeaKgM2:s>0?this.shelfSea[t]/s:0,soilMm:l>0?this.soil[t]/l:0,surfaceMm:this.surface[t]/a,rainMmDay:86400*this.rain[t]/a,snowMmDay:86400*this.snowfall[t]/a,meltMmDay:l>0?86400*this.melt[t]/l:0};
    }
    sample(u:number,v:number) {
        if(v>1e-12&&v<1-1e-12)return this.samplePatch(partitionCell(this.model.grid,this.partition,u,v));
        // The pole is one direction. Area-average the innermost cap tiles,
        // using conditional land/sea weights for their reservoirs.
        const p=this.partition,g=this.model.grid,row=v<=1e-12?0:g.height-1;
        const out=this.samplePatch(p.offset[row*g.width]);let total=0,land=0,sea=0;
        const keys=['heightM','airK','landK','seaK','snowMm','iceKgM2','landIceKgM2','shelfLandKgM2','shelfSeaKgM2','soilMm','surfaceMm','rainMmDay','snowMmDay','meltMmDay'] as const;
        for(const key of keys)out[key]=0;
        const landKeys=new Set<string>(['heightM','landK','snowMm','landIceKgM2','shelfLandKgM2','soilMm','meltMmDay']),seaKeys=new Set<string>(['seaK','iceKgM2','shelfSeaKgM2']);
        for(let x=0;x<g.width;x++) {
            const k=row*g.width+x,q=p.level[k],start=p.offset[k]+(row===0?0:q*(q-1));
            for(let t=start;t<start+q;t++) {
                const s=this.samplePatch(t),l=p.land[t],wet=p.sea[t],a=l+wet;total+=a;land+=l;sea+=wet;
                for(const key of keys)out[key]+=s[key]*(landKeys.has(key)?l:seaKeys.has(key)?wet:a);
            }
        }
        for(const key of keys)out[key]/=landKeys.has(key)?land||1:seaKeys.has(key)?sea||1:total;
        out.landFraction=land/total;return out;
    }
    checkpoint():RefinedCheckpoint {const result:any={partition:structuredClone(this.partition),landK:this.landK.slice(),seaK:this.seaK.slice(),rain:this.rain.slice(),snowfall:this.snowfall.slice(),melt:this.melt.slice()};for(const key of stores)result[key]=this[key].slice();return result;}
    restore(s:RefinedCheckpoint) {for(const key of [...stores,'landK','seaK','rain','snowfall','melt'] as const)this[key].set(s[key]);this.lastLand.set(this.model.landTemperatureK);this.lastSea.set(this.model.oceanTemperatureK);this.validate();}
    validate() {
        const p=this.partition,w=this.water,m=this.model;
        for(let k=0;k<w.grid.count;k++) {
            let land=0,sea=0;for(let t=p.offset[k];t<p.offset[k+1];t++){land+=p.land[t];sea+=p.sea[t];}
            if(Math.abs(land-w.land[k])>1e-12||Math.abs(sea-(1-w.land[k]))>1e-12)throw new Error('Refined surface area mismatch');
            for(const kind of stores){let sum=0;for(let t=p.offset[k];t<p.offset[k+1];t++)sum+=this[kind][t];if(Math.abs(sum-w[coarse[kind]][k])>Math.max(1e-8,Math.abs(sum)*1e-10))throw new Error(`Refined ${kind} ledger mismatch`);}
            if(Math.abs(this.meanTemperature(k,false)-m.landTemperatureK[k])>1e-9||Math.abs(this.meanTemperature(k,true)-m.oceanTemperatureK[k])>1e-9)throw new Error('Refined heat ledger mismatch');
        }
    }
}
export function decodeRefinedCheckpoint(value:unknown,n:number):RefinedCheckpoint|null {
    if(value==null)return null;const d=record(value),raw=record(d.partition),level=field(raw.level,'refinement levels',n,1,8);
    if(level.some(q=>q!==1&&q!==4&&q!==8))throw new Error('Invalid refinement level');
    const offset=field(raw.offset,'refinement offsets',n+1,0,MAX_SURFACE_PATCHES);let count=0;
    for(let k=0;k<n;k++){if(offset[k]!==count)throw new Error('Invalid refinement offsets');count+=level[k]**2;}
    if(offset[n]!==count||count>MAX_SURFACE_PATCHES)throw new Error('Invalid refinement size');
    const parents=field(raw.parent,'refinement parent',count,0,n-1);if(parents.some(v=>!Number.isInteger(v)))throw new Error('Invalid refinement parent');
    const p:SurfacePartition={level:Uint8Array.from(level),offset:Int32Array.from(offset),parent:Int32Array.from(parents),land:field(raw.land,'refinement land area',count,0,1),sea:field(raw.sea,'refinement sea area',count,0,1),heightM:field(raw.heightM,'refinement height',count,0,1e6),u:field(raw.u,'refinement longitude',count,0,1),v:field(raw.v,'refinement latitude',count,0,1)};
    for(let k=0;k<n;k++)for(let t=p.offset[k];t<p.offset[k+1];t++)if(p.parent[t]!==k||p.land[t]+p.sea[t]<=0)throw new Error('Invalid refinement ownership');
    const result:any={partition:p};for(const key of [...stores,'landK','seaK','rain','snowfall','melt'] as const)result[key]=field(d[key],`refinement ${key}`,count,0,key.endsWith('K')?1e5:1e30);
    for(let t=0;t<count;t++){if(p.land[t]===0&&(result.snow[t]+result.grounded[t]+result.shelfLand[t]+result.soil[t]>0)||p.sea[t]===0&&(result.ice[t]+result.shelfSea[t]>0))throw new Error('Refined store requires surface');}
    return result;
}
