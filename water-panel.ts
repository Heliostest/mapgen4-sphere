import type {ThermalRuntime} from './thermal-runtime.ts';

export function installWaterPanel(root:HTMLElement,runtime:ThermalRuntime,change:(mutate:()=>void)=>void) {
    const panel=document.createElement('details');panel.id='water-panel';
    panel.innerHTML=`<summary>Water cycle</summary>
      <label><input id="water-enabled" type="checkbox"> Enable water cycle</label>
      <p class="planet-note">Rain, humidity and soil initialize from geographic rules without Play. Initial fluxes are estimates; Play continues with conservative evaporation, vapor transport, condensation and routing. Evaporation cools and condensation warms the thermal column. Snowfall accumulates; energy-limited melt feeds surface outflow. No groundwater or weather prediction.</p>
      <label><span>Mean precipitation</span><output id="water-rain"></output></label>
      <label><span>Mean evaporation</span><output id="water-evaporation"></output></label>
      <label><span>Atmosphere / soil / surface</span><output id="water-stores"></output></label>
      <label><span>Ocean inventory</span><output id="water-ocean"></output></label>
      <label><span>Water budget residual</span><output id="water-budget"></output></label>
      <label><span>Largest cell outflow</span><output id="water-flow"></output></label>
      <label><span>Time since water reset</span><output id="water-age" data-days="0"></output></label>
      <p class="planet-note" id="water-status"></p>
      <p class="planet-note">Stores above are mm water equivalent averaged over the whole globe, including ocean inventory. Outflow is transferred volume from a coarse cell, independent of the artistic river lines.</p>
      <details><summary>Water parameters</summary>
        <label><span>Evaporation energy fraction (0–1)</span><input id="water-efficiency" type="number" min="0" max="1" step="any"></label>
        <label><span>Soil capacity (mm per land area)</span><input id="water-soil-capacity" type="number" min="1" max="1000" step="any"></label>
        <label><span>Initial ocean water depth (m)</span><input id="water-depth" type="number" min="0" max="10000" step="any"></label>
        <label><span>Wind belt strength (m/s; negative reverses)</span><input id="water-wind" type="number" min="-100" max="100" step="any"></label>
        <label><span>Vapor mixing (m²/s)</span><input id="water-mixing" type="number" min="0" max="10000000" step="any"></label>
        <label><span>Surface travel speed (m/s)</span><input id="water-routing" type="number" min="0.01" max="10" step="any"></label>
        <p class="planet-note">Illustrative seasonal trade/westerly/polar wind template, not pressure-driven circulation. Upwind sea and terrain shape initial rain; subsequent rain follows the water solver. Closed depressions store water before spilling. Ocean water depth sets a finite inventory.</p>
      </details>
      <button id="water-reset" type="button">Reset temperature &amp; water</button>
      <p class="planet-note">Enabling water or changing its parameters restarts both environmental histories at the current time. Terrain painting, physical edits and manual time edits also restart them. Your terrain is preserved.</p>`;
    root.append(panel);
    const el=<T extends HTMLElement>(id:string)=>panel.querySelector<T>('#'+id)!;
    const enabled=el<HTMLInputElement>('water-enabled');
    enabled.addEventListener('change',()=>change(()=>{
        runtime.waterEnabled=enabled.checked;if(enabled.checked)runtime.enabled=true;runtime.invalidate();
    }));
    const specs:[string,keyof typeof runtime.waterConfig][]=[
        ['water-efficiency','evaporationFraction'],['water-soil-capacity','soilCapacityKgM2'],['water-depth','initialOceanDepthM'],
        ['water-wind','windMps'],['water-mixing','moistureDiffusivityM2s'],['water-routing','routingSpeedMps'],
    ];
    for(const [id,key] of specs) {
        const input=el<HTMLInputElement>(id);input.value=String(runtime.waterConfig[key]);
        input.addEventListener('change',()=>{
            if(!input.checkValidity()||!Number.isFinite(input.valueAsNumber)){input.setAttribute('aria-invalid','true');return;}
            input.removeAttribute('aria-invalid');change(()=>{runtime.waterConfig[key]=input.valueAsNumber;runtime.invalidate();});
        });
    }
    el('water-reset').addEventListener('click',()=>change(()=>runtime.invalidate()));
    const value=(id:string,text:string,n?:number)=>{const o=el<HTMLOutputElement>(id);o.value=text;if(n===undefined)delete o.dataset.value;else o.dataset.value=String(n);};
    return {
        restoreInputs(){for(const [id,key] of specs){const input=el<HTMLInputElement>(id);input.value=String(runtime.waterConfig[key]);input.removeAttribute('aria-invalid');}},
        reveal(){panel.open=true;},
        refresh() {
            enabled.checked=runtime.waterEnabled;
            const w=runtime.water,d=w?.diagnostics(),m=runtime.model;
            value('water-rain',d?`${d.rainMmDay.toFixed(3)} mm/day`:'Unavailable',d?.rainMmDay);
            value('water-evaporation',d?`${d.evaporationMmDay.toFixed(3)} mm/day`:'Unavailable',d?.evaporationMmDay);
            value('water-stores',d?`${d.atmosphereMm.toFixed(2)} / ${d.soilMm.toFixed(2)} / ${d.surfaceMm.toFixed(2)} mm`:'—');
            value('water-ocean',d?`${d.oceanMm.toFixed(2)} mm`:'—');
            value('water-budget',d?`${d.residualMm.toExponential(2)} mm`:'—',d?.residualMm);
            value('water-flow',d?`${d.maxDischargeM3S.toExponential(2)} m³/s`:'—');
            const age=el<HTMLOutputElement>('water-age');age.dataset.days=String(w&&m?(m.timeS-m.epochS)/86400:0);
            age.value=w&&m?`${((m.timeS-m.epochS)/86400).toFixed(2)} d · sampled at day ${(m.timeS/86400).toFixed(3)}`:'—';
            el('water-status').textContent=!runtime.waterEnabled?'Water model off':w&&m?`${w.grid.count} equal-area cells · ${(m.stepS/60).toFixed(2)} min shared step · ${w.elapsedS===0?'generated initial flux estimates — no elapsed time':'fluxes from the latest simulated step'}`:runtime.status;
        },
    };
}
