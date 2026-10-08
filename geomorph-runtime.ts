import {GeomorphModel,DEFAULT_GEOMORPH,type GeomorphCheckpoint} from './geomorph.ts';
import {thermalCell} from './thermal.ts';
import type {ThermalRuntime,ThermalTexture} from './thermal-runtime.ts';
import type {WaterModel} from './water.ts';
import type {TerrainPreview} from './terrain-preview.ts';
export interface GeomorphView {preview:TerrainPreview|null;texture:ThermalTexture;}

export class GeomorphRuntime {
    config={...DEFAULT_GEOMORPH};model:GeomorphModel|null=null;previewEnabled=true;
    sourceTimeS=0;status='Enable water, then capture a snapshot.';view:GeomorphView|null=null;
    sourceEstimated=false;
    private source:WaterModel|null=null;private previous:GeomorphCheckpoint|null=null;
    get canUndo(){return this.previous!==null;}
    reset(message='Preview reset. Authored terrain is unchanged.') {this.model=null;this.source=null;this.previous=null;this.view=null;this.status=message;}
    reconcile(thermal:ThermalRuntime) {
        if(this.model&&this.source!==thermal.water)this.reset('Source terrain/environment changed. Capture a new water snapshot.');
    }
    capture(thermal:ThermalRuntime) {
        const w=thermal.water;
        if(!w){this.reset('Water model unavailable. Enable water and use a supported rotation.');return;}
        this.source=w;this.sourceTimeS=thermal.model!.timeS;this.sourceEstimated=w.elapsedS===0;this.previous=null;
        this.model=new GeomorphModel(w.grid,w.radiusM,w.land,w.heightM,w.dischargeM3S,this.config);
        this.status='Snapshot captured. Geological time advances only with Evolve.';this.refreshView();
    }
    advance(years:number) {
        if(!this.model)return;
        const before=this.model.checkpoint(),result=this.model.advance(years);
        if(result.steps)this.previous=before;
        this.status=result.steps===0?`Request is below the stable step (${this.model.stepYears.toPrecision(4)} yr); increase years per click.`:
            `Advanced ${result.advancedYears.toPrecision(5)} yr in ${result.steps} steps.${result.limited?' Work limit reached; click again to continue.':''}`;
        this.refreshView();
    }
    undo(){if(this.model&&this.previous){this.model.restore(this.previous);this.previous=null;this.status='Previous geological step restored.';this.refreshView();}}
    setPreview(on:boolean){this.previewEnabled=on;this.refreshView();}
    sample(u:number,v:number){if(!this.model)return null;const m=this.model,i=thermalCell(m.grid,u,v);return {deltaM:m.heightM[i]-m.baseHeightM[i],mobileMm:1000*m.mobileM[i]};}
    private refreshView() {
        const m=this.model;if(!m){this.view=null;return;}
        const pixels=new Uint8Array(m.grid.count*4);
        for(let i=0;i<m.grid.count;i++){
            pixels[4*i]=Math.round(255*Math.max(0,Math.min(1,.5+(m.heightM[i]-m.baseHeightM[i])/200)));
            pixels[4*i+3]=Math.round(255*m.land[i]);
        }
        this.view={preview:this.previewEnabled?{grid:m.grid,land:m.land,baseHeightM:m.baseHeightM,heightM:m.heightM.slice()}:null,
            texture:{width:m.grid.width,height:m.grid.height,pixels,timeS:this.sourceTimeS}};
    }
}
