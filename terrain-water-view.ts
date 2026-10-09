import type {ThermalRuntime} from './thermal-runtime.ts';
import Geometry from './geometry.ts';
import {atlasTriangles} from './sphere.ts';

export interface TerrainWaterView {rivers:Float32Array;riverTriangles:number;lakes:Float32Array;timeS:number;}
/** Mean positive depth over a linear triangular bed (exact piecewise integral). */
export function triangleStorageDepth(h:number,a:number,b:number,c:number) {
    if(a>b)[a,b]=[b,a];if(b>c)[b,c]=[c,b];if(a>b)[a,b]=[b,a];
    if(h<=a)return 0;if(h>=c)return h-(a+b+c)/3;
    if(h<=b)return (h-a)**3/(3*(b-a)*(c-a));
    return h-(a+b+c)/3+(c-h)**3/(3*(c-a)*(c-b));
}
/** Sub-triangle shore reconstruction; routing itself uses cell-mean columns. */
export function lakeSurfaceLevel(depth:number,corners:number[],center:number) {
    let lo=Math.min(center,...corners),hi=Math.max(center,...corners)+depth;
    if(depth<=0)return lo;
    for(let j=0;j<22;j++) {
        const mid=(lo+hi)/2,stored=(triangleStorageDepth(mid,center,corners[0],corners[1])+triangleStorageDepth(mid,center,corners[1],corners[2])+triangleStorageDepth(mid,center,corners[2],corners[0]))/3;
        if(stored<depth)lo=mid;else hi=mid;
    }
    return (lo+hi)/2;
}
function bedLevel(depth:number,patches:{vertices:number[][];weight:number}[]) {
    let lo=Infinity,hi=-Infinity;
    for(const p of patches)for(const v of p.vertices){lo=Math.min(lo,v[2]);hi=Math.max(hi,v[2]);}
    hi+=depth;
    for(let j=0;j<22;j++) {
        const mid=(lo+hi)/2,stored=patches.reduce((sum,p)=>sum+p.weight*triangleStorageDepth(mid,...p.vertices.map(v=>v[2]) as [number,number,number]),0);
        if(stored<depth)lo=mid;else hi=mid;
    }
    return (lo+hi)/2;
}
const cache=new WeakMap<object,{time:number;view:TerrainWaterView}>();
export function terrainWaterView(rt:ThermalRuntime):TerrainWaterView|null {
    const w=rt.water,route=w?.routing,source=rt.terrainSource,m=rt.model;
    if(!route||!source?.mesh||!m)return null;
    const cached=cache.get(route);if(cached?.time===m.timeS)return cached.view;
    const mesh=source.mesh,n=mesh.numTriangles,flow=new Float32Array(mesh.numSides),buffer=new Float32Array(63*mesh.numSolidTriangles);
    for(let t=0;t<n;t++)if(route.receiverSide[t]>=0)flow[route.receiverSide[t]]=route.fluxM3S[t]/100;
    const riverTriangles=Geometry.setRiverGeometry({mesh,s_downslope_t:route.receiverSide,flow_s:flow},5.5,{lg_min_flow:Math.log(.05),lg_river_width:Math.log(.08),max_width:.9,headwaters:true},buffer);
    const lakes:number[]=[],relief=m.planet.reliefM;
    for(let t=0;t<n;t++) {
        const k=route.network.cell[t];if(k<0)continue;
        const depth=route.volumeM3[t]/route.network.areaM2[t],r=[0,1,2].map(j=>mesh.r_begin_s(3*t+j));
        const h=r.map(i=>Math.max(0,source.elevation[i])*relief),center=route.network.bedM[t];
        const soil=w!.land[k]>0?w!.soilKgM2[k]/(w!.land[k]*w!.config.soilCapacityKgM2):0;
        const slope=(Math.max(center,...h)-Math.min(center,...h))/Math.sqrt(route.network.areaM2[t]);
        const wet=Math.max(0,Math.min(1,(soil-.6)/.4+Math.min(.8,depth/.04)))*Math.max(0,1-slope/.02);
        if(depth<1e-8&&wet<=0)continue;
        const patches=route.network.bedPatches![t],head=depth>1e-8?bedLevel(depth,patches):-1;
        // Same spherical seam/pole clipping as the original terrain and rivers.
        for(const patch of patches) {
            const points=patch.vertices.map(v=>[...v,head,wet]);
            for(const tri of atlasTriangles(points))for(const v of tri)lakes.push(...v);
        }
    }
    const view={rivers:buffer.slice(0,riverTriangles*21),riverTriangles,lakes:new Float32Array(lakes),timeS:m.timeS};cache.set(route,{time:m.timeS,view});return view;
}
