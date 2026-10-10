import type {ThermalRuntime} from './thermal-runtime.ts';
import {installInfoNotes} from './panel-info.ts';

/** UI for the deliberately small seasonal model; numerical state lives elsewhere. */
export function installThermalPanel(root:HTMLElement,thermal:ThermalRuntime,change:(mutate:()=>void)=>void) {
    const panel=document.createElement('details');panel.id='thermal-panel';
    panel.innerHTML=`<summary>Seasonal temperature</summary>
        <label><input id="thermal-enabled" type="checkbox"> Enable thermal model</label>
        <p class="planet-note" data-info-for="thermal-enabled">Ready without Play: latitude, season, sea influence and altitude generate a daily-mean reference climate. Play evolves that state; oceans respond more slowly. With water enabled, ice/snow albedo, phase-change energy and ocean heat transport feed back on temperature. No hourly temperature or pressure solver.</p>
        <label><span>Global mean</span><output id="thermal-mean">Off</output></label>
        <label><span>Temperature range</span><output id="thermal-range">—</output></label>
        <label><span>Time since thermal reset</span><output id="thermal-age" data-days="0">—</output></label>
        <p class="planet-note" id="thermal-status"></p>
        <details><summary>Thermal parameters</summary>
          <label><span>Effective IR emissivity (0.1–1)</span><input id="thermal-emissivity" type="number" min="0.1" max="1" step="any"></label>
          <label><span>Land heat capacity (MJ/m²/K)</span><input id="thermal-capacity" type="number" min="0.1" max="100" step="any"></label>
          <label><span>Ocean mixed-layer depth (m)</span><input id="thermal-depth" type="number" min="0.1" max="100" step="any"></label>
          <label><span>Heat transport at Earth radius (W/m²/K)</span><input id="thermal-diffusion" type="number" min="0" max="5" step="any"></label>
          <p class="planet-note" data-info-for="thermal-emissivity">Emissivity is an effective radiation parameter, not measured atmospheric composition. Transport scales with inverse radius squared.</p>
        </details>
        <button id="thermal-reset" type="button">Reset temperature &amp; water</button>
        <p class="planet-note" data-info-for="thermal-reset">Terrain, physical parameters and manual time edits regenerate the reference climate at the selected date. Camera and display scale preserve history. The reference is an illustrative estimate, not a spun-up equilibrium. Use Download complete simulation to save runtime fields.</p>`;
    root.append(panel);
    installInfoNotes(panel);
    const el=<T extends HTMLElement>(id:string)=>panel.querySelector<T>('#'+id)!;
    const enabled=el<HTMLInputElement>('thermal-enabled');
    enabled.addEventListener('change',()=>change(()=>{thermal.enabled=enabled.checked;thermal.invalidate();}));
    const specs:[string,Exclude<keyof typeof thermal.config,'separateReservoirs'>,number][]=[
        ['thermal-emissivity','emissivity',1],['thermal-capacity','landHeatCapacity',1e6],
        ['thermal-depth','oceanDepthM',1],['thermal-diffusion','diffusion',1],
    ];
    for(const [id,key,scale] of specs) {
        const input=el<HTMLInputElement>(id);input.value=String(thermal.config[key]/scale);
        input.addEventListener('change',()=>{
            if(!input.checkValidity()||!Number.isFinite(input.valueAsNumber)) {input.setAttribute('aria-invalid','true');return;}
            input.removeAttribute('aria-invalid');
            change(()=>{thermal.config[key]=input.valueAsNumber*scale;thermal.invalidate();});
        });
    }
    el('thermal-reset').addEventListener('click',()=>change(()=>thermal.invalidate()));
    return {
        restoreInputs(){for(const [id,key,scale] of specs){const input=el<HTMLInputElement>(id);input.value=String(thermal.config[key]/scale);input.removeAttribute('aria-invalid');}},
        refresh(clockTimeS:number,limited:boolean) {
            enabled.checked=thermal.enabled;
            const m=thermal.model,d=m?.diagnostics();
            el<HTMLOutputElement>('thermal-mean').value=d?`${(d.meanK-273.15).toFixed(1)} °C`:'Unavailable';
            el<HTMLOutputElement>('thermal-range').value=d?`${(d.minK-273.15).toFixed(1)} to ${(d.maxK-273.15).toFixed(1)} °C`:'—';
            el('thermal-range').dataset.min=String(d?.minK??0);el('thermal-range').dataset.max=String(d?.maxK??0);
            const age=el<HTMLOutputElement>('thermal-age');age.dataset.days=String(m?(m.timeS-m.epochS)/86400:0);
            age.value=m?`${((m.timeS-m.epochS)/86400).toFixed(2)} d · sampled at day ${(m.timeS/86400).toFixed(3)}`:'—';
            el('thermal-status').textContent=thermal.status+(m?` · energy residual ${d!.budgetResidualJm2.toExponential(1)} J/m² · field lag ${Math.max(0,(clockTimeS-m.timeS)/60).toFixed(1)} min`:'')+
                (m && limited?' · speed limited by stable heat steps':'');
            el<HTMLButtonElement>('thermal-reset').disabled=!thermal.enabled;
        },
        reveal() {panel.open=true;},
    };
}
