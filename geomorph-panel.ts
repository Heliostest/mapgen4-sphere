import type {GeomorphRuntime} from './geomorph-runtime.ts';
import type {ThermalRuntime} from './thermal-runtime.ts';

export function installGeomorphPanel(root:HTMLElement,g:GeomorphRuntime,thermal:ThermalRuntime,change:(action:()=>void)=>void) {
    const panel=document.createElement('details');panel.id='geomorph-panel';
    panel.innerHTML=`<summary>Erosion &amp; deposition preview</summary>
      <p class="planet-note">Stage D preview. Capture the current water discharge, then evolve in separate geological years. Astronomy Play does not advance erosion. Dry cells can still undergo slope smoothing.</p>
      <button id="geomorph-capture" type="button">Capture current water</button>
      <label><span>Years per click (requested)</span><input id="geomorph-duration" type="number" min="0.01" max="100000000" step="any" value="100000"></label>
      <button id="geomorph-step" type="button">Evolve terrain</button>
      <button id="geomorph-undo" type="button">Undo last evolve</button>
      <label><input id="geomorph-preview" type="checkbox" checked> Preview geometry</label>
      <button id="geomorph-reset" type="button">Reset erosion preview</button>
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
        <p class="planet-note">Illustrative, uncalibrated coefficients. Incision uses sqrt(discharge / 1000m³/s) × slope. Equal bulk density, no uplift or compaction. Changing these parameters clears the preview.</p>
      </details>
      <p class="planet-note">Preview preserves authored detail. Climate and artistic rivers still describe the source terrain. No permanent application or persistence yet. Painting, physical/environment resets or disabling water clear this experiment; comparison and undo preserve your painting.</p>`;
    root.append(panel);
    const el=<T extends HTMLElement>(id:string)=>panel.querySelector<T>('#'+id)!;
    el('geomorph-capture').addEventListener('click',()=>change(()=>g.capture(thermal)));
    const duration=el<HTMLInputElement>('geomorph-duration');
    const validDuration=()=>{const valid=duration.checkValidity()&&Number.isFinite(duration.valueAsNumber);if(valid)duration.removeAttribute('aria-invalid');else duration.setAttribute('aria-invalid','true');return valid;};
    duration.addEventListener('change',validDuration);
    el('geomorph-step').addEventListener('click',()=>{if(validDuration())change(()=>g.advance(duration.valueAsNumber));});
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
        el<HTMLButtonElement>('geomorph-capture').disabled=!thermal.water;
        el<HTMLButtonElement>('geomorph-step').disabled=!m;el<HTMLButtonElement>('geomorph-undo').disabled=!g.canUndo;
        preview.checked=g.previewEnabled;
        const age=el<HTMLOutputElement>('geomorph-age');age.dataset.years=String(m?.years??0);age.value=m?`${m.years.toLocaleString(undefined,{maximumFractionDigits:2})} yr`:'No snapshot';
        el<HTMLOutputElement>('geomorph-range').value=d?`${d.minChangeM.toFixed(2)} to ${d.maxChangeM.toFixed(2)} m`:'—';
        el<HTMLOutputElement>('geomorph-sediment').value=d?`${d.mobileKm3.toExponential(2)} / ${d.oceanKm3.toExponential(2)} km³`:'—';
        const budget=el<HTMLOutputElement>('geomorph-budget');budget.value=d?`${d.residualMm.toExponential(2)} mm global equivalent`:'—';budget.dataset.value=String(d?.residualMm??0);
        el('geomorph-status').textContent=g.status;
        el('geomorph-source').textContent=m?`Frozen latest-step discharge from day ${(g.sourceTimeS/86400).toFixed(3)}; not a yearly average. Max ${(Math.max(...m.dischargeM3S)).toExponential(2)} m³/s. Stable step ${m.stepYears.toPrecision(4)} yr; ≤32 per click.`:'Enable Water cycle or select a water layer before capture.';
    }};
}
