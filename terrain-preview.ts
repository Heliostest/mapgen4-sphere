import type {ThermalGrid} from './thermal.ts';
export interface TerrainPreview {grid:ThermalGrid;land:Float64Array;baseHeightM:Float64Array;heightM:Float64Array;}

/** Visualization only: land-weighted coarse height ratios retain authored fine
 * detail/folds. Never alter source arrays or claim a fine-mesh volume remap. */
export function previewElevation(elevation:number,u:number,v:number,preview:TerrainPreview|null) {
    if(!preview||elevation<=0)return elevation;
    const {grid,land,baseHeightM,heightM}=preview;
    const x=((u%1+1)%1)*grid.width-.5,latitude=(1-Math.cos(v*Math.PI))*.5*grid.height-.5;
    const y=Math.max(0,Math.min(grid.height-1,latitude)),x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0;
    let before=0,after=0;
    for(let j=0;j<2;j++)for(let i=0;i<2;i++) {
        const k=Math.min(grid.height-1,y0+j)*grid.width+(x0+i+grid.width)%grid.width;
        const weight=(i?fx:1-fx)*(j?fy:1-fy)*land[k];before+=weight*baseHeightM[k];after+=weight*heightM[k];
    }
    // All longitudes meet at one physical pole. Blend the outer half-row
    // toward its land-weighted scalar limit, as for natural-surface fields.
    if(latitude<0||latitude>grid.height-1) {
        const row=latitude<0?0:grid.height-1;let polarBefore=0,polarAfter=0;
        for(let i=0;i<grid.width;i++) {
            const k=row*grid.width+i;polarBefore+=land[k]*baseHeightM[k]/grid.width;polarAfter+=land[k]*heightM[k]/grid.width;
        }
        const fraction=latitude<0?2*(latitude+.5):2*(grid.height-.5-latitude);
        before=polarBefore+(before-polarBefore)*fraction;after=polarAfter+(after-polarAfter)*fraction;
    }
    return before>0?elevation*after/before:elevation;
}
