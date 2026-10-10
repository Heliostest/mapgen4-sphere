import {directionToUV} from './sphere.ts';
import {previewElevation,type TerrainPreview} from './terrain-preview.ts';

export interface ApplicationReport {
    years:number;sourceTimeS:number;clipped:number;mobileKm3:number;oceanKm3:number;
    /** Elevation dataset underlying this layer; zero years means import only. */
    importedFrom?:string;
}
export function bakeTerrainOffsets(base:Float32Array,physical:Float32Array,xyz:Float32Array,preview:TerrainPreview) {
    if(base.length!==physical.length||xyz.length!==base.length*3)throw new RangeError('Terrain snapshot size mismatch');
    const offsets=new Float32Array(base.length);let clipped=0;
    for(let t=0;t<base.length;t++) {
        const [u,v]=directionToUV([xyz[3*t],xyz[3*t+1],xyz[3*t+2]]);
        const target=previewElevation(physical[t],u,v,preview);
        if(!Number.isFinite(target)||!Number.isFinite(base[t]))throw new RangeError('Invalid terrain snapshot');
        const bounded=Math.max(-1,Math.min(1,target));if(bounded!==target)clipped++;
        offsets[t]=bounded-base[t];
    }
    return {offsets,clipped};
}

/** Only the application layer is reversible: never roll back later author edits. */
export class TerrainApplication {
    offsets:Float32Array|null=null;
    report:ApplicationReport|null=null;
    private previous:{offsets:Float32Array|null;report:ApplicationReport|null}|null=null;
    get canUndo(){return this.previous!==null;}
    apply(offsets:Float32Array,report:ApplicationReport) {
        this.previous={offsets:this.offsets,report:this.report};
        this.offsets=offsets.slice();this.report={...report};
    }
    undo(){if(this.previous){const p=this.previous;this.offsets=p.offsets;this.report=p.report;this.previous=null;}}
    restore(offsets:Float32Array|null,report:ApplicationReport|null){this.offsets=offsets?.slice()??null;this.report=report?{...report}:null;this.previous=null;}
    reset(){this.restore(null,null);}
}
