import {SURFACE_WIDTH,SURFACE_HEIGHT} from './surface-grid.ts';

/** Observed thickness samples, in metres of ice, on the geographic surface
 * grid. Grounded and floating ice are disjoint; seasonal sea ice is separate.
 * bedrockM is the product's bed datum, retained for provenance/diagnostics.
 * The solver derives its compatible bed from the authored ice-surface DEM. */
export interface IceInventorySeed {
    version:1;grid:{width:number;height:number};source:string;
    groundedThicknessM:Float64Array;shelfThicknessM:Float64Array;bedrockM:Float64Array|(number|null)[];
}
export function decodeIceInventory(value:unknown):IceInventorySeed|null {
    if(value===undefined||value===null)return null;
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid ice inventory configuration');
    const d=value as Record<string,any>,n=SURFACE_WIDTH*SURFACE_HEIGHT;
    if(d.version!==1||d.grid?.width!==SURFACE_WIDTH||d.grid?.height!==SURFACE_HEIGHT)throw new Error('Ice inventory uses a different surface grid');
    if(typeof d.source!=='string'||!d.source.trim()||d.source.length>4096)throw new Error('Missing ice inventory source');
    const read=(key:string,min:number,max:number)=>{
        const a=d[key];if((!Array.isArray(a)&&!(a instanceof Float64Array))||a.length!==n)throw new Error(`Invalid ${key} dimensions`);
        return Float64Array.from(a,(v:number)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error(`Invalid ${key}`);return v;});
    };
    const groundedThicknessM=read('groundedThicknessM',0,6000),shelfThicknessM=read('shelfThicknessM',0,6000);
    if((!Array.isArray(d.bedrockM)&&!(d.bedrockM instanceof Float64Array))||d.bedrockM.length!==n)throw new Error('Invalid bedrockM dimensions');
    const bedrockM=Array.from(d.bedrockM,(v:unknown,i)=>{if(v===null&&groundedThicknessM[i]===0&&shelfThicknessM[i]===0)return null;if(typeof v!=='number'||!Number.isFinite(v)||v< -12000||v>9000)throw new Error('Missing or invalid ice product bedrock');return v;});
    for(let i=0;i<n;i++)if(groundedThicknessM[i]>0&&shelfThicknessM[i]>0)throw new Error('Grounded ice and floating shelf overlap');
    return {version:1,grid:{width:SURFACE_WIDTH,height:SURFACE_HEIGHT},source:d.source,groundedThicknessM,shelfThicknessM,bedrockM};
}
