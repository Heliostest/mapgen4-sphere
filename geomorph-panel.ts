import type {GeomorphRuntime} from './geomorph-runtime.ts';
import type {ThermalRuntime} from './thermal-runtime.ts';
import {installInfoNotes} from './panel-info.ts';

export function installGeomorphPanel(root:HTMLElement,g:GeomorphRuntime,thermal:ThermalRuntime,change:(action:()=>void)=>void,
    application:{ready:()=>boolean;apply:()=>void}={ready:()=>true,apply:()=>{}}) {
    const panel=document.createElement('details');panel.id='geomorph-panel';
    panel.innerHTML=`<summary>Erosion &amp; deposition preview</summary>
      <p class="planet-note" data-info-for="geomorph-panel">Capture the current water discharge, then evolve the river/slope preview in separate geological years. Grounded ice accumulates glacial abrasion on the Astronomy Play clock; Capture glacial erosion imports that history. Dry cells can still undergo slope smoothing.</p>
      <button id="geomorph-capture" type="button">Capture current water</button>
      <button id="geomorph-capture-glacier" type="button">Capture glacial erosion</button>
      <label><span>Years per click (requested)</span><input id="geomorph-duration" type="number" min="0.01" max="100000000" step="any" value="100000"></label>
      <button id="geomorph-step" type="button">Evolve terrain</button>
      <button id="geomorph-undo" type="button">Undo last evolve</button>
      <label><input id="geomorph-preview" type="checkbox" checked> Preview geometry</label>
      <button id="geomorph-reset" type="button">Reset erosion preview</button>
      <button id="geomorph-apply" type="button">Apply erosion to terrain</button>
      <label><span>Geological time</span><output id="geomorph-age" data-years="0"></output></label>
      <label><span>Net height change</span><output id="geomorph-range"></output></label>
      <label><span>Mobile / ocean sediment</span><output id="geomorph-sediment"></output></label>
      <label><span>Solid budget residual</span><output id="geomorph-budget"></output></label>
      <p class="planet-note" id="geomorph-status"></p>
      <p class="planet-note" id="geomorph-source"></p>
      <details><summary>Erosion parameters</summary>
        <label><span>Incision coefficient (m/yr)</span><input id="geomorph-erodibility" type="number" min="0" max="100" step="any"></label>
        <label><span>Slope smoothing (m²/yr)</span><input id="geomorph-diffusion" type="number" min="0" max="10000000" step="any"></label>
        <label><span>Sediment settling time (yr)</span><input id="geomorph-settling" type="number" min="1" max="1000000" step="any"></label>
        <p class="planet-note" data-info-for="geomorph-erodibility">Illustrative, uncalibrated coefficients. Incision uses sqrt(discharge / 1000m³/s) × slope. Equal bulk density, no uplift or compaction. Changing these parameters clears the preview.</p>
      </details>
      <p class="planet-note" data-info-for="geomorph-apply">Preview retains source climate and artistic rivers. Apply stores bed-height changes, rebuilds rivers and restarts the environment; rebuilt geometry may differ from preview. Heights clamp to the terrain range. Mobile and ocean sediment are recorded in the application report only; applying is not a conservative transfer to the fine mesh. New captures start new budgets. Painting and environment resets clear the preview.</p>`;
    root.append(panel);
    installInfoNotes(panel);
    const el=<T extends HTMLElement>(id:string)=>panel.querySelector<T>('#'+id)!;
    el('geomorph-capture').addEventListener('click',()=>{if(application.ready())change(()=>g.capture(thermal));});
    el('geomorph-capture-glacier').addEventListener('click',()=>{if(application.ready())change(()=>g.captureGlacier(thermal));});
    el('geomorph-apply').addEventListener('click',()=>{if(application.ready())change(application.apply);});
    const duration=el<HTMLInputElement>('geomorph-duration');
    const validDuration=()=>{const valid=duration.checkValidity()&&Number.isFinite(duration.valueAsNumber);if(valid)duration.removeAttribute('aria-invalid');else duration.setAttribute('aria-invalid','true');return valid;};
    duration.addEventListener('change',validDuration);
    el('geomorph-step').addEventListener('click',()=>{if(application.ready()&&validDuration())change(()=>g.advance(duration.valueAsNumber));});
    el('geomorph-undo').addEventListener('click',()=>change(()=>g.undo()));
    el('geomorph-reset').addEventListener('click',()=>change(()=>g.reset()));
    const preview=el<HTMLInputElement>('geomorph-preview');preview.addEventListener('change',()=>change(()=>g.setPreview(preview.checked)));
    for(const [id,key] of [['geomorph-erodibility','erodibilityMYr'],['geomorph-diffusion','diffusivityM2Yr'],['geomorph-settling','settlingYears']] as const) {
        const input=el<HTMLInputElement>(id);input.value=String(g.config[key]);
        input.addEventListener('change',()=>{
            if(!input.checkValidity()||!Number.isFinite(input.valueAsNumber)){input.setAttribute('aria-invalid','true');return;}
            input.removeAttribute('aria-invalid');change(()=>{g.config[key]=input.valueAsNumber;g.reset('Erosion parameters changed. Capture a new water snapshot.');});
        });
    }
    return {reveal(){panel.open=true;},refresh(){
        const m=g.model,d=m?.diagnostics();
        const pending=!application.ready();
        el<HTMLButtonElement>('geomorph-capture').disabled=!thermal.water||pending;
        el<HTMLButtonElement>('geomorph-capture-glacier').disabled=!thermal.water?.glacier||pending;
        el<HTMLButtonElement>('geomorph-step').disabled=!m||pending;el<HTMLButtonElement>('geomorph-undo').disabled=!g.canUndo;
        el<HTMLButtonElement>('geomorph-apply').disabled=pending||!m||m.years<=0||!g.view?.preview;
        preview.checked=g.previewEnabled;
        const age=el<HTMLOutputElement>('geomorph-age');age.dataset.years=String(m?.years??0);age.value=m?`${m.years.toLocaleString(undefined,{maximumFractionDigits:2})} yr`:'No snapshot';
        el<HTMLOutputElement>('geomorph-range').value=d?`${d.minChangeM.toFixed(2)} to ${d.maxChangeM.toFixed(2)} m`:'—';
        el<HTMLOutputElement>('geomorph-sediment').value=d?`${d.mobileKm3.toExponential(2)} / ${d.oceanKm3.toExponential(2)} km³`:'—';
        const budget=el<HTMLOutputElement>('geomorph-budget');budget.value=d?`${d.residualMm.toExponential(2)} mm global equivalent`:'—';budget.dataset.value=String(d?.residualMm??0);
        el('geomorph-status').textContent=g.status;
        el('geomorph-source').textContent=m?`Frozen ${g.sourceEstimated?'generated initial discharge estimate':'latest-step discharge'} from day ${(g.sourceTimeS/86400).toFixed(3)}; not a yearly average. Max ${(Math.max(...m.dischargeM3S)).toExponential(2)} m³/s. Stable step ${m.stepYears.toPrecision(4)} yr; ≤32 per click.`:'Enable Water cycle or select a water layer before capture.';
    }};
}
