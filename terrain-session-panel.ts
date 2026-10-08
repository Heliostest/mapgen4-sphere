import {MAX_TERRAIN_FILE_BYTES} from './terrain-document.ts';
import type {ApplicationReport} from './terrain-application.ts';

export function installTerrainSessionPanel(root:HTMLElement,options:{
    save:()=>string;load:(text:string)=>void;undo:()=>void;revision:()=>string;
    state:()=>{pending:boolean;canUndo:boolean;report:ApplicationReport|null;revision:number;accepted:number};
}) {
    const panel=document.createElement('details');panel.id='terrain-session';panel.open=true;
    panel.innerHTML=`<summary>Terrain document</summary>
      <button type="button" id="terrain-undo-apply">Undo last application</button>
      <button type="button" id="terrain-save">Download terrain JSON</button>
      <label><span>Load terrain JSON</span><input id="terrain-load" type="file" accept=".json,application/json"></label>
      <p class="planet-note" id="terrain-generation" role="status"></p>
      <p class="planet-note" id="terrain-application"></p>
      <p class="planet-note" id="terrain-file-status" role="status"></p>
      <p class="planet-note">Saves current authored terrain, applied erosion, view and planet settings. Preview, climate history and undo history are not saved. Load replaces the terrain, pauses time and disables climate. Undo application preserves later painting. Reset clears painting and applied erosion.</p>`;
    root.append(panel);
    const el=<T extends HTMLElement>(id:string)=>panel.querySelector<T>('#'+id)!;
    const status=el('terrain-file-status');let loadToken=0;
    el('terrain-undo-apply').addEventListener('click',()=>options.undo());
    el('terrain-save').addEventListener('click',()=>{
        try {
            const text=options.save(),url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
            const a=document.createElement('a');a.href=url;a.download='mapgen4-sphere-terrain.json';a.click();
            setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Terrain document downloaded. Climate and preview are excluded.';
        }catch(error){status.textContent=`Save failed: ${error instanceof Error?error.message:error}`;}
    });
    const input=el<HTMLInputElement>('terrain-load');
    input.addEventListener('change',async()=>{
        const file=input.files?.[0];input.value='';if(!file)return;
        const token=++loadToken,revision=options.revision();
        status.textContent='Reading terrain document…';
        try {
            if(file.size>MAX_TERRAIN_FILE_BYTES)throw new Error('Terrain file exceeds 8 MiB');
            const text=await file.text();if(token!==loadToken)return;
            if(revision!==options.revision()){status.textContent='Load canceled because newer edits were made.';return;}
            options.load(text);status.textContent='Terrain document loaded. Rebuilding terrain; climate history starts fresh.';
        }catch(error){if(token===loadToken)status.textContent=`Load failed: ${error instanceof Error?error.message:error}`;}
    });
    return {refresh(){
        const s=options.state();el<HTMLButtonElement>('terrain-save').disabled=s.pending;
        el<HTMLButtonElement>('terrain-undo-apply').disabled=!s.canUndo;
        const generation=el('terrain-generation');generation.dataset.revision=String(s.revision);generation.dataset.accepted=String(s.accepted);generation.dataset.pending=String(s.pending);
        generation.textContent=s.pending?'Rebuilding terrain and rivers…':'Terrain ready';
        const r=s.report,out=el('terrain-application');out.dataset.applied=String(!!r);
        out.textContent=r?`Applied ${r.years.toLocaleString()} geological yr from source day ${(r.sourceTimeS/86400).toFixed(3)}. ${r.clipped} triangles clipped. Report only: ${r.mobileKm3.toExponential(2)} km³ mobile / ${r.oceanKm3.toExponential(2)} km³ ocean sediment.`:'No applied erosion layer.';
    }};
}
