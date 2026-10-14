import type {ThermalModel} from './thermal.ts';
import type {WaterModel} from './water.ts';
import {circulationWinds} from './climate.ts';
import {derivePlanet} from './planet.ts';
import {isCirculationScheme,fullWindDrag,circulationOffsetFactor,type CirculationScheme} from './circulation-scheme.ts';
export type {CirculationScheme} from './circulation-scheme.ts';

export interface AtmosphereCheckpoint {eastMps:Float64Array;northMps:Float64Array;}
/** Exact constant-force linear drag + Coriolis update. East/north positive. */
export function rotatingDrag(u:number,v:number,ax:number,ay:number,f:number,drag:number,dt:number):[number,number] {
    const d=drag*drag+f*f;if(d===0)return [u+ax*dt,v+ay*dt];
    const x=(drag*ax+f*ay)/d,y=(drag*ay-f*ax)/d,decay=Math.exp(-drag*dt),c=Math.cos(f*dt),s=Math.sin(f*dt);
    return [x+decay*(c*(u-x)+s*(v-y)),y+decay*(c*(v-y)-s*(u-x))];
}

/** Saved offsets retain the seasonal template's checkpoint convention.
 * Explicit pressure schemes evolve actual wind; balanced schemes represent
 * unresolved band-scale pressure through a marine background force. Absent
 * a scheme, the original departure equation is unchanged. None of these
 * diagnostic closures forecasts pressure, dry air mass or kinetic energy. */
export class AtmosphericCirculation {
    readonly eastMps:Float64Array;readonly northMps:Float64Array;
    constructor(readonly thermal:ThermalModel,readonly water:WaterModel,readonly scheme?:CirculationScheme,readonly boundaryLayerDepthM?:number,readonly pressureLayerDepthM?:number) {
        if(scheme!==undefined&&!isCirculationScheme(scheme))throw new Error('Invalid circulation scheme');
        if(scheme&&(!thermal.config.separateReservoirs||water.config.moistureScheme!=='transport'))throw new Error('Pressure circulation requires separate transport reservoirs');
        if(boundaryLayerDepthM!==undefined&&(!fullWindDrag(scheme)||!Number.isFinite(boundaryLayerDepthM)||boundaryLayerDepthM<100||boundaryLayerDepthM>5000))throw new Error('Invalid pressure boundary-layer depth');
        if(pressureLayerDepthM!==undefined&&(!scheme||!Number.isFinite(pressureLayerDepthM)||pressureLayerDepthM<100||pressureLayerDepthM>5000))throw new Error('Invalid thermal pressure-layer depth');
        this.eastMps=new Float64Array(thermal.grid.count);this.northMps=new Float64Array(thermal.grid.count);
    }
    checkpoint():AtmosphereCheckpoint {return {eastMps:this.eastMps.slice(),northMps:this.northMps.slice()};}
    restore(s:AtmosphereCheckpoint) {
        const n=this.thermal.grid.count,limit=this.perturbationLimit;
        if(s.eastMps.length!==n||s.northMps.length!==n||s.eastMps.some((v,i)=>!Number.isFinite(v)||!Number.isFinite(s.northMps[i])||Math.hypot(v,s.northMps[i])>limit+1e-9))throw new Error('Invalid circulation perturbation');
        this.eastMps.set(s.eastMps);this.northMps.set(s.northMps);
    }
    private get fullDrag(){return fullWindDrag(this.scheme);}
    private get balanced(){return this.scheme==='balanced-pressure'||this.scheme==='boundary-pressure';}
    private get perturbationLimit(){return Math.abs(this.water.config.windMps)*circulationOffsetFactor(this.scheme,this.water.config.moistureScheme==='transport'&&!!this.thermal.config.separateReservoirs);}
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
        // Hydrostatic integration of a shallow heated layer at fixed top
        // pressure gives |delta Phi| ~ g H |delta T_v|/T_ref. The original
        // diagnostic 50 is retained unless an explicit physical depth is set.
        const pressureScale=this.pressureLayerDepthM===undefined?50:derivePlanet(m.planet).gravityMps2*this.pressureLayerDepthM/288.15;
        const virtual=m.temperatureK.map((_,i)=>{const mixing=w.atmosphereKgM2[i]/(m.capacity[i]/1004);return (mixing+.622)/(.622*(1+mixing));});
        const commonSurface=m.temperatureK.map((_,i)=>(w.land[i]*m.landTemperatureK[i]/m.radiationScale[i]+(1-w.land[i])*m.oceanTemperatureK[i])*virtual[i]);
        const boundary=m.temperatureK.map((t,i)=>commonSurface[i]-t*(w.land[i]/m.radiationScale[i]**4+1-w.land[i])**.25*virtual[i]);
        const marineBoundary=new Float64Array(height);
        const marine=new Float64Array(height),weight=new Float64Array(height),terrestrial=new Float64Array(height);
        if(modern){
            for(let j=0;j<height;j++)for(let x=0;x<width;x++){
                const i=j*width+x;weight[j]+=1-w.land[i];marine[j]+=(1-w.land[i])*m.oceanTemperatureK[i]*virtual[i];marineBoundary[j]+=(1-w.land[i])*boundary[i];terrestrial[j]+=m.landTemperatureK[i]/m.radiationScale[i]*virtual[i]/width;
            }
            for(let j=0;j<height;j++)if(weight[j]>0){marine[j]/=weight[j];marineBoundary[j]/=weight[j];}
            for(let j=0;j<height;j++)if(weight[j]===0){
                let north=j-1,south=j+1;while(north>=0&&weight[north]===0)north--;while(south<height&&weight[south]===0)south++;
                marine[j]=north>=0&&south<height?marine[north]+(marine[south]-marine[north])*(g.sinLat[j]-g.sinLat[north])/(g.sinLat[south]-g.sinLat[north]):terrestrial[j];
                marineBoundary[j]=north>=0&&south<height?marineBoundary[north]+(marineBoundary[south]-marineBoundary[north])*(g.sinLat[j]-g.sinLat[north])/(g.sinLat[south]-g.sinLat[north]):0;
            }
        }
        const phi=m.temperatureK.map((t,i)=>{
            if(!modern)return -25*t/m.radiationScale[i];
            if(this.balanced){
                // The band-scale background pressure is represented once by
                // its balanced marine wind below. These signed local thermal
                // anomalies supply land-sea forcing without also adding the
                // same meridional background gradient a second time.
                const row=Math.floor(i/width);
                return -pressureScale*(this.scheme==='boundary-pressure'?boundary[i]-marineBoundary[row]:commonSurface[i]-marine[row]);
            }
            if(this.scheme==='signed-pressure'||this.scheme==='thermal-pressure'){
                // Diagnostic thermal-low potential at common altitude. A cold
                // land anomaly is a high, not zero forcing. Local surface-air
                // disequilibrium is not the land-sea pressure contrast. This
                // uses the selected illustrative or hydrostatic depth scale;
                // it is not a prognostic dry-air mass or pressure budget.
                return -pressureScale*commonSurface[i];
            }
            const parcel=w.land[i]*m.landTemperatureK[i]+(1-w.land[i])*m.oceanTemperatureK[i];
            // C_air/cp is the same illustrative dry column mass used by the
            // thermal reservoir. Vapor changes density through T_virtual;
            // its latent heat enters sensible energy only when it condenses.
            return -pressureScale*(marine[Math.floor(i/width)]+Math.max(0,parcel*virtual[i]-t));
        });
        const wind=circulationWinds(g,m.planet,m.orbit,timeS,w.land,w.config.windMps);
        const background=this.balanced?circulationWinds(g,m.planet,m.orbit,timeS,new Float64Array(g.count),w.config.windMps):null;
        const omega=2*Math.PI/m.planet.siderealPeriodS*(m.planet.retrograde?-1:1);
        for(let j=0;j<height;j++)for(let x=0;x<width;x++) {
            const i=j*width+x,lat=Math.asin(g.sinLat[j]),west=j*width+(x+width-1)%width,east=j*width+(x+1)%width;
            const north=Math.max(0,j-1)*width+x,south=Math.min(height-1,j+1)*width+x;
            const dx=2*r*Math.cos(lat)*2*Math.PI/width,dy=r*(Math.asin(g.sinLat[Math.max(0,j-1)])-Math.asin(g.sinLat[Math.min(height-1,j+1)]));
            const ax=-(phi[east]-phi[west])/dx,ay=-(phi[north]-phi[south])/dy;
            const drag=(1+2*w.land[i])/((modern?.25:2)*86400),coriolis=2*omega*g.sinLat[j];
            const stress=this.boundaryLayerDepthM===undefined?0:((1-w.land[i])*.0013+w.land[i]*.003)/this.boundaryLayerDepthM;
            const beforeDrag=this.boundaryLayerDepthM===undefined?1:1/(1+stress*Math.hypot(w.windEastMps[i],w.windNorthMps[i])*dt/2);
            const bg=background?.eastMps[i]??0,marineDrag=this.boundaryLayerDepthM===undefined?1/(.25*86400):.0013*Math.abs(bg)/this.boundaryLayerDepthM;
            // Actual-velocity schemes include full friction and, when
            // selected, the explicit balanced background force. Legacy
            // transport keeps its departure equation and latitude heating.
            let [u,v]=this.fullDrag
                ?rotatingDrag(w.windEastMps[i]*beforeDrag,w.windNorthMps[i]*beforeDrag,ax+bg*marineDrag,ay+coriolis*bg,coriolis,this.boundaryLayerDepthM===undefined?drag:0,dt)
                :modern
                ?rotatingDrag(w.windEastMps[i]-wind.eastMps[i],w.windNorthMps[i],ax,ay,coriolis,drag,dt)
                :rotatingDrag(this.eastMps[i],this.northMps[i],ax,ay,coriolis,drag,dt);
            if(this.fullDrag){
                if(this.boundaryLayerDepthM!==undefined){
                    // tau/rho = C_D |V| V; integrating drag over depth H gives
                    // dV/dt = -C_D |V| V/H. Exact positive half-steps surround
                    // the forced Coriolis update. Drag always dissipates
                    // actual wind; it cannot invent kinetic energy at rest.
                    const afterDrag=1/(1+stress*Math.hypot(u,v)*dt/2);u*=afterDrag;v*=afterDrag;
                }
                // Friction acts on actual velocity. Balanced schemes supply
                // the explicit background force above; other full-wind
                // schemes are unforced except for their thermal potential.
                // The old template remains the checkpoint convention.
                // Component bounds imply |offset| < 2.5*wind limit even for
                // a genuine reversal relative to the seasonal template.
                u=Math.max(-limit,Math.min(limit,u));v=Math.max(-limit,Math.min(limit,v));
                this.eastMps[i]=u-wind.eastMps[i];this.northMps[i]=v-wind.northMps[i];
                wind.eastMps[i]=u;wind.northMps[i]=v;continue;
            }
            if(modern)v-=wind.northMps[i];
            const scale=Math.min(1,this.perturbationLimit/Math.max(1e-30,Math.hypot(u,v)));u*=scale;v*=scale;
            this.eastMps[i]=u;this.northMps[i]=v;
            wind.eastMps[i]=Math.max(-limit,Math.min(limit,wind.eastMps[i]+u));wind.northMps[i]=Math.max(-limit,Math.min(limit,wind.northMps[i]+v));
        }
        w.setWinds(wind.eastMps,wind.northMps);
    }
}
