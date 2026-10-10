import {thermalCell,type ThermalGrid} from './thermal.ts';
import {directionToUV} from './sphere.ts';
import type {SurfaceTerrain} from './surface-grid.ts';

export const MAX_SURFACE_PATCHES=100000;
export type RefinementQuality='balanced'|'high';
export interface SurfacePartition {
    level:Uint8Array;offset:Int32Array;parent:Int32Array;
    land:Float64Array;sea:Float64Array;heightM:Float64Array;u:Float64Array;v:Float64Array;
}
/** Fixed geographic tiles; conditional area normalization preserves the
 * authored parent mask (historically vertex-count based). No mass is stored here. */
export function makeSurfacePartition(grid:ThermalGrid,land:ArrayLike<number>,height:ArrayLike<number>,source:SurfaceTerrain|null,reliefM:number,quality:RefinementQuality):SurfacePartition {
    const n=grid.count,bins=Array.from({length:n},()=>[] as {u:number;v:number;e:number;a:number}[]);
    if(source) {
        const mesh=source.mesh,xyz=mesh?.xyz_t??source.directions,len=xyz.length/3;
        for(let t=0;t<len;t++) {
            const direction=Array.from({length:3},(_,c)=>xyz[3*t+c]),[u,v]=directionToUV(direction);
            let a=1;
            if(mesh) {
                const p=[0,1,2].map(j=>Array.from(mesh.xyz_r.subarray(3*mesh.r_begin_s(3*t+j),3*mesh.r_begin_s(3*t+j)+3)));
                const dot=(x:number[],y:number[])=>x.reduce((s,v,c)=>s+v*y[c],0);
                const det=p[0][0]*(p[1][1]*p[2][2]-p[1][2]*p[2][1])+p[0][1]*(p[1][2]*p[2][0]-p[1][0]*p[2][2])+p[0][2]*(p[1][0]*p[2][1]-p[1][1]*p[2][0]);
                a=2*Math.atan2(Math.abs(det),1+dot(p[0],p[1])+dot(p[1],p[2])+dot(p[2],p[0]));
            }
            bins[thermalCell(grid,u,v)].push({u,v,e:source.elevation[(mesh?.numRegions??0)+t],a});
        }
    }
    const level=new Uint8Array(n),offset=new Int32Array(n+1);
    for(let k=0;k<n;k++) {
        const positive=bins[k].filter(p=>p.e>0),range=positive.length?Math.max(...positive.map(p=>p.e))-Math.min(...positive.map(p=>p.e)):0;
        const coast=land[k]>0&&land[k]<1,polar=Math.abs(grid.sinLat[Math.floor(k/grid.width)])>.8&&land[k]>0;
        level[k]=(coast||range*reliefM>1200)?(quality==='high'?8:4):(range*reliefM>400||polar)?4:1;
        offset[k+1]=offset[k]+level[k]**2;
    }
    if(offset[n]>MAX_SURFACE_PATCHES)throw new Error('Refinement exceeds the saveable surface budget; use a smaller atmosphere grid');
    const count=offset[n],parent=new Int32Array(count),lw=new Float64Array(count),sw=new Float64Array(count),h=new Float64Array(count),u=new Float64Array(count),v=new Float64Array(count);
    const part:SurfacePartition={level,offset,parent,land:lw,sea:sw,heightM:h,u,v};
    for(let k=0;k<n;k++) {
        const q=level[k],start=offset[k],j=Math.floor(k/grid.width),x=k%grid.width;
        const sums=new Float64Array(q*q),heights=new Float64Array(q*q);
        for(let t=start;t<offset[k+1];t++) {
            const a=t-start,xx=a%q,yy=Math.floor(a/q);parent[t]=k;
            u[t]=(x+(xx+.5)/q)/grid.width;v[t]=Math.acos(1-2*(j+(yy+.5)/q)/grid.height)/Math.PI;
        }
        for(const p of bins[k]) {
            const t=partitionCell(grid,part,p.u,p.v)-start;
            sums[t]+=p.a;if(p.e>0){lw[start+t]+=p.a;heights[t]+=p.a*Math.min(1,p.e)*reliefM;}else sw[start+t]+=p.a;
        }
        let aLand=0,aSea=0;
        for(let t=start;t<offset[k+1];t++) {
            const a=t-start;
            if(sums[a]===0) {
                // Sparse procedural inputs: use closest source sample in this
                // parent, avoiding a global nearest-neighbor search per tile.
                const y=Math.cos(v[t]*Math.PI),lon=(u[t]-.5)*2*Math.PI,r=Math.sqrt(1-y*y);
                let best=-Infinity,e=land[k]>=.5?height[k]:0;
                for(const p of bins[k]){const py=Math.cos(p.v*Math.PI),pr=Math.sqrt(1-py*py),d=y*py+r*pr*Math.cos((p.u-u[t])*2*Math.PI);if(d>best){best=d;e=p.e;}}
                lw[t]=e>0?1:0;sw[t]=e>0?0:1;h[t]=Math.max(0,e)*reliefM;
            }else {h[t]=lw[t]>0?heights[a]/lw[t]:0;lw[t]/=sums[a];sw[t]/=sums[a];}
            aLand+=lw[t];aSea+=sw[t];
        }
        // A submask may miss a tiny parent component; retain a fractional
        // component instead of destroying its heat/water reservoir.
        if(aLand===0&&land[k]>0){for(let t=start;t<offset[k+1];t++){lw[t]=1;h[t]=height[k]*reliefM;}aLand=q*q;}
        if(aSea===0&&land[k]<1){for(let t=start;t<offset[k+1];t++)sw[t]=1;aSea=q*q;}
        // The authoritative parent can be pure even when triangle sampling
        // finds a coastal sliver. Keep every geographic tile represented.
        if(land[k]===1){for(let t=start;t<offset[k+1];t++)if(lw[t]===0){lw[t]=1;h[t]=height[k]*reliefM;aLand++;}}
        if(land[k]===0){for(let t=start;t<offset[k+1];t++)if(sw[t]===0){sw[t]=1;aSea++;}}
        for(let t=start;t<offset[k+1];t++){lw[t]*=aLand>0?land[k]/aLand:0;sw[t]*=aSea>0?(1-land[k])/aSea:0;}
    }
    return part;
}
export function partitionCell(grid:ThermalGrid,p:SurfacePartition,u:number,v:number) {
    const uu=(u%1+1)%1,k=thermalCell(grid,uu,v),q=p.level[k];
    const x=Math.min(q-1,Math.floor((uu*grid.width-k%grid.width)*q));
    const y=Math.max(0,Math.min(q-1,Math.floor(((1-Math.cos(v*Math.PI))/2*grid.height-Math.floor(k/grid.width))*q)));
    return p.offset[k]+y*q+x;
}
