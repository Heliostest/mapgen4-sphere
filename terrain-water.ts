import type {Mesh} from './types.d.ts';
import {thermalCell,type ThermalGrid} from './thermal.ts';
import {directionToUV} from './sphere.ts';

export interface RoutingNetwork {
    cell:Int32Array;areaM2:Float64Array;bedM:Float64Array;
    neighbors:{to:number;sillM:number;distanceM:number;side:number}[][];
    bedPatches?:{vertices:number[][];weight:number}[][];
}
export interface SurfaceWaterLedger {grid:{count:number};cellAreaM2:number;surfaceKgM2:Float64Array;dischargeM3S:Float64Array;oceanGlobalKgM2:number;}
export interface TerrainWaterCheckpoint {volumeM3:Float64Array;fluxM3S:Float64Array;receiverSide:Int32Array;}

/** A finite-volume reservoir partition of the coarse surface store. It has no
 * additional inventory, pressure/momentum equation or instantaneous filled DEM. */
export class TerrainWater {
    readonly volumeM3:Float64Array;readonly fluxM3S:Float64Array;readonly receiverSide:Int32Array;
    readonly headM:Float64Array;
    private readonly byCell:number[][];
    private readonly cellArea:Float64Array;
    private previousSurface:Float64Array;
    private readonly delta:Float64Array;
    constructor(readonly network:RoutingNetwork,water:SurfaceWaterLedger) {
        const n=network.cell.length;
        this.volumeM3=new Float64Array(n);this.fluxM3S=new Float64Array(n);this.receiverSide=new Int32Array(n).fill(-1);this.headM=new Float64Array(n);this.delta=new Float64Array(n);
        this.byCell=Array.from({length:water.grid.count},()=>[]);this.cellArea=new Float64Array(water.grid.count);
        for(let i=0;i<n;i++)if(network.cell[i]>=0){const k=network.cell[i];this.byCell[k].push(i);this.cellArea[k]+=network.areaM2[i];}
        this.previousSurface=new Float64Array(water.grid.count);this.reconcile(water);this.refreshHeads();
    }
    private reconcile(water:SurfaceWaterLedger) {
        const scale=water.cellAreaM2/1000;
        for(let k=0;k<water.grid.count;k++) {
            const target=water.surfaceKgM2[k],change=(target-this.previousSurface[k])*scale,cells=this.byCell[k];
            if(target===0){for(const i of cells)this.volumeM3[i]=0;continue;}
            const total=cells.reduce((sum,i)=>sum+this.volumeM3[i],0);
            // Pair transfers round independently in the coarse and fine ledgers.
            // Re-anchor even with no source change: otherwise a drying coarse
            // cell can reach zero while its fine donors still retain roundoff.
            if(change>0) {
                const fraction=total>0?this.previousSurface[k]*scale/total:0;
                for(const i of cells)this.volumeM3[i]=this.volumeM3[i]*fraction+change*this.network.areaM2[i]/this.cellArea[k];
            }
            else {
                const fraction=total>0?target*scale/total:0;
                for(const i of cells)this.volumeM3[i]*=fraction;
            }
        }
        this.previousSurface=water.surfaceKgM2.slice();
    }
    refreshHeads() {for(let i=0;i<this.volumeM3.length;i++)this.headM[i]=this.network.bedM[i]+this.volumeM3[i]/this.network.areaM2[i];}
    route(water:SurfaceWaterLedger,dt:number,speedMps:number,diagnose=false) {
        this.reconcile(water);this.refreshHeads();this.delta.fill(0);this.fluxM3S.fill(0);this.receiverSide.fill(-1);water.dischargeM3S.fill(0);
        const {cell,areaM2,neighbors}=this.network,n=cell.length,conversion=1000/water.cellAreaM2,coarseDelta=new Float64Array(water.grid.count);
        let oceanM3=0;
        for(let i=0;i<n;i++) {
            if(cell[i]<0||this.volumeM3[i]<=0)continue;
            let target:RoutingNetwork['neighbors'][number][number]|null=null,best=this.headM[i];
            for(const edge of neighbors[i]) {
                const head=Math.max(edge.sillM,edge.to<0?0:this.headM[edge.to]);
                if(head<best){target=edge;best=head;}
            }
            if(!target)continue;
            const j=target.to,available=Math.min(this.volumeM3[i],(this.headM[i]-best)/(1/areaM2[i]+(j<0?0:1/areaM2[j])));
            // Limit exchanged volume even on tiny planets / unusually large dt.
            const amount=available*Math.min(.45,-Math.expm1(-dt*speedMps/target.distanceM));
            this.fluxM3S[i]=amount/dt;this.receiverSide[i]=target.side;this.delta[i]-=amount;
            coarseDelta[cell[i]]-=amount*conversion;
            if(j<0){oceanM3+=amount;water.dischargeM3S[cell[i]]+=amount/dt;}
            else {
                this.delta[j]+=amount;coarseDelta[cell[j]]+=amount*conversion;
                if(cell[i]!==cell[j])water.dischargeM3S[cell[i]]+=amount/dt;
            }
        }
        if(!diagnose) {
            for(let i=0;i<n;i++)this.volumeM3[i]+=this.delta[i];
            for(let k=0;k<water.grid.count;k++)water.surfaceKgM2[k]+=coarseDelta[k];
            water.oceanGlobalKgM2+=oceanM3*conversion/water.grid.count;
        }
        this.previousSurface=water.surfaceKgM2.slice();this.refreshHeads();
    }
    checkpoint():TerrainWaterCheckpoint {return {volumeM3:this.volumeM3.slice(),fluxM3S:this.fluxM3S.slice(),receiverSide:this.receiverSide.slice()};}
    restore(s:TerrainWaterCheckpoint,water:SurfaceWaterLedger) {
        if(s.volumeM3.length!==this.volumeM3.length||s.fluxM3S.length!==this.volumeM3.length||s.receiverSide.length!==this.volumeM3.length)throw new Error('Terrain water size mismatch');
        for(let i=0;i<s.volumeM3.length;i++) {
            if(!Number.isFinite(s.volumeM3[i])||s.volumeM3[i]<0||!Number.isFinite(s.fluxM3S[i])||s.fluxM3S[i]<0)throw new Error('Invalid terrain water');
            if(s.receiverSide[i]!==-1&&!this.network.neighbors[i].some(e=>e.side===s.receiverSide[i]))throw new Error('Invalid terrain outlet');
            if(this.network.cell[i]<0&&(s.volumeM3[i]!==0||s.fluxM3S[i]!==0))throw new Error('Ocean triangle cannot hold terrestrial water');
        }
        for(let k=0;k<water.grid.count;k++)if(this.byCell[k].length) {
            const amount=this.byCell[k].reduce((sum,i)=>sum+s.volumeM3[i],0)*1000/water.cellAreaM2;
            if(Math.abs(amount-water.surfaceKgM2[k])>Math.max(1e-8,water.surfaceKgM2[k]*1e-9))throw new Error('Fine and coarse water stores differ');
        }
        this.volumeM3.set(s.volumeM3);this.fluxM3S.set(s.fluxM3S);this.receiverSide.set(s.receiverSide);this.previousSurface=water.surfaceKgM2.slice();this.refreshHeads();
    }
    diagnostics(water:SurfaceWaterLedger) {
        let representedM3=0,unresolvedM3=0,partitionResidualM3=0,maxDepthM=0,maxFlowM3S=0;
        for(let k=0;k<water.grid.count;k++) {
            const coarse=water.surfaceKgM2[k]*water.cellAreaM2/1000;
            if(!this.byCell[k].length)unresolvedM3+=coarse;
            else {representedM3+=coarse;partitionResidualM3+=this.byCell[k].reduce((sum,i)=>sum+this.volumeM3[i],0)-coarse;}
        }
        for(let i=0;i<this.volumeM3.length;i++){maxDepthM=Math.max(maxDepthM,this.volumeM3[i]/this.network.areaM2[i]);maxFlowM3S=Math.max(maxFlowM3S,this.fluxM3S[i]);}
        return {representedM3,unresolvedM3,partitionResidualM3,maxDepthM,maxFlowM3S};
    }
}

export function terrainRoutingNetwork(mesh:Mesh,elevation:ArrayLike<number>,grid:ThermalGrid,radiusM:number,reliefM:number,quadElements?:Int32Array):RoutingNetwork {
    const n=mesh.numTriangles,cell=new Int32Array(n).fill(-1),areaM2=new Float64Array(n),bedM=new Float64Array(n),neighbors:RoutingNetwork['neighbors']=Array.from({length:n},()=>[]);
    const bedPatches:NonNullable<RoutingNetwork['bedPatches']>=Array.from({length:n},()=>[]);
    const xyz=(r:number)=>[mesh.xyz_r[3*r],mesh.xyz_r[3*r+1],mesh.xyz_r[3*r+2]],dot=(a:number[],b:number[])=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
    const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    const angle=(a:number[],b:number[])=>Math.acos(Math.max(-1,Math.min(1,dot(a,b))));
    const area=(a:number[],b:number[],c:number[])=>2*Math.atan2(Math.abs(dot(a,cross(b,c))),1+dot(a,b)+dot(b,c)+dot(c,a))*radiusM**2;
    const vertex=(p:number[],height:number)=>[...directionToUV(p).map(v=>1000*v),height];
    for(let t=0;t<n;t++) {
        const [a,b,c]=[0,1,2].map(j=>xyz(mesh.r_begin_s(3*t+j))),det=a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]);
        areaM2[t]=2*Math.atan2(Math.abs(det),1+dot(a,b)+dot(b,c)+dot(c,a))*radiusM**2;
        const e=elevation[mesh.numRegions+t];bedM[t]=Math.max(0,e*reliefM);
        if(e>0){const uv=directionToUV(mesh.xyz_t.subarray(3*t,3*t+3));cell[t]=thermalCell(grid,...uv);}
    }
    for(let t=0;t<n;t++)if(cell[t]>=0)for(let j=0;j<3;j++) {
        const s=3*t+j,to=mesh.t_outer_s(s),a=mesh.r_begin_s(s),b=mesh.r_begin_s(mesh.s_next_s(s));
        let cos=0;for(let c=0;c<3;c++)cos+=mesh.xyz_t[3*t+c]*mesh.xyz_t[3*to+c];
        const distanceM=radiusM*Math.acos(Math.max(-1,Math.min(1,cos)));
        const pa=xyz(a),pb=xyz(b),pt=Array.from(mesh.xyz_t.subarray(3*t,3*t+3)),pn=Array.from(mesh.xyz_t.subarray(3*to,3*to+3));
        const va=vertex(pa,elevation[a]*reliefM),vb=vertex(pb,elevation[b]*reliefM),vt=vertex(pt,bedM[t]);
        let sillM=Math.min(va[2],vb[2]);
        if(quadElements&&quadElements[3*s+1]>=mesh.numRegions) {
            // The authored quad is folded into a valley between its centers.
            // Split its two faces at the shared edge, preserving that low bed.
            let pc=cross(cross(pa,pb),cross(pt,pn));const norm=Math.hypot(...pc),sign=dot(pc,pa)>=0?1:-1;pc=pc.map(v=>v*sign/norm);
            const f=angle(pt,pc)/angle(pt,pn),height=(1-f)*elevation[mesh.numRegions+t]*reliefM+f*elevation[mesh.numRegions+to]*reliefM,vc=vertex(pc,height);
            sillM=Math.min(sillM,height);
            bedPatches[t].push({vertices:[vt,va,vc],weight:area(pt,pa,pc)},{vertices:[vt,vc,vb],weight:area(pt,pc,pb)});
        } else bedPatches[t].push({vertices:[vt,va,vb],weight:area(pt,pa,pb)});
        neighbors[t].push({to:cell[to]>=0?to:-1,sillM:Math.max(0,sillM),distanceM:Math.max(1e-6,distanceM),side:s});
    }
    for(const patches of bedPatches){const sum=patches.reduce((s,p)=>s+p.weight,0);for(const p of patches)p.weight/=sum;}
    return {cell,areaM2,bedM,neighbors,bedPatches};
}
