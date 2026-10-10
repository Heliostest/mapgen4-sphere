import {MAX_SIMULATION_FILE_BYTES} from './simulation-document.ts';
import type {ApplicationReport} from './terrain-application.ts';
import {installInfoNotes} from './panel-info.ts';

export function installTerrainSessionPanel(root:HTMLElement,options:{
    beforeLoad:()=>void;
    save:()=>string;saveSimulation:()=>string;load:(text:string,stillCurrent:()=>boolean)=>Promise<string>|string;undo:()=>void;revision:()=>string;
    state:()=>{pending:boolean;canUndo:boolean;report:ApplicationReport|null;revision:number;accepted:number};
}) {
    const panel=document.createElement('details');panel.id='terrain-session';panel.open=true;
    panel.innerHTML=`<summary>Save &amp; restore world</summary>
      <button type="button" id="terrain-undo-apply">Undo last application</button>
      <button type="button" id="simulation-save">Download complete simulation</button>
      <button type="button" id="terrain-save">Download terrain JSON</button>
      <label><span>Load simulation / terrain JSON</span><input id="terrain-load" type="file" accept=".json,application/json"></label>
      <p class="planet-note" id="terrain-generation" role="status"></p>
      <p class="planet-note" id="terrain-application"></p>
      <p class="planet-note" id="terrain-file-status" role="status"></p>
      <p class="planet-note" data-info-for="terrain-session">Complete simulation saves terrain, climate, water, ice, vegetation, time, settings and comparison history (up to 32 MiB). Restores paused at the saved moment. Terrain-only files (8 MiB) start fresh with climate off. Unapplied erosion preview and undo history are excluded from both. Loading is canceled if you edit or time advances during preparation.</p>`;
    root.append(panel);
    installInfoNotes(panel);
    const el=<T extends HTMLElement>(id:string)=>panel.querySelector<T>('#'+id)!;
    const status=el('terrain-file-status');let loadToken=0;
    el('terrain-undo-apply').addEventListener('click',()=>options.undo());
    el('simulation-save').addEventListener('click',()=>{
        try {
            const text=options.saveSimulation(),url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
            const a=document.createElement('a');a.href=url;a.download='mapgen4-sphere-simulation.json';a.click();
            setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Complete simulation downloaded. Unapplied erosion preview and undo history are excluded.';
        }catch(error){status.textContent=`Save failed: ${error instanceof Error?error.message:error}`;}
    });
    el('terrain-save').addEventListener('click',()=>{
        try {
            const text=options.save(),url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
            const a=document.createElement('a');a.href=url;a.download='mapgen4-sphere-terrain.json';a.click();
            setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Terrain document downloaded. Climate and preview are excluded.';
        }catch(error){status.textContent=`Save failed: ${error instanceof Error?error.message:error}`;}
    });
    const input=el<HTMLInputElement>('terrain-load');
    // Freeze autoplay before choosing/reading a file so candidate preparation
    // is not canceled by the clock advancing underneath it.
    input.addEventListener('click',()=>options.beforeLoad());
    input.addEventListener('change',async()=>{
        const file=input.files?.[0];input.value='';if(!file)return;
        options.beforeLoad();
        const token=++loadToken,revision=options.revision();
        status.textContent='Reading saved world…';
        try {
            if(file.size>MAX_SIMULATION_FILE_BYTES)throw new Error('Simulation file exceeds 32 MiB');
            const text=await file.text();if(token!==loadToken)return;
            if(revision!==options.revision()){status.textContent='Load canceled because newer edits were made.';return;}
            status.textContent='Preparing saved world…';
            const message=await options.load(text,()=>token===loadToken&&revision===options.revision());
            if(token===loadToken)status.textContent=message;
        }catch(error){if(token===loadToken)status.textContent=`Load failed: ${error instanceof Error?error.message:error}`;}
    });
    return {refresh(){
        const s=options.state();el<HTMLButtonElement>('terrain-save').disabled=s.pending;
        el<HTMLButtonElement>('simulation-save').disabled=s.pending;
        el<HTMLButtonElement>('terrain-undo-apply').disabled=!s.canUndo;
        const generation=el('terrain-generation');generation.dataset.revision=String(s.revision);generation.dataset.accepted=String(s.accepted);generation.dataset.pending=String(s.pending);
        generation.textContent=s.pending?'Rebuilding terrain and rivers…':'Terrain ready';
        const r=s.report,out=el('terrain-application');out.dataset.applied=String(!!r);
        const origin=r?.importedFrom?`Elevation imported from ${r.importedFrom}. `:'';
        out.textContent=r?origin+(r.importedFrom&&r.years===0?'Imported heights retained; no erosion applied.':`Applied ${r.years.toLocaleString()} geological yr from source day ${(r.sourceTimeS/86400).toFixed(3)}. ${r.clipped} triangles clipped. Report only: ${r.mobileKm3.toExponential(2)} km³ mobile / ${r.oceanKm3.toExponential(2)} km³ ocean sediment.`):'No applied erosion layer.';
    }};
}
