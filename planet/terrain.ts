// SPDX-License-Identifier: Apache-2.0
import type {SphereMesh} from './mesh.ts';
import {createNoise3D} from 'simplex-noise';
import FlatQueue from 'flatqueue';
export type PlanetParams = {seed:number; seaLevel:number; rainfall:number};
export const defaultParams:PlanetParams = {seed:187,seaLevel:0.56,rainfall:0.9};
export type Terrain = {elevation:Float32Array; moisture:Float32Array; drainage:Int32Array; flow:Float32Array};
const clamp=(x:number,min:number,max:number)=>Math.max(min,Math.min(max,x));

// Deterministic generator; no browser globals, so worker and Node tests share the code.
function random(seed:number):()=>number {
    let state=seed>>>0;
    return ()=>{ state+=0x6D2B79F5; let t=Math.imul(state^(state>>>15),1|state); t^=t+Math.imul(t^(t>>>7),61|t); return ((t^(t>>>14))>>>0)/4294967296; };
}

export function generateTerrain(mesh:SphereMesh,params:PlanetParams,edits?:Float32Array):Terrain {
    if (![params.seed,params.seaLevel,params.rainfall].every(Number.isFinite)) throw new Error('Planet parameters must be finite numbers');
    const n=mesh.neighbors.length, noise=createNoise3D(random(params.seed));
    const continental=new Float32Array(n),elevation=new Float32Array(n);
    const fbm=(x:number,y:number,z:number,octaves:number)=>{
        let value=0,weight=0,amplitude=1;
        for(let i=0;i<octaves;i++){value+=amplitude*noise(x,y,z);weight+=amplitude;amplitude*=0.5;x*=2.03;y*=2.03;z*=2.03;}
        return value/weight;
    };
    for(let i=0;i<n;i++) {
        const x=mesh.positions[3*i],y=mesh.positions[3*i+1],z=mesh.positions[3*i+2];
        // Sampling in Cartesian space is continuous through both poles and the date line.
        const warp=0.24*noise(x*2+17,y*2-5,z*2+3);
        continental[i]=fbm(x*1.85+warp+3,y*1.85+warp-7,z*1.85+warp+2,5);
    }
    const sorted=continental.slice().sort(), sea=sorted[Math.floor(clamp(params.seaLevel,0,0.9999)*(n-1))];
    for(let i=0;i<n;i++) {
        const x=mesh.positions[3*i],y=mesh.positions[3*i+1],z=mesh.positions[3*i+2];
        const land=continental[i]-sea;
        const ridge=Math.pow(1-Math.abs(noise(x*8+21,y*8+8,z*8-13)),3);
        const mountainMask=clamp((noise(x*3-10,y*3+31,z*3+17)+0.35)*1.8,0,1);
        let e=land<0 ? land*2.5 : Math.pow(land*1.5,1.25)+ridge*mountainMask*clamp(land*6,0,1)*0.42;
        if(edits && Number.isFinite(edits[i])) e=edits[i];
        elevation[i]=clamp(e,-1,1);
    }
    // Moisture circulates in latitude bands. Iterative transport has no artificial map edge.
    let humidity=Float32Array.from(elevation,e=>e<=0?1:0);
    const upstream=mesh.neighbors.map((neighbors,i)=>{
        const x=mesh.positions[3*i],y=mesh.positions[3*i+1],z=mesh.positions[3*i+2];
        const direction=Math.abs(y)>0.35 && Math.abs(y)<0.8 ? -1:1;
        const up=neighbors.filter(j=>direction*(z*mesh.positions[3*j]-x*mesh.positions[3*j+2])>0);
        return up.length?up:neighbors;
    });
    for(let pass=0;pass<18;pass++) {
        const next=new Float32Array(n);
        for(let i=0;i<n;i++) {
            if(elevation[i]<=0){next[i]=1;continue;}
            let sum=0;
            for(const j of upstream[i]) sum+=humidity[j]*Math.exp(-Math.max(0,elevation[i]-elevation[j])*7);
            next[i]=0.97*sum/upstream[i].length;
        }
        humidity=next;
    }
    const moisture=new Float32Array(n);
    for(let i=0;i<n;i++) {
        const x=mesh.positions[3*i],y=mesh.positions[3*i+1],z=mesh.positions[3*i+2],lat=Math.abs(y);
        const latitudeRain=0.5+0.5*Math.pow(Math.cos(lat*Math.PI*2),2);
        moisture[i]=clamp(params.rainfall*(0.30+0.66*humidity[i]+0.08*noise(x*6,y*6,z*6))*latitudeRain,0,2);
    }
    const {drainage,flow}=routeDrainage(mesh,elevation,moisture);
    return {elevation,moisture,drainage,flow};
}

/** Priority flood builds a drainage forest. Breach local depressions along that forest,
 * as Mapgen4 does, so rendered rivers never have to climb over a ridge. */
export function routeDrainage(mesh:SphereMesh,elevation:Float32Array,moisture:Float32Array) {
    const n=elevation.length,drainage=new Int32Array(n).fill(-1),flow=new Float32Array(n);
    const visited=new Uint8Array(n),order:number[]=[],queue=new FlatQueue<number>();
    for(let i=0;i<n;i++) if(elevation[i]<=0){visited[i]=1;queue.push(i,elevation[i]);}
    if(!queue.length && n){
        let sink=0;for(let i=1;i<n;i++)if(elevation[i]<elevation[sink])sink=i;
        visited[sink]=1;queue.push(sink,elevation[sink]);
    }
    while(queue.length){
        const level=queue.peekValue()!,at=queue.pop()!;order.push(at);
        for(const next of mesh.neighbors[at]) if(!visited[next]){
            visited[next]=1;drainage[next]=at;queue.push(next,Math.max(level,elevation[next]));
        }
    }
    for(let i=0;i<n;i++)flow[i]=elevation[i]>0?moisture[i]*moisture[i]:0;
    for(let k=order.length-1;k>=0;k--){
        const at=order[k],next=drainage[at];
        if(next<0)continue;
        flow[next]+=flow[at];
        if(elevation[next]>elevation[at])elevation[next]=elevation[at];
    }
    return {drainage,flow};
}

/** Center and radius are a direction and radians, not a UV rectangle. */
export function paintTerrain(mesh:SphereMesh,elevation:Float32Array,edits:Float32Array,center:number[],radius:number,target:number,strength:number):void {
    const length=Math.hypot(...center);
    if(length===0 || radius<=0)return;
    const direction=center.map(v=>v/length),edge=Math.cos(radius);
    for(let i=0;i<elevation.length;i++){
        const dot=mesh.positions[3*i]*direction[0]+mesh.positions[3*i+1]*direction[1]+mesh.positions[3*i+2]*direction[2];
        if(dot<edge)continue;
        const distance=Math.acos(clamp(dot,-1,1))/radius;
        const falloff=1-distance*distance*(3-2*distance);
        const amount=clamp(strength*falloff,0,1),before=Number.isFinite(edits[i])?edits[i]:elevation[i];
        edits[i]=clamp(before+(target-before)*amount,-1,1);
    }
}
