import {finiteInRange} from './planet.ts';
import type {ThermalGrid} from './thermal.ts';

export interface GeomorphConfig {erodibilityMYr:number;diffusivityM2Yr:number;settlingYears:number;}
export const DEFAULT_GEOMORPH:Readonly<GeomorphConfig>=Object.freeze({erodibilityMYr:1,diffusivityM2Yr:1e4,settlingYears:10000});
export interface GeomorphCheckpoint {heightM:Float64Array;mobileM:Float64Array;oceanSedimentM:number;years:number;}
/** Equal bulk density: solid volume is conserved. Mobile columns are per whole
 * cell, bed height per land area, and the ocean store per global area. */
export class GeomorphModel {
    readonly land:Float64Array;readonly baseHeightM:Float64Array;readonly heightM:Float64Array;
    readonly dischargeM3S:Float64Array;readonly mobileM:Float64Array;
    readonly config:GeomorphConfig;readonly cellAreaM2:number;readonly initialTotalM:number;
    oceanSedimentM=0;years=0;stepYears:number;
    private readonly delta:Float64Array;
    private readonly conductance:Float64Array;
    private readonly neighbors:{cell:number;distance:number}[][];
    constructor(readonly grid:ThermalGrid,readonly radiusM:number,land:ArrayLike<number>,height:ArrayLike<number>,discharge:ArrayLike<number>,config:GeomorphConfig) {
        finiteInRange(radiusM,'erosion radius',1);
        finiteInRange(config.erodibilityMYr,'erodibility',0,100);finiteInRange(config.diffusivityM2Yr,'solid diffusivity',0,1e7);
        finiteInRange(config.settlingYears,'settling years',1,1e6);
        if([land,height,discharge].some(a=>a.length!==grid.count))throw new RangeError('Geomorph grid mismatch');
        this.config={...config};
        this.land=Float64Array.from(land,v=>{finiteInRange(v,'land fraction',0,1);return v;});
        this.baseHeightM=Float64Array.from(height,(v,i)=>{finiteInRange(v,'bed height',0,1e6);return land[i]>0?v:0;});
        this.heightM=this.baseHeightM.slice();
        this.dischargeM3S=Float64Array.from(discharge,v=>{finiteInRange(v,'captured discharge',0,1e30);return v;});
        this.mobileM=new Float64Array(grid.count);this.delta=new Float64Array(grid.count);
        this.cellAreaM2=grid.solidAngle*radiusM**2;
        const xyz=Array.from({length:grid.count},(_,i)=>{
            const y=grid.sinLat[Math.floor(i/grid.width)],a=2*Math.PI*((i%grid.width+.5)/grid.width-.5),r=Math.sqrt(1-y*y);
            return [r*Math.sin(a),y,r*Math.cos(a)];
        });
        this.neighbors=Array.from({length:grid.count},()=>[]);
        this.conductance=new Float64Array(grid.edges.length);const loss=new Float64Array(grid.count);
        let shortest=Math.sqrt(this.cellAreaM2);
        grid.edges.forEach((e,k)=>{
            const dot=xyz[e.a].reduce((sum,v,i)=>sum+v*xyz[e.b][i],0),distance=radiusM*Math.acos(Math.max(-1,Math.min(1,dot)));
            shortest=Math.min(shortest,distance);this.neighbors[e.a].push({cell:e.b,distance});this.neighbors[e.b].push({cell:e.a,distance});
            const c=config.diffusivityM2Yr*e.geometry*Math.min(land[e.a],land[e.b])/this.cellAreaM2;
            this.conductance[k]=c;
            if(land[e.a]>0)loss[e.a]+=c/land[e.a];if(land[e.b]>0)loss[e.b]+=c/land[e.b];
        });
        const strength=Math.sqrt(Math.max(...this.dischargeM3S)/1000),maxLoss=Math.max(...loss);
        this.stepYears=Math.min(2500,.2*config.settlingYears,.2*config.settlingYears/Math.max(1,strength),
            maxLoss>0?.2/maxLoss:Infinity,config.erodibilityMYr*strength>0?.2*shortest/(config.erodibilityMYr*strength):Infinity);
        this.initialTotalM=this.total();
    }
    private total(){return this.oceanSedimentM+this.heightM.reduce((s,h,i)=>s+h*this.land[i]+this.mobileM[i],0)/this.grid.count;}
    private outlet(i:number) {
        const h=this.heightM[i];let target=-1,slope=0,fraction=0;
        if(this.land[i]<1&&h>0){target=-2;slope=h/Math.sqrt(this.cellAreaM2);fraction=1-this.land[i];}
        for(const e of this.neighbors[i]) {
            const f=this.land[e.cell],landSlope=(h-this.heightM[e.cell])/e.distance,seaSlope=h/e.distance;
            if(f>0&&landSlope>slope){target=e.cell;slope=landSlope;fraction=f;}
            if(f<1&&seaSlope>slope){target=-2;slope=seaSlope;fraction=1-f;}
        }
        return {target,slope,fraction};
    }
    step(dt=this.stepYears) {
        finiteInRange(dt,'geological substep',Number.MIN_VALUE,this.stepYears*(1+1e-10));
        const {heightM:h,land,grid,config}=this;
        this.delta.fill(0);
        grid.edges.forEach((e,k)=>{const v=dt*this.conductance[k]*(h[e.a]-h[e.b]);this.delta[e.a]-=v;this.delta[e.b]+=v;});
        for(let i=0;i<grid.count;i++)if(land[i]>0)h[i]+=this.delta[i]/land[i];
        // All routes use the same pre-incision bed, independent of cell order.
        const routes=Array.from({length:grid.count},(_,i)=>this.outlet(i));
        for(let i=0;i<grid.count;i++)if(land[i]>0) {
            const r=routes[i],cut=Math.min(h[i],dt*config.erodibilityMYr*Math.sqrt(this.dischargeM3S[i]/1000)*r.slope*r.fraction);
            h[i]-=cut;this.mobileM[i]+=cut*land[i];
        }
        this.delta.fill(0);
        for(let i=0;i<grid.count;i++)if(land[i]>0) {
            const r=routes[i];if(r.target===-1)continue;
            const amount=this.mobileM[i]*(-Math.expm1(-dt*Math.sqrt(this.dischargeM3S[i]/1000)/config.settlingYears))*r.fraction;
            this.delta[i]-=amount;
            if(r.target===-2)this.oceanSedimentM+=amount/grid.count;else this.delta[r.target]+=amount;
        }
        const settling=-Math.expm1(-dt/config.settlingYears);
        for(let i=0;i<grid.count;i++)if(land[i]>0) {
            this.mobileM[i]+=this.delta[i];const deposit=this.mobileM[i]*settling;
            this.mobileM[i]-=deposit;h[i]+=deposit/land[i];
        }
        this.years+=dt;
    }
    advance(years:number,maxSteps=32) {
        finiteInRange(years,'requested geological years',0,1e8);finiteInRange(maxSteps,'geological work limit',1,32);
        const requested=Math.floor(years/this.stepYears+1e-10),steps=Math.min(requested,Math.floor(maxSteps));
        for(let i=0;i<steps;i++)this.step();
        return {steps,advancedYears:steps*this.stepYears,limited:requested>steps};
    }
    checkpoint():GeomorphCheckpoint{return {heightM:this.heightM.slice(),mobileM:this.mobileM.slice(),oceanSedimentM:this.oceanSedimentM,years:this.years};}
    restore(c:GeomorphCheckpoint){this.heightM.set(c.heightM);this.mobileM.set(c.mobileM);this.oceanSedimentM=c.oceanSedimentM;this.years=c.years;}
    diagnostics(){
        const change=this.heightM.map((h,i)=>h-this.baseHeightM[i]),totalM=this.total();
        return {years:this.years,totalM,residualMm:1000*(totalM-this.initialTotalM),minChangeM:Math.min(...change),maxChangeM:Math.max(...change),
            mobileKm3:this.mobileM.reduce((a,b)=>a+b,0)*this.cellAreaM2/1e9,oceanKm3:this.oceanSedimentM*this.grid.count*this.cellAreaM2/1e9};
    }
}
