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

/** Bounded wind perturbations around the seasonal circulation template.
 * Phi=-25*T/radiationScale removes the authored altitude factor. It is a diagnostic pressure potential
 * (m²/s²), not prognostic pressure or an air-mass/kinetic-energy budget. */
export class AtmosphericCirculation {
    readonly eastMps:Float64Array;readonly northMps:Float64Array;
    constructor(readonly thermal:ThermalModel,readonly water:WaterModel) {
        this.eastMps=new Float64Array(thermal.grid.count);this.northMps=new Float64Array(thermal.grid.count);
    }
    checkpoint():AtmosphereCheckpoint {return {eastMps:this.eastMps.slice(),northMps:this.northMps.slice()};}
    restore(s:AtmosphereCheckpoint) {
        const n=this.thermal.grid.count,limit=Math.abs(this.water.config.windMps)/2;
        if(s.eastMps.length!==n||s.northMps.length!==n||s.eastMps.some((v,i)=>!Number.isFinite(v)||!Number.isFinite(s.northMps[i])||Math.hypot(v,s.northMps[i])>limit+1e-9))throw new Error('Invalid circulation perturbation');
        this.eastMps.set(s.eastMps);this.northMps.set(s.northMps);
    }
    validateWinds(timeS:number) {
        const m=this.thermal,w=this.water,limit=Math.abs(w.config.windMps),base=circulationWinds(m.grid,m.planet,m.orbit,timeS,w.land,w.config.windMps);
        for(let i=0;i<m.grid.count;i++)if(Math.abs(w.windEastMps[i]-Math.max(-limit,Math.min(limit,base.eastMps[i]+this.eastMps[i])))>1e-10||Math.abs(w.windNorthMps[i]-Math.max(-limit,Math.min(limit,base.northMps[i]+this.northMps[i])))>1e-10)throw new Error('Saved wind does not match circulation memory');
    }
    step(dt:number,timeS:number) {
        if(dt===0)return;
        const m=this.thermal,w=this.water,g=m.grid,{width,height}=g,r=m.planet.radiusM,limit=Math.abs(w.config.windMps);
        const phi=m.temperatureK.map((t,i)=>-25*t/m.radiationScale[i]);
        const wind=circulationWinds(g,m.planet,m.orbit,timeS,w.land,w.config.windMps);
        const omega=2*Math.PI/m.planet.siderealPeriodS*(m.planet.retrograde?-1:1);
        for(let j=0;j<height;j++)for(let x=0;x<width;x++) {
            const i=j*width+x,lat=Math.asin(g.sinLat[j]),west=j*width+(x+width-1)%width,east=j*width+(x+1)%width;
            const north=Math.max(0,j-1)*width+x,south=Math.min(height-1,j+1)*width+x;
            const dx=2*r*Math.cos(lat)*2*Math.PI/width,dy=r*(Math.asin(g.sinLat[Math.max(0,j-1)])-Math.asin(g.sinLat[Math.min(height-1,j+1)]));
            const ax=-(phi[east]-phi[west])/dx,ay=-(phi[north]-phi[south])/dy;
            let [u,v]=rotatingDrag(this.eastMps[i],this.northMps[i],ax,ay,2*omega*g.sinLat[j],(1+2*w.land[i])/(2*86400),dt);
            const scale=Math.min(1,(limit/2)/Math.max(1e-30,Math.hypot(u,v)));u*=scale;v*=scale;
            this.eastMps[i]=u;this.northMps[i]=v;
            wind.eastMps[i]=Math.max(-limit,Math.min(limit,wind.eastMps[i]+u));wind.northMps[i]=Math.max(-limit,Math.min(limit,wind.northMps[i]+v));
        }
        w.setWinds(wind.eastMps,wind.northMps);
    }
}
