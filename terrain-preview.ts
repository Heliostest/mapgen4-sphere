import type {ThermalGrid} from './thermal.ts';
export interface TerrainPreview {grid:ThermalGrid;land:Float64Array;baseHeightM:Float64Array;heightM:Float64Array;}

/** Visualization only: land-weighted coarse height ratios retain authored fine
 * detail/folds. Never alter source arrays or claim a fine-mesh volume remap. */
export function previewElevation(elevation:number,u:number,v:number,preview:TerrainPreview|null) {
    if(!preview||elevation<=0)return elevation;
    const {grid,land,baseHeightM,heightM}=preview;
    const x=((u%1+1)%1)*grid.width-.5,y=Math.max(0,Math.min(grid.height-1,(1-Math.cos(v*Math.PI))*.5*grid.height-.5));
    const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0;
    let before=0,after=0;
    for(let j=0;j<2;j++)for(let i=0;i<2;i++) {
        const k=Math.min(grid.height-1,y0+j)*grid.width+(x0+i+grid.width)%grid.width;
        const weight=(i?fx:1-fx)*(j?fy:1-fy)*land[k];before+=weight*baseHeightM[k];after+=weight*heightM[k];
    }
    return before>0?elevation*after/before:elevation;
}
