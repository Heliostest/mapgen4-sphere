import FlatQueue from 'flatqueue';
import type {Mesh} from './types.d.ts';
import type {RoutingNetwork} from './terrain-water.ts';
import type {ThermalRuntime} from './thermal-runtime.ts';
import {directionToUV} from './sphere.ts';
import {makeSurfaceGrid,surfaceCell} from './surface-grid.ts';

export interface ChannelNetwork {receiverSide:Int32Array;order:Int32Array;fillDepthM:Float64Array;}
/** Minimax drainage on the reservoir's actual edges and sills. Optional
 * observed closed catchments seed internal terminals; no physical barrier,
 * filled DEM or extra water inventory is created. */
export function channelNetwork(mesh:Mesh,network:RoutingNetwork):ChannelNetwork {
    const n=mesh.numTriangles,receiverSide=new Int32Array(n).fill(-2),order=new Int32Array(n),level=new Float64Array(n).fill(Infinity),queue=new FlatQueue<number>();
    const group=(t:number)=>network.cell[t]<0?0:network.endorheic?.[t]??0;
    const visited=new Uint8Array(n),settled=new Uint8Array(n);
    const seed=(t:number)=>{receiverSide[t]=-1;level[t]=network.cell[t]<0?0:network.bedM[t];queue.push(t,level[t]);};
    for(let t=0;t<n;t++)if(network.cell[t]<0)seed(t);
    const lakeVisited=new Uint8Array(n);
    for(let t=0;t<n;t++)if((network.inlandLakeId?.[t]??0)>0&&!lakeVisited[t]) {
        const stack=[t];lakeVisited[t]=1;let sink=t;
        for(let k=0;k<stack.length;k++) {
            const a=stack[k];if(network.bedM[a]<network.bedM[sink])sink=a;
            for(let j=0;j<3;j++){const b=mesh.t_outer_s(3*a+j);if(!lakeVisited[b]&&network.inlandLakeId![b]===network.inlandLakeId![t]){lakeVisited[b]=1;stack.push(b);}}
        }
        seed(sink);
    }
    // Coast changes can split a mapped basin. Each remaining connected piece
    // gets a terminal; never route across a gap or leave an unreachable cycle.
    for(let t=0;t<n;t++)if(group(t)>0&&!visited[t]) {
        const stack=[t];visited[t]=1;let sink=t;
        for(let k=0;k<stack.length;k++) {
            const a=stack[k],preferred=network.terminal?.[a]??0,old=network.terminal?.[sink]??0;
            if(preferred>old||(preferred===old&&network.bedM[a]<network.bedM[sink]))sink=a;
            for(let j=0;j<3;j++){const b=mesh.t_outer_s(3*a+j);if(!visited[b]&&group(b)===group(t)){visited[b]=1;stack.push(b);}}
        }
        seed(sink);
    }
    const flood=()=>{
        while(queue.length) {
            const t=queue.pop()!;if(settled[t])continue;settled[t]=1;order[i++]=t;
            for(let j=0;j<3;j++) {
                const s=3*t+j,to=mesh.t_outer_s(s),reverse=mesh.s_opposite_s(s);
                if(settled[to]||group(t)!==group(to))continue;
                const edge=network.neighbors[t].find(e=>e.side===s)??network.neighbors[to].find(e=>e.side===reverse);
                const h=Math.max(level[t],network.bedM[to],edge?.sillM??0);
                if(h<level[to]){receiverSide[to]=reverse;level[to]=h;queue.push(to,h);}
            }
        }
    };
    let i=0;
    flood();
    while(i<n) {
        let sink=-1;for(let t=0;t<n;t++)if(!settled[t]&&(sink<0||network.bedM[t]<network.bedM[sink]))sink=t;
        seed(sink);flood();
    }
    return {receiverSide,order,fillDepthM:level.map((h,t)=>Math.max(0,h-network.bedM[t]))};
}

/** Area-weighted upstream accumulation. No mesh-density-dependent flow units. */
export function channelDischarge(mesh:Mesh,network:RoutingNetwork,channels:ChannelNetwork,runoffMmDay:ArrayLike<number>):Float64Array {
    const flow=Float64Array.from(network.areaM2,(a,t)=>network.cell[t]<0?0:Math.max(0,runoffMmDay[t])*a/(1000*86400));
    for(let i=channels.order.length-1;i>=0;i--) {
        const t=channels.order[i],s=channels.receiverSide[t];
        if(s>=0)flow[mesh.t_outer_s(s)]+=flow[t];
    }
    return flow;
}

type Reference={channels:ChannelNetwork;annualRunoffMmDay:Float64Array;surfaceIndex:Int32Array;};
const references=new WeakMap<RoutingNetwork,Reference>();
/** Estimated channel widths combine a climatic reference with current wetness,
 * liquid rainfall and melt. They are not the finite-volume transfer diagnostic. */
export function riverChannelField(rt:ThermalRuntime) {
    const w=rt.water!,network=w.routing!.network,mesh=rt.terrainSource!.mesh!,model=rt.model!,n=mesh.numTriangles;
    let reference=references.get(network);
    if(!reference) {
        const size=rt.surfaceState()?.texture;const annualRunoffMmDay=new Float64Array(n),surfaceIndex=new Int32Array(n),grid=size?makeSurfaceGrid(size.width,size.height):makeSurfaceGrid();
        for(let t=0;t<n;t++)if(network.cell[t]>=0) {
            const uv=directionToUV(mesh.xyz_t.subarray(3*t,3*t+3));
            surfaceIndex[t]=surfaceCell(grid,...uv);
            const climate=rt.sampleSurface?.(...uv);
            // Illustrative runoff coefficient, not a calibrated discharge model.
            annualRunoffMmDay[t]=.35*(climate?climate.annualRainMm/365.2425:w.precipitationKgM2S[network.cell[t]]*86400);
        }
        reference={channels:channelNetwork(mesh,network),annualRunoffMmDay,surfaceIndex};references.set(network,reference);
    }
    const runoff=new Float64Array(n),receiverSide=reference.channels.receiverSide.slice();
    for(let t=0;t<n;t++) {
        const k=network.cell[t];if(k<0)continue;
        const land=Math.max(1e-9,w.land[k]);
        const soil=Math.max(0,Math.min(1,w.soilKgM2[k]/(land*w.config.soilCapacityKgM2)));
        const liquid=Math.max(0,Math.min(1,(model.temperatureK[k]-271.15)/4));
        const rain=w.precipitationKgM2S[k]*86400*.35*liquid,melt=w.meltKgM2S[k]*86400/land;
        runoff[t]=.65*reference.annualRunoffMmDay[t]*soil*liquid+.35*rain+melt;
    }
    const flowM3S=channelDischarge(mesh,network,{...reference.channels,receiverSide},runoff);
    const sides=new Float32Array(mesh.numSides),physicalSides=new Float32Array(mesh.numSides),surface=rt.surfaceState?.();
    for(let t=0;t<n;t++)if(network.cell[t]>=0) {
        const k=reference.surfaceIndex[t];
        // Snow/grounded ice visually cover channels; flow estimates upstream
        // still contribute downstream. Never paint blue rivers over an ice cap.
        if(surface&&((surface.landIceKgM2?.[k]??0)>917||(surface.snowMm?.[k]??0)>30))continue;
        if(receiverSide[t]>=0)sides[receiverSide[t]]=flowM3S[t]/100;
        const actual=w.routing!.receiverSide[t];if(actual>=0)physicalSides[actual]=w.routing!.fluxM3S[t]/100;
    }
    return {receiverSide,flowM3S,sides,physicalSides};
}
