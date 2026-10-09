import {thermalCell,type ThermalGrid} from './thermal.ts';
import {resampleClimateField} from './surface-grid.ts';
import type {ClimateGrid as SurfaceGrid} from './climate.ts';
/** Area-weighted geographic samples -> conditional mean on land or sea.
 * The physical grid's authored land fraction remains the water-budget mask. */
export function aggregateSurface(grid:ThermalGrid,surface:SurfaceGrid,field:ArrayLike<number>,mask:ArrayLike<number>) {
    const sum=new Float64Array(grid.count),weight=new Float64Array(grid.count);
    for(let j=0;j<surface.height;j++) {
        const top=Math.max(0,(j-.5)/(surface.height-1))*Math.PI,bottom=Math.min(1,(j+.5)/(surface.height-1))*Math.PI;
        const area=Math.cos(top)-Math.cos(bottom);
        for(let x=0;x<surface.width;x++) {
            const i=j*surface.width+x,k=thermalCell(grid,(x+.5)/surface.width,j/(surface.height-1)),w=area*mask[i];
            sum[k]+=w*field[i];weight[k]+=w;
        }
    }
    return sum.map((v,k)=>weight[k]>0?v/weight[k]:0);
}
/** Downscaled display estimates. New mass can spread into previously bare
 * samples; losing mass removes the whole initial pattern, including the poles. */
export function downscaleStore(grid:ThermalGrid,surface:SurfaceGrid,current:ArrayLike<number>,initial:ArrayLike<number>,fraction:ArrayLike<number>,localInitial:Float64Array) {
    const a=resampleClimateField(grid,Float64Array.from(current,(v,i)=>fraction[i]>0?v/fraction[i]:0),surface);
    const b=resampleClimateField(grid,Float64Array.from(initial,(v,i)=>fraction[i]>0?v/fraction[i]:0),surface);
    return a.map((v,i)=>b[i]>1e-9?localInitial[i]*Math.min(1,v/b[i])+Math.max(0,v-b[i]):v);
}
