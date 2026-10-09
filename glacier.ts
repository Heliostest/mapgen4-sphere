import type {WaterModel} from './water.ts';
import {finiteInRange} from './planet.ts';
export const ICE_DENSITY=917,GLACIER_YEAR=365.25*86400;
export interface GlacierCheckpoint {erodedM:Float64Array;sedimentM:Float64Array;depositedM:Float64Array;speedMps:Float64Array;outflowM3S:Float64Array;limitedCells:number;}
/** Coarse grounded ice, without shelves, calving or a full stress balance.
 * Ice is exclusively the WaterModel landIce ledger; solid fields are separate. */
export class GlacierModel {
    readonly erodedM:Float64Array;readonly sedimentM:Float64Array;readonly depositedM:Float64Array;
    readonly speedMps:Float64Array;readonly outflowM3S:Float64Array;limitedCells=0;
    private readonly distances:Float64Array;
    constructor(readonly water:WaterModel,readonly gravityMps2:number) {
        const {grid,radiusM}=water,n=grid.count;finiteInRange(gravityMps2,'ice gravity',Number.MIN_VALUE);
        this.erodedM=new Float64Array(n);this.sedimentM=new Float64Array(n);this.depositedM=new Float64Array(n);this.speedMps=new Float64Array(n);this.outflowM3S=new Float64Array(n);
        const xyz=Array.from({length:n},(_,i)=>{const y=grid.sinLat[Math.floor(i/grid.width)],lon=2*Math.PI*((i%grid.width+.5)/grid.width-.5),r=Math.sqrt(1-y*y);return [r*Math.sin(lon),y,r*Math.cos(lon)];});
        this.distances=Float64Array.from(grid.edges,e=>radiusM*Math.acos(Math.max(-1,Math.min(1,xyz[e.a].reduce((s,v,i)=>s+v*xyz[e.b][i],0)))));
    }
    thickness(i:number) {const w=this.water;return w.land[i]>0?w.landIceKgM2[i]/(ICE_DENSITY*w.land[i]):0;}
    step(dt:number,temperatureK:ArrayLike<number>) {
        finiteInRange(dt,'glacier step',Number.MIN_VALUE);const w=this.water,n=w.grid.count;
        const compact=-Math.expm1(-dt/(30*GLACIER_YEAR));
        for(let i=0;i<n;i++)if(w.land[i]>0&&temperatureK[i]<273.15) {
            const amount=Math.max(0,w.snowKgM2[i]-50*w.land[i])*compact;
            w.snowKgM2[i]-=amount;w.addLandIce(i,amount);
        }
        const flux=new Float64Array(w.grid.edges.length),outgoing=new Float64Array(n),widths=new Float64Array(flux.length);
        this.speedMps.fill(0);this.outflowM3S.fill(0);this.limitedCells=0;
        w.grid.edges.forEach((e,k)=>{
            if(w.land[e.a]<=0||w.land[e.b]<=0)return;
            const ha=w.heightM[e.a]+this.thickness(e.a),hb=w.heightM[e.b]+this.thickness(e.b),from=ha>hb?e.a:e.b,to=ha>hb?e.b:e.a,H=this.thickness(from);
            if(H<=0||ha===hb)return;
            const distance=this.distances[k],slope=Math.abs(ha-hb)/distance;
            const softness=2.4e-24*Math.exp(Math.max(-4,Math.min(0,(temperatureK[from]-273.15)*.08)));
            // n=3 depth-averaged deformation speed, capped at 20 km/year.
            const speed=Math.min(20000/GLACIER_YEAR,2*softness/5*(ICE_DENSITY*this.gravityMps2)**3*H**4*slope**3);
            widths[k]=e.geometry*distance*Math.min(w.land[from],w.land[to]);
            const requested=dt*speed*H*widths[k]*ICE_DENSITY/w.cellAreaM2;
            const equalize=Math.abs(ha-hb)/(1/(ICE_DENSITY*w.land[from])+1/(ICE_DENSITY*w.land[to]));
            const amount=Math.min(requested,.25*equalize);if(amount<requested)this.limitedCells++;
            flux[k]=(from===e.a?1:-1)*amount;outgoing[from]+=amount;
        });
        const factors=outgoing.map((v,i)=>v>0?Math.min(1,.45*w.landIceKgM2[i]/v):1),delta=new Float64Array(n),solidDelta=new Float64Array(n);
        w.grid.edges.forEach((e,k)=>{
            const from=flux[k]>=0?e.a:e.b,to=flux[k]>=0?e.b:e.a,amount=Math.abs(flux[k])*factors[from];if(amount<=0)return;
            delta[from]-=amount;delta[to]+=amount;
            const solid=this.sedimentM[from]*amount/w.landIceKgM2[from];solidDelta[from]-=solid;solidDelta[to]+=solid;
            const flow=amount*w.cellAreaM2/(ICE_DENSITY*dt);this.outflowM3S[from]+=flow;
            this.speedMps[from]=Math.max(this.speedMps[from],flow/(this.thickness(from)*widths[k]));
        });
        for(let i=0;i<n;i++) {
            w.addLandIce(i,delta[i]);this.sedimentM[i]+=solidDelta[i];
            const H=this.thickness(i),erode=Math.min(Math.max(0,w.heightM[i]-this.erodedM[i]),dt*this.speedMps[i]*1e-4*H/(H+50));
            this.erodedM[i]+=erode;this.sedimentM[i]+=erode*w.land[i];
            if(w.landIceKgM2[i]===0){this.depositedM[i]+=this.sedimentM[i];this.sedimentM[i]=0;}
        }
    }
    checkpoint():GlacierCheckpoint {return {erodedM:this.erodedM.slice(),sedimentM:this.sedimentM.slice(),depositedM:this.depositedM.slice(),speedMps:this.speedMps.slice(),outflowM3S:this.outflowM3S.slice(),limitedCells:this.limitedCells};}
    restore(s:GlacierCheckpoint) {
        for(const key of ['erodedM','sedimentM','depositedM','speedMps','outflowM3S'] as const) {
            if(s[key].length!==this.water.grid.count||s[key].some(v=>!Number.isFinite(v)||v<0))throw new Error('Invalid glacial field');
        }
        if(s.erodedM.some((v,i)=>v>this.water.heightM[i]+1e-8))throw new Error('Glacial erosion exceeds available bed');
        if(!Number.isInteger(s.limitedCells)||s.limitedCells<0||s.limitedCells>this.water.grid.edges.length)throw new Error('Invalid glacier limiter count');
        if(s.erodedM.some((v,i)=>this.water.land[i]===0&&(v!==0||s.sedimentM[i]!==0||s.depositedM[i]!==0||s.speedMps[i]!==0||s.outflowM3S[i]!==0)))throw new Error('Grounded glacier state requires land');
        const residual=s.erodedM.reduce((sum,v,i)=>sum-v*this.water.land[i]+s.sedimentM[i]+s.depositedM[i],0),solid=s.erodedM.reduce((sum,v,i)=>sum+v*this.water.land[i],0);
        if(Math.abs(residual)>Math.max(1e-9,solid*1e-10))throw new Error('Glacial solid budget mismatch');
        for(const key of ['erodedM','sedimentM','depositedM','speedMps','outflowM3S'] as const)this[key].set(s[key]);this.limitedCells=s.limitedCells;
    }
    diagnostics() {
        const w=this.water;let maxThicknessM=0,maxSpeedMyr=0,solidResidualM=0,mobileM=0,depositedM=0;
        for(let i=0;i<w.grid.count;i++){maxThicknessM=Math.max(maxThicknessM,this.thickness(i));maxSpeedMyr=Math.max(maxSpeedMyr,this.speedMps[i]*GLACIER_YEAR);solidResidualM+=-this.erodedM[i]*w.land[i]+this.sedimentM[i]+this.depositedM[i];mobileM+=this.sedimentM[i];depositedM+=this.depositedM[i];}
        return {maxThicknessM,maxSpeedMyr,solidResidualM:solidResidualM/w.grid.count,mobileKm3:mobileM*w.cellAreaM2/1e9,depositedKm3:depositedM*w.cellAreaM2/1e9,limitedCells:this.limitedCells};
    }
}
