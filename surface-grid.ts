import type {ClimateGrid} from './climate.ts';
import type {ThermalGrid} from './thermal.ts';
import type {Mesh} from './types.d.ts';

export const SURFACE_WIDTH=96,SURFACE_HEIGHT=49;
export interface SurfaceTerrain {directions:ArrayLike<number>;elevation:ArrayLike<number>;mesh?:Mesh;quadElements?:Int32Array;drainage?:{basinId:ArrayLike<number>;terminal:ArrayLike<number>;inlandLakeId?:ArrayLike<number>};}

/** Reference samples in latitude, including both poles. This is not a solver
 * grid: the conservative thermal/water models keep their equal-area cells. */
export function makeSurfaceGrid():ClimateGrid {
    const width=SURFACE_WIDTH,height=SURFACE_HEIGHT,edges:{a:number;b:number}[]=[];
    for(let j=0;j<height;j++)for(let x=0;x<width;x++) {
        const a=j*width+x;edges.push({a,b:j*width+(x+1)%width});
        if(j+1<height)edges.push({a,b:a+width});
    }
    return {width,height,count:width*height,sinLat:Float64Array.from({length:height},(_,j)=>Math.cos(Math.PI*j/(height-1))),edges};
}

export function surfaceCell(grid:ClimateGrid,u:number,v:number) {
    const j=Math.max(0,Math.min(grid.height-1,Math.round(v*(grid.height-1))));
    return j*grid.width+(j===0||j===grid.height-1?0:Math.floor(((u%1+1)%1)*grid.width));
}

/** Cache coastal bins and angular height interpolation across painting.
 * Tall, narrow polar bins cannot supply representative heights: adjacent
 * columns can otherwise pick vertices several degrees apart in latitude. */
export class SurfaceTerrainSampler {
    private bins:number[][];
    private heightSamples:{region:number;weight:number}[][];
    constructor(readonly directions:ArrayLike<number>,readonly grid:ClimateGrid) {
        const {width,height,count}=grid,n=directions.length/3;
        this.bins=Array.from({length:count},()=>[]);
        for(let r=0;r<n;r++) {
            const u=.5+Math.atan2(directions[3*r],directions[3*r+2])/(2*Math.PI);
            const v=Math.acos(Math.max(-1,Math.min(1,directions[3*r+1])))/Math.PI;
            this.bins[surfaceCell(grid,u,v)].push(r);
        }
        const sourceBins=this.bins.slice();
        this.heightSamples=Array.from({length:count},()=>[]);
        for(let k=0;k<count;k++) {
            const j=Math.floor(k/width),pole=j===0||j===height-1;
            if(pole&&k%width){this.bins[k]=this.bins[j*width];this.heightSamples[k]=this.heightSamples[j*width];continue;}
            const y=grid.sinLat[j],lon=((k%width+.5)/width-.5)*2*Math.PI;
            const radius=Math.sqrt(Math.max(0,1-y*y)),x=radius*Math.sin(lon),z=radius*Math.cos(lon);
            const nearest:{region:number;dot:number}[]=[];
            const consider=(r:number)=>{
                const dot=x*directions[3*r]+y*directions[3*r+1]+z*directions[3*r+2];
                if(nearest.length<4||dot>nearest[nearest.length-1].dot) {
                    nearest.push({region:r,dot});nearest.sort((a,b)=>b.dot-a.dot);if(nearest.length>4)nearest.pop();
                }
            };
            // Search bins intersecting a small spherical neighborhood; never
            // let rectangular membership choose the height sample itself.
            const angle=Math.PI/(height-1),reachesPole=angle>=Math.acos(Math.abs(y));
            const longitudeRadius=reachesPole?Math.PI:Math.asin(Math.min(1,Math.sin(angle)/radius));
            const columns=Math.min(width,2*(Math.ceil(longitudeRadius/(2*Math.PI/width))+1)+1);
            const first=columns===width?0:k%width-Math.floor(columns/2);
            for(let row=Math.max(0,j-2);row<=Math.min(height-1,j+2);row++) {
                // Both polar caps are stored in column zero regardless of
                // longitude; include that bin even for a narrow search cap.
                if(row===0||row===height-1){for(const r of sourceBins[row*width])consider(r);continue;}
                for(let dx=0;dx<columns;dx++)for(const r of sourceBins[row*width+((first+dx)%width+width)%width])consider(r);
            }
            // Four candidates alone are insufficient on sparse meshes. The
            // fourth must lie inside the fully searched spherical cap so no
            // unvisited bin can contain a closer vertex.
            if(nearest.length<4||nearest[3].dot<Math.cos(angle)){nearest.length=0;for(let r=0;r<n;r++)consider(r);}
            if(!this.bins[k].length||pole)this.bins[k]=[nearest[0].region];
            this.heightSamples[k]=pole?[{region:nearest[0].region,weight:1}]:nearest.map(p=>({region:p.region,weight:1/Math.max(1e-12,1-p.dot)}));
        }
    }
    sample(elevation:ArrayLike<number>) {
        const land=new Float64Array(this.grid.count),height=new Float64Array(this.grid.count);
        for(let k=0;k<this.grid.count;k++) {
            for(const r of this.bins[k])land[k]+=elevation[r]>0?1:0;
            land[k]/=this.bins[k].length;
            let weight=0;
            if(land[k]>0)for(const sample of this.heightSamples[k])if(elevation[sample.region]>0) {
                height[k]+=sample.weight*Math.min(1,elevation[sample.region]);weight+=sample.weight;
            }
            height[k]=weight>0?height[k]/weight:0;
        }
        return {land,height};
    }
}

/** Interpolate evolving *anomalies*, not coarse classified colors, onto the
 * local reference. All longitudes share the same scalar limit at each pole. */
export function resampleClimateField(grid:ThermalGrid,field:ArrayLike<number>,target:ClimateGrid) {
    const result=new Float64Array(target.count),w=grid.width,h=grid.height;
    let north=0,south=0;
    for(let x=0;x<w;x++){north+=field[x]/w;south+=field[(h-1)*w+x]/w;}
    for(let j=0;j<target.height;j++)for(let x=0;x<target.width;x++) {
        const sx=(x+.5)/target.width*w-.5,sy=(1-target.sinLat[j])*.5*h-.5;
        const x0=Math.floor(sx),fx=sx-x0,y0=Math.floor(sy),fy=sy-y0;
        const row=(y:number)=>{
            const k=Math.max(0,Math.min(h-1,y))*w;
            return field[k+(x0+w)%w]*(1-fx)+field[k+(x0+1)%w]*fx;
        };
        let value=row(y0)*(1-fy)+row(y0+1)*fy;
        if(sy<0)value=north+(value-north)*(sy+.5)*2;
        if(sy>h-1)value=south+(value-south)*(h-.5-sy)*2;
        result[j*target.width+x]=value;
    }
    return result;
}
