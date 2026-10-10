import type {ThermalRuntime} from './thermal-runtime.ts';
import Geometry from './geometry.ts';
import {atlasTriangles} from './sphere.ts';
import type {RoutingNetwork} from './terrain-water.ts';
import {riverChannelField} from './river-channels.ts';

export interface TerrainWaterView {rivers:Float32Array;riverTriangles:number;lakes:Float32Array;timeS:number;oceanDepthRatio?:number;inlandVertices?:Uint8Array;}
export interface ChannelDisplay {minFlowM3S?:number;widthCoefficient?:number;maxWidthRatio?:number;enabled?:boolean;}
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
// Patch stride: sorted a/b/c heights, mean, lower/upper cubic coefficients, weight.
// Equal-height intervals have an infinite coefficient but their branch is empty.
type LakeBed={min:number;max:number;patches:Float64Array;vertices:Float32Array;wetSlope:number};
type LakeGeometry={beds:(LakeBed|null)[];vertexCount:number;inlandVertices:Uint8Array};
const geometryCache=new WeakMap<RoutingNetwork,LakeGeometry>();
/** Terrain heights and atlas seams stay fixed while reservoir volumes evolve.
 * Compile them once, retaining the exact piecewise storage integral. */
function lakeGeometry(rt:ThermalRuntime):LakeGeometry {
    const network=rt.water!.routing!.network,cached=geometryCache.get(network);
    if(cached)return cached;
    const source=rt.terrainSource!,mesh=source.mesh!,relief=rt.model!.planet.reliefM;
    let vertexCount=0;
    const inlandVertices=new Uint8Array(mesh.numRegions+mesh.numTriangles);
    const beds=Array.from({length:mesh.numTriangles},(_,t):LakeBed|null=>{
        if(network.cell[t]<0)return null;
        if((network.inlandLakeId?.[t]??0)>0) {
            inlandVertices[mesh.numRegions+t]=1;
            for(let j=0;j<3;j++)inlandVertices[mesh.r_begin_s(3*t+j)]=1;
        }
        const patches=network.bedPatches![t],coefficients=new Float64Array(patches.length*7),vertices:number[]=[];
        let min=Infinity,max=-Infinity;
        for(let p=0;p<patches.length;p++) {
            let a=patches[p].vertices[0][2],b=patches[p].vertices[1][2],c=patches[p].vertices[2][2];
            if(a>b)[a,b]=[b,a];if(b>c)[b,c]=[c,b];if(a>b)[a,b]=[b,a];
            min=Math.min(min,a);max=Math.max(max,c);
            coefficients.set([a,b,c,(a+b+c)/3,1/(3*(b-a)*(c-a)),1/(3*(c-a)*(c-b)),patches[p].weight],p*7);
            for(const tri of atlasTriangles(patches[p].vertices))for(const v of tri)vertices.push(v[0],v[1],v[2]);
        }
        let lo=network.bedM[t],hi=lo;
        for(let j=0;j<3;j++){const h=Math.max(0,source.elevation[mesh.r_begin_s(3*t+j)])*relief;lo=Math.min(lo,h);hi=Math.max(hi,h);}
        vertexCount+=vertices.length/3;
        return {min,max,patches:coefficients,vertices:new Float32Array(vertices),wetSlope:Math.max(0,1-(hi-lo)/Math.sqrt(network.areaM2[t])/.02)};
    });
    const result={beds,vertexCount,inlandVertices};geometryCache.set(network,result);return result;
}
function bedLevel(depth:number,bed:LakeBed) {
    let lo=bed.min,hi=bed.max+depth;
    const p=bed.patches;
    for(let j=0;j<22;j++) {
        const mid=(lo+hi)/2;let stored=0;
        for(let i=0;i<p.length;i+=7) {
            let amount=0;
            if(mid>=p[i+2])amount=mid-p[i+3];
            else if(mid>p[i]) {
                if(mid<=p[i+1]){const d=mid-p[i];amount=d*d*d*p[i+4];}
                else {const d=p[i+2]-mid;amount=mid-p[i+3]+d*d*d*p[i+5];}
            }
            stored+=p[i+6]*amount;
        }
        if(stored<depth)lo=mid;else hi=mid;
    }
    return (lo+hi)/2;
}
const cache=new WeakMap<object,{time:number;style:string;view:TerrainWaterView}>();
export function terrainWaterView(rt:ThermalRuntime,display:ChannelDisplay={}):TerrainWaterView|null {
    const w=rt.water,route=w?.routing,source=rt.terrainSource,m=rt.model;
    if(!route||!source?.mesh||!m)return null;
    const min=display.minFlowM3S??300,width=display.widthCoefficient??.07,max=display.maxWidthRatio??.85,enabled=display.enabled??true,style=JSON.stringify([min,width,max,enabled]);
    const cached=cache.get(route);if(cached?.time===m.timeS&&cached.style===style)return cached.view;
    const mesh=source.mesh,n=mesh.numTriangles,buffer=new Float32Array(126*mesh.numSolidTriangles),channels=riverChannelField(rt);
    const params={lg_min_flow:Math.log(min/100),lg_river_width:Math.log(width),max_width:max,headwaters:true};
    let riverTriangles=enabled?Geometry.setRiverGeometry({mesh,s_downslope_t:channels.receiverSide,flow_s:channels.sides},5.5,params,buffer):0;
    // True instantaneous finite-volume transfer is a separate overlay. It can
    // cross a mapped closed boundary only when the physical solver exchanges
    // water above its real sill; reference annual flow never supplies it.
    if(enabled)riverTriangles+=Geometry.setRiverGeometry({mesh,s_downslope_t:route.receiverSide,flow_s:channels.physicalSides},5.5,params,buffer.subarray(riverTriangles*21));
    const geometry=lakeGeometry(rt),lakes=new Float32Array(geometry.vertexCount*5);let offset=0;
    for(let t=0;t<n;t++) {
        const k=route.network.cell[t];if(k<0)continue;
        const depth=route.volumeM3[t]/route.network.areaM2[t],bed=geometry.beds[t]!;
        const soil=w!.land[k]>0?w!.soilKgM2[k]/(w!.land[k]*w!.config.soilCapacityKgM2):0;
        const wet=Math.max(0,Math.min(1,(soil-.6)/.4+Math.min(.8,depth/.04)))*bed.wetSlope;
        const inland=(route.network.inlandLakeId?.[t]??0)>0;
        if(depth<1e-8&&wet<=0&&!inland)continue;
        // Inland bathymetry still needs a dry classification mask. Encode the
        // marker in wetness's sign; dry head stays below the lowest bed.
        const head=depth>1e-8?bedLevel(depth,bed):inland?bed.min-1:-1,vertices=bed.vertices;
        for(let i=0;i<vertices.length;i+=3) {
            lakes[offset++]=vertices[i];lakes[offset++]=vertices[i+1];lakes[offset++]=vertices[i+2];
            lakes[offset++]=head;lakes[offset++]=inland?-1-wet:wet;
        }
    }
    const view={rivers:buffer.slice(0,riverTriangles*21),riverTriangles,lakes:lakes.subarray(0,offset),timeS:m.timeS,oceanDepthRatio:m.planet.oceanDepthM/m.planet.reliefM,inlandVertices:geometry.inlandVertices};cache.set(route,{time:m.timeS,style,view});return view;
}
