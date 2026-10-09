import type {ThermalModel} from './thermal.ts';
import type {WaterModel} from './water.ts';
export interface OceanCheckpoint {circulationMps:Float64Array;}

/** Prescribed closed gyres, not a momentum/salinity solver. Each wet plaquette
 * contributes a divergence-free loop. Shared faces cancel before advection. */
export class OceanTransport {
    readonly eastMps:Float64Array;
    readonly northMps:Float64Array;
    readonly heatWm2:Float64Array;
    private readonly faces:{a:number;b:number;east:boolean}[]=[];
    private readonly loops:{faces:number[];cells:number[];latitude:number;longitude:number}[]=[];
    private readonly circulationMps:Float64Array;
    constructor(readonly thermal:ThermalModel,readonly water:WaterModel,readonly dynamic=false) {
        const {grid}=thermal,{width:w,height:h,count:n}=grid;
        this.eastMps=new Float64Array(n);this.northMps=new Float64Array(n);this.heatWm2=new Float64Array(n);
        for(let j=0;j<h;j++)for(let x=0;x<w;x++)this.faces.push({a:j*w+x,b:j*w+(x+1)%w,east:true});
        for(let j=0;j<h-1;j++)for(let x=0;x<w;x++)this.faces.push({a:j*w+x,b:(j+1)*w+x,east:false});
        for(let j=0;j<h-1;j++)for(let x=0;x<w;x++)this.loops.push({
            cells:[j*w+x,j*w+(x+1)%w,(j+1)*w+(x+1)%w,(j+1)*w+x],
            faces:[j*w+x,n+j*w+(x+1)%w,(j+1)*w+x,n+j*w+x],
            latitude:Math.asin(1-2*(j+1)/h),longitude:2*Math.PI*(x+1)/w,
        });
        this.circulationMps=new Float64Array(this.loops.length);
    }
    checkpoint():OceanCheckpoint|null {return this.dynamic?{circulationMps:this.circulationMps.slice()}:null;}
    restore(s:OceanCheckpoint,strengthMps:number) {
        if(!this.dynamic||s.circulationMps.length!==this.loops.length||s.circulationMps.some(v=>!Number.isFinite(v)||Math.abs(v)>strengthMps/4+1e-12))throw new Error('Invalid ocean circulation memory');
        this.circulationMps.set(s.circulationMps);
    }
    step(dt:number,strengthMps:number) {
        const m=this.thermal,w=this.water,n=m.grid.count,length=w.radiusM*Math.sqrt(m.grid.solidAngle);
        const waterCapacity=4.2e6*m.config.oceanDepthM,flow=new Float64Array(this.faces.length),outgoing=new Float64Array(n);
        for(let l=0;l<this.loops.length;l++) {
            const loop=this.loops[l];
            // The global liquid reservoir supplies every wet surface column.
            // Retain wind memory while empty, but no liquid can carry heat.
            const wet=w.oceanGlobalKgM2>0?Math.min(...loop.cells.map(i=>(1-w.land[i])*Math.max(0,1-w.seaIceKgM2[i]/(917*.5*Math.max(1e-12,1-w.land[i]))))):0;
            const wind=loop.cells.reduce((sum,i)=>sum+w.windEastMps[i],0)/4;
            let circulation=strengthMps*Math.tanh(wind/5)*Math.sin(2*loop.latitude)*Math.sin(loop.longitude)*wet/4;
            if(this.dynamic) {
                const [a,b,c,d]=loop.cells,u=w.windEastMps,v=w.windNorthMps;
                const windLoop=(u[a]+u[b]-u[c]-u[d]-v[b]-v[c]+v[d]+v[a])/8;
                const target=strengthMps*Math.tanh(windLoop/2)/4;
                if(dt>0)this.circulationMps[l]+=(target-this.circulationMps[l])*(-Math.expm1(-dt/(5*86400)));
                circulation=this.circulationMps[l]*wet;
            }
            const q=waterCapacity*circulation/length;
            loop.faces.forEach((f,k)=>{flow[f]+=k<2?q:-q;});
        }
        this.faces.forEach((e,k)=>{outgoing[flow[k]>=0?e.a:e.b]+=Math.abs(flow[k]);});
        let scale=1;
        // A paused/restored diagnostic still represents the next fixed-step
        // transport, including its shared donor bound, without advancing memory.
        const transportStepS=dt||Math.min(m.stepS,w.maxStepS);
        for(let i=0;i<n;i++)if(outgoing[i]>0)scale=Math.min(scale,.45*m.capacity[i]/(transportStepS*outgoing[i]));
        this.eastMps.fill(0);this.northMps.fill(0);this.heatWm2.fill(0);
        this.faces.forEach((e,k)=>{
            const q=flow[k]*scale,donor=q>=0?e.a:e.b,heat=q*(m.temperatureK[donor]-273.15);
            this.heatWm2[e.a]-=heat;this.heatWm2[e.b]+=heat;
            const velocity=q/waterCapacity*length,field=e.east?this.eastMps:this.northMps;
            field[e.a]+=(e.east?1:-1)*velocity/2;field[e.b]+=(e.east?1:-1)*velocity/2;
        });
        if(dt>0)m.applyHeat(this.heatWm2.map(q=>q*dt));
    }
}
