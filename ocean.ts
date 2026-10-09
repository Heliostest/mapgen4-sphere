import type {ThermalModel} from './thermal.ts';
import type {WaterModel} from './water.ts';

/** Prescribed closed gyres, not a momentum/salinity solver. Each wet plaquette
 * contributes a divergence-free loop. Shared faces cancel before advection. */
export class OceanTransport {
    readonly eastMps:Float64Array;
    readonly northMps:Float64Array;
    readonly heatWm2:Float64Array;
    private readonly faces:{a:number;b:number;east:boolean}[]=[];
    private readonly loops:{faces:number[];cells:number[];latitude:number;longitude:number}[]=[];
    constructor(readonly thermal:ThermalModel,readonly water:WaterModel) {
        const {grid}=thermal,{width:w,height:h,count:n}=grid;
        this.eastMps=new Float64Array(n);this.northMps=new Float64Array(n);this.heatWm2=new Float64Array(n);
        for(let j=0;j<h;j++)for(let x=0;x<w;x++)this.faces.push({a:j*w+x,b:j*w+(x+1)%w,east:true});
        for(let j=0;j<h-1;j++)for(let x=0;x<w;x++)this.faces.push({a:j*w+x,b:(j+1)*w+x,east:false});
        for(let j=0;j<h-1;j++)for(let x=0;x<w;x++)this.loops.push({
            cells:[j*w+x,j*w+(x+1)%w,(j+1)*w+(x+1)%w,(j+1)*w+x],
            faces:[j*w+x,n+j*w+(x+1)%w,(j+1)*w+x,n+j*w+x],
            latitude:Math.asin(1-2*(j+1)/h),longitude:2*Math.PI*(x+1)/w,
        });
    }
    step(dt:number,strengthMps:number) {
        const m=this.thermal,w=this.water,n=m.grid.count,length=w.radiusM*Math.sqrt(m.grid.solidAngle);
        const waterCapacity=4.2e6*m.config.oceanDepthM,flow=new Float64Array(this.faces.length),outgoing=new Float64Array(n);
        for(const loop of this.loops) {
            const wet=Math.min(...loop.cells.map(i=>(1-w.land[i])*Math.max(0,1-w.seaIceKgM2[i]/(917*.5*Math.max(1e-12,1-w.land[i])))));
            const wind=loop.cells.reduce((sum,i)=>sum+w.windEastMps[i],0)/4;
            const circulation=strengthMps*Math.tanh(wind/5)*Math.sin(2*loop.latitude)*Math.sin(loop.longitude)*wet/4;
            const q=waterCapacity*circulation/length;
            loop.faces.forEach((f,k)=>{flow[f]+=k<2?q:-q;});
        }
        this.faces.forEach((e,k)=>{outgoing[flow[k]>=0?e.a:e.b]+=Math.abs(flow[k]);});
        let scale=1;
        if(dt>0)for(let i=0;i<n;i++)if(outgoing[i]>0)scale=Math.min(scale,.45*m.capacity[i]/(dt*outgoing[i]));
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
