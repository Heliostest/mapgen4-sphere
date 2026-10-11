import type {ThermalModel} from './thermal.ts';
import type {WaterModel} from './water.ts';
import {circulationWinds} from './climate.ts';

export interface AtmosphereCheckpoint {eastMps:Float64Array;northMps:Float64Array;}
/** Exact constant-force linear drag + Coriolis update. East/north positive. */
export function rotatingDrag(u:number,v:number,ax:number,ay:number,f:number,drag:number,dt:number):[number,number] {
    const d=drag*drag+f*f;if(d===0)return [u+ax*dt,v+ay*dt];
    const x=(drag*ax+f*ay)/d,y=(drag*ay-f*ax)/d,decay=Math.exp(-drag*dt),c=Math.cos(f*dt),s=Math.sin(f*dt);
    return [x+decay*(c*(u-x)+s*(v-y)),y+decay*(c*(v-y)-s*(u-x))];
}

/** Bounded saved offsets from the seasonal template. Transport relaxes the
 * actual low-level wind toward its zonal branch; meridional flow is driven by
 * marine latitude heating and local surface-air buoyancy, not latent energy.
 * This remains a diagnostic potential, not prognostic pressure or an
 * air-mass/kinetic-energy budget. */
export class AtmosphericCirculation {
    readonly eastMps:Float64Array;readonly northMps:Float64Array;
    constructor(readonly thermal:ThermalModel,readonly water:WaterModel) {
        this.eastMps=new Float64Array(thermal.grid.count);this.northMps=new Float64Array(thermal.grid.count);
    }
    checkpoint():AtmosphereCheckpoint {return {eastMps:this.eastMps.slice(),northMps:this.northMps.slice()};}
    restore(s:AtmosphereCheckpoint) {
        const n=this.thermal.grid.count,limit=this.perturbationLimit;
        if(s.eastMps.length!==n||s.northMps.length!==n||s.eastMps.some((v,i)=>!Number.isFinite(v)||!Number.isFinite(s.northMps[i])||Math.hypot(v,s.northMps[i])>limit+1e-9))throw new Error('Invalid circulation perturbation');
        this.eastMps.set(s.eastMps);this.northMps.set(s.northMps);
    }
    private get perturbationLimit(){return Math.abs(this.water.config.windMps)*(this.water.config.moistureScheme==='transport'&&this.thermal.config.separateReservoirs?1.5:.5);}
    validateWinds(timeS:number) {
        const m=this.thermal,w=this.water,limit=Math.abs(w.config.windMps),base=circulationWinds(m.grid,m.planet,m.orbit,timeS,w.land,w.config.windMps);
        for(let i=0;i<m.grid.count;i++)if(Math.abs(w.windEastMps[i]-Math.max(-limit,Math.min(limit,base.eastMps[i]+this.eastMps[i])))>1e-10||Math.abs(w.windNorthMps[i]-Math.max(-limit,Math.min(limit,base.northMps[i]+this.northMps[i])))>1e-10)throw new Error('Saved wind does not match circulation memory');
    }
    step(dt:number,timeS:number) {
        if(dt===0)return;
        const m=this.thermal,w=this.water,g=m.grid,{width,height}=g,r=m.planet.radiusM,limit=Math.abs(w.config.windMps);
        // Compare surface parcels at a common altitude. The prescribed lapse
        // in the land radiation law is not a regional pressure anomaly.
        const modern=w.config.moistureScheme==='transport'&&m.config.separateReservoirs;
        const virtual=m.temperatureK.map((_,i)=>{const mixing=w.atmosphereKgM2[i]/(m.capacity[i]/1004);return (mixing+.622)/(.622*(1+mixing));});
        const marine=new Float64Array(height),weight=new Float64Array(height),terrestrial=new Float64Array(height);
        if(modern){
            for(let j=0;j<height;j++)for(let x=0;x<width;x++){
                const i=j*width+x;weight[j]+=1-w.land[i];marine[j]+=(1-w.land[i])*m.oceanTemperatureK[i]*virtual[i];terrestrial[j]+=m.landTemperatureK[i]/m.radiationScale[i]*virtual[i]/width;
            }
            for(let j=0;j<height;j++)if(weight[j]>0)marine[j]/=weight[j];
            for(let j=0;j<height;j++)if(weight[j]===0){
                let north=j-1,south=j+1;while(north>=0&&weight[north]===0)north--;while(south<height&&weight[south]===0)south++;
                marine[j]=north>=0&&south<height?marine[north]+(marine[south]-marine[north])*(g.sinLat[j]-g.sinLat[north])/(g.sinLat[south]-g.sinLat[north]):terrestrial[j];
            }
        }
        const phi=m.temperatureK.map((t,i)=>{
            if(!modern)return -25*t/m.radiationScale[i];
            const parcel=w.land[i]*m.landTemperatureK[i]+(1-w.land[i])*m.oceanTemperatureK[i];
            // C_air/cp is the same illustrative dry column mass used by the
            // thermal reservoir. Vapor changes density through T_virtual;
            // its latent heat enters sensible energy only when it condenses.
            return -50*(marine[Math.floor(i/width)]+Math.max(0,parcel*virtual[i]-t));
        });
        const wind=circulationWinds(g,m.planet,m.orbit,timeS,w.land,w.config.windMps);
        const omega=2*Math.PI/m.planet.siderealPeriodS*(m.planet.retrograde?-1:1);
        for(let j=0;j<height;j++)for(let x=0;x<width;x++) {
            const i=j*width+x,lat=Math.asin(g.sinLat[j]),west=j*width+(x+width-1)%width,east=j*width+(x+1)%width;
            const north=Math.max(0,j-1)*width+x,south=Math.min(height-1,j+1)*width+x;
            const dx=2*r*Math.cos(lat)*2*Math.PI/width,dy=r*(Math.asin(g.sinLat[Math.max(0,j-1)])-Math.asin(g.sinLat[Math.min(height-1,j+1)]));
            const ax=-(phi[east]-phi[west])/dx,ay=-(phi[north]-phi[south])/dy;
            const drag=(1+2*w.land[i])/((modern?.25:2)*86400),coriolis=2*omega*g.sinLat[j];
            // Preserve the original template as the checkpoint convention.
            // In transport mode evolve prior *applied* winds, not offsets
            // around a prescribed meridional flow. The balanced zonal target
            // is balanced by its unresolved pressure gradient; the exact
            // update turns the departures from that balanced zonal branch.
            // Thermal means
            // must remain in phi: removing each latitude's mean erases the
            // resolved summer/winter meridional pressure gradient.
            let [u,v]=modern
                ?rotatingDrag(w.windEastMps[i]-wind.eastMps[i],w.windNorthMps[i],ax,ay,coriolis,drag,dt)
                :rotatingDrag(this.eastMps[i],this.northMps[i],ax,ay,coriolis,drag,dt);
            if(modern)v-=wind.northMps[i];
            const scale=Math.min(1,this.perturbationLimit/Math.max(1e-30,Math.hypot(u,v)));u*=scale;v*=scale;
            this.eastMps[i]=u;this.northMps[i]=v;
            wind.eastMps[i]=Math.max(-limit,Math.min(limit,wind.eastMps[i]+u));wind.northMps[i]=Math.max(-limit,Math.min(limit,wind.northMps[i]+v));
        }
        w.setWinds(wind.eastMps,wind.northMps);
    }
}
