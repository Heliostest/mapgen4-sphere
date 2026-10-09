import type {ThermalRuntime} from './thermal-runtime.ts';
import {captureEnvironment,environmentMetrics,comparisonCSV,METRICS,type EnvironmentSnapshot,type EnvironmentMetrics} from './environment-comparison.ts';
const clamp=(v:number)=>Math.max(0,Math.min(1,v));

export function installEnvironmentPanel(root:HTMLElement,rt:ThermalRuntime,change:(action:()=>void)=>void,clock:{togglePlay:()=>void;isPlaying:()=>boolean}) {
    const panel=document.createElement('details');panel.id='environment-panel';panel.innerHTML=`<summary>Ice, ocean &amp; vegetation</summary>
      <p class="planet-note">Generate climate initializes all systems immediately. Play evolves frozen water, latent heat, currents and vegetation. Comparison keeps a captured baseline across parameter edits.</p>
      <label><span>Ocean circulation strength (m/s)</span><input id="environment-current" type="number" min="0" max="2" step="0.05" value="0.3"></label>
      <label><input id="environment-vegetation" type="checkbox" checked> Evolve vegetation &amp; feedback</label>
      <label><input id="environment-albedo" type="checkbox" checked> Ice / snow albedo feedback</label>
      <label><span>Snow / sea-ice inventory</span><output id="environment-frozen"></output></label>
      <label><span>Snowmelt</span><output id="environment-melt"></output></label>
      <label><span>Combined energy residual</span><output id="environment-energy"></output></label>
      <button id="environment-compare" type="button">Compare environment…</button>
      <p class="planet-note">Stores use global mm water equivalent. Snowmelt enters surface outflow; capture that water snapshot in Erosion to use it. Ocean currents are prescribed closed gyres within wet cells, not a pressure or deep-ocean solver. Vegetation responds over years; no species or carbon cycle. Runtime histories and these switches are not saved in terrain files.</p>`;
    root.append(panel);
    const el=<T extends HTMLElement>(id:string)=>panel.querySelector<T>('#'+id)!;
    el<HTMLInputElement>('environment-current').addEventListener('change',event=>{
        const input=event.target as HTMLInputElement;if(!input.checkValidity()||!Number.isFinite(input.valueAsNumber)){input.setAttribute('aria-invalid','true');return;}
        input.removeAttribute('aria-invalid');change(()=>{rt.environmentConfig.oceanStrengthMps=input.valueAsNumber;rt.invalidate();});
    });
    for(const [id,key] of [['environment-vegetation','vegetation'],['environment-albedo','iceAlbedo']] as const)el<HTMLInputElement>(id).addEventListener('change',()=>change(()=>{rt.environmentConfig[key]=el<HTMLInputElement>(id).checked;rt.invalidate();}));
    const dialog=document.createElement('dialog');dialog.id='environment-comparison';dialog.setAttribute('aria-labelledby','environment-title');
    dialog.innerHTML=`<style>
      #environment-comparison{box-sizing:border-box;width:min(1180px,95vw);max-height:94vh;padding:24px;border:1px solid #46606d;border-radius:14px;background:#101e27;color:#e3edf0;font:14px/1.5 system-ui,sans-serif;overflow:auto}
      #environment-comparison::backdrop{background:#061017bb} #environment-comparison *{box-sizing:border-box}
      #environment-comparison h2{font-size:24px;margin:0} #environment-comparison h3{font-size:15px;margin:0 0 8px}
      #environment-comparison p{margin:8px 0;color:#aec4cf} #environment-comparison button,#environment-comparison select{font:inherit;padding:8px 12px;border:1px solid #526f7c;border-radius:6px;color:#e3edf0;background:#213743;cursor:pointer}
      #environment-comparison button:hover{background:#34525f} #environment-comparison header,#environment-comparison nav{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:16px}
      #environment-comparison nav{justify-content:flex-start} #environment-comparison .env-pair{display:grid;grid-template-columns:1fr 1fr;gap:18px} #environment-comparison article{min-width:0;background:#172b36;border:1px solid #2b4552;padding:14px;border-radius:8px;margin-bottom:16px}
      #environment-comparison canvas{display:block;width:100%;height:auto;border-radius:4px} #environment-comparison table{color:#e3edf0;width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}
      #environment-comparison th,#environment-comparison td{padding:7px 6px;text-align:right;border-bottom:1px solid #2b4552} #environment-comparison th:first-child,#environment-comparison td:first-child{text-align:left}
      #environment-comparison code{display:block;font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere} #environment-comparison caption{text-align:left;font-size:15px;font-weight:600;margin-bottom:8px} #environment-comparison .env-scroll{overflow-x:auto}
      #environment-comparison .env-sub{font-size:12px;min-height:38px} #environment-comparison .env-legend{font-size:12px;color:#9cb8c5}
      @media(max-width:650px){#environment-comparison{padding:12px}#environment-comparison .env-pair{grid-template-columns:1fr}#environment-comparison h2{font-size:20px}}
    </style>
    <header><div><h2 id="environment-title">Environment comparison</h2><p>Generated baseline → evolving planet</p></div><button id="environment-close" type="button" aria-label="Close comparison">Close</button></header>
    <nav><button id="environment-play" type="button">Play</button><button id="environment-capture" type="button">Use current as baseline</button><button id="environment-export" type="button">Export comparison CSV</button>
      <label>Map <select id="environment-map"><option value="surface">Natural surface</option><option value="temperatureC">Temperature</option><option value="snowMm">Snow water equivalent</option><option value="iceM">Sea-ice thickness</option><option value="vegetation">Vegetation cover</option><option value="currents">Ocean currents</option></select></label></nav>
    <p id="environment-comparison-status" role="status"></p>
    <div class="env-pair"><article><h3>Baseline</h3><p id="environment-baseline-label" class="env-sub"></p><canvas id="environment-baseline-map" width="768" height="384" aria-label="Baseline global map"></canvas></article>
      <article><h3>Current</h3><p id="environment-current-label" class="env-sub"></p><canvas id="environment-current-map" width="768" height="384" aria-label="Current global map"></canvas></article></div>
    <p id="environment-map-legend" class="env-legend"></p><p id="environment-map-probe" class="env-sub">Move over either map to compare the same location. North is at the top; longitude wraps at the edges.</p>
    <div class="env-pair"><article class="env-scroll"><table><caption>Budgets &amp; coverage</caption><thead><tr><th>Metric</th><th>Baseline</th><th>Current</th><th>Δ</th></tr></thead><tbody id="environment-metrics"></tbody></table></article>
      <div><article><h3>Temperature by latitude</h3><canvas id="environment-latitudes" width="760" height="330" aria-label="Latitude temperature profiles"></canvas><p class="env-legend">Baseline dashed gold · Current cyan · longitude mean, °C</p></article>
      <article><h3>Evolution since generation</h3><canvas id="environment-history" width="760" height="260" aria-label="Time history of snow, ice and vegetation coverage"></canvas><p class="env-legend">Ocean ice cyan · Land snow white · Vegetation green · coverage 0–100%</p></article></div></div>
    <details><summary>Captured parameters</summary><div class="env-pair"><code id="environment-baseline-parameters"></code><code id="environment-current-parameters"></code></div></details>
    <p class="env-legend">Maps are geographic estimates downscaled from conservative cells. Snow and ice thickness are water-budget estimates, not observations; ice drift and glacier flow are absent. Polar percentages refer to available ocean area, so different land masks need not give equal poles. Changing terrain, date or physics regenerates state; the captured baseline stays until replaced. History shows this generation only, at most 240 samples.</p>`;
    document.body.append(dialog);
    const get=<T extends HTMLElement>(id:string)=>dialog.querySelector<T>('#'+id)!;
    let baseline:EnvironmentSnapshot|null=null,current:EnvironmentSnapshot|null=null,model=rt.model;
    let history:{time:number;metrics:EnvironmentMetrics}[]=[],lastTime=-1;
    const format=(v:number)=>Math.abs(v)>0&&Math.abs(v)<.001?v.toExponential(2):v.toFixed(2);
    const selected=()=>get<HTMLSelectElement>('environment-map').value;
    function drawMap(canvas:HTMLCanvasElement,s:EnvironmentSnapshot) {
        const ctx=canvas.getContext('2d')!,source=document.createElement('canvas');source.width=s.width;source.height=s.height;
        const sc=source.getContext('2d')!,img=sc.createImageData(s.width,s.height),mode=selected();
        for(let i=0;i<s.land.length;i++) {
            let rgb=Array.from(s.rgb.subarray(i*3,i*3+3));const sea=s.land[i]<.5;
            if(mode==='temperatureC'){const f=clamp((s.temperatureC[i]+50)/100);rgb=f<.5?[40+f*390,90+f*290,160+f*170]:[235,235-(f-.5)*370,245-(f-.5)*430];}
            if(mode==='snowMm'||mode==='iceM'||mode==='vegetation'){
                const applicable=mode==='iceM'?sea:!sea,v=mode==='snowMm'?clamp(s.snowMm[i]/150):mode==='iceM'?clamp(s.iceM[i]/2):s.vegetation[i];
                rgb=applicable?(mode==='vegetation'?[145-100*v,117+43*v,78-8*v]:[35+200*v,74+171*v,102+148*v]):[24,43,54];
            }
            img.data.set([...rgb,255],i*4);
        }
        sc.putImageData(img,0,0);ctx.imageSmoothingEnabled=true;ctx.drawImage(source,0,0,canvas.width,canvas.height);
        ctx.strokeStyle='#c9e9ed33';ctx.lineWidth=1;for(const y of [1/6,1/2,5/6]){ctx.beginPath();ctx.moveTo(0,y*canvas.height);ctx.lineTo(canvas.width,y*canvas.height);ctx.stroke();}
        if(mode==='currents') {
            const max=Math.max(.0001,...s.east.map((v,i)=>Math.hypot(v,s.north[i])));ctx.strokeStyle='#74f1ef';ctx.lineWidth=2;
            for(let j=3;j<s.height-2;j+=4)for(let x=2;x<s.width;x+=4) {
                const i=j*s.width+x,east=s.east[i],north=s.north[i],speed=Math.hypot(east,north);if(s.land[i]>.5||speed<max*.01)continue;
                const px=(x+.5)/s.width*canvas.width,py=j/(s.height-1)*canvas.height,len=8+14*Math.sqrt(speed/max),dx=east/speed*len,dy=-north/speed*len;
                ctx.beginPath();ctx.moveTo(px-dx/2,py-dy/2);ctx.lineTo(px+dx/2,py+dy/2);ctx.lineTo(px+dx/2-dx*.3+dy*.2,py+dy/2-dy*.3-dx*.2);ctx.moveTo(px+dx/2,py+dy/2);ctx.lineTo(px+dx/2-dx*.3-dy*.2,py+dy/2-dy*.3+dx*.2);ctx.stroke();
            }
        }
    }
    function chart(id:string,series:{values:number[];color:string;dashed?:boolean}[],min:number,max:number,left:string,right:string,times?:number[]) {
        const c=get<HTMLCanvasElement>(id),ctx=c.getContext('2d')!,x0=60,y0=24,width=c.width-82,height=c.height-65;
        ctx.clearRect(0,0,c.width,c.height);ctx.font='18px system-ui';ctx.fillStyle='#a7c3ce';ctx.strokeStyle='#42606e';ctx.lineWidth=1;ctx.setLineDash([]);
        for(let j=0;j<=4;j++){const y=y0+height*j/4;ctx.fillText((max-(max-min)*j/4).toFixed(0),5,y+6);ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x0+width,y);ctx.stroke();}
        ctx.fillText(left,x0,c.height-10);ctx.textAlign='right';ctx.fillText(right,x0+width,c.height-10);ctx.textAlign='left';
        for(const s of series){ctx.strokeStyle=s.color;ctx.lineWidth=3;ctx.setLineDash(s.dashed?[8,6]:[]);ctx.beginPath();s.values.forEach((v,i)=>{const x=x0+width*(times?(times[i]-times[0])/Math.max(1e-9,times.at(-1)!-times[0]):i/Math.max(1,s.values.length-1)),y=y0+height*(1-(v-min)/(max-min));if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();if(s.values.length===1){ctx.fillStyle=s.color;ctx.beginPath();ctx.arc(x0,y0+height*(1-(s.values[0]-min)/(max-min)),4,0,Math.PI*2);ctx.fill();}}
        ctx.setLineDash([]);
    }
    function render() {
        if(!baseline||!current)return;
        for(const [name,s] of [['baseline',baseline],['current',current]] as const){get('environment-'+name+'-label').textContent=`Day ${(s.timeS/86400).toFixed(2)} · age ${s.ageDays.toFixed(2)} d · ${s.description}`;drawMap(get<HTMLCanvasElement>('environment-'+name+'-map'),s);}
        get('environment-baseline-parameters').textContent=JSON.stringify(JSON.parse(baseline.parameters),null,2);get('environment-current-parameters').textContent=JSON.stringify(JSON.parse(current.parameters),null,2);
        const status=get('environment-comparison-status');status.textContent=rt.environment?`${current.ageDays===0?'Generated at zero age — Play is not required.':'Evolving with conservative water and energy budgets.'} Baseline is fixed until you capture again.`:'Environment unavailable. Showing the last captured state; enable water and a supported rotation.';
        const legend:Record<string,string>={surface:'Natural cover colors · bright white land snow, blue-white sea ice.',temperatureC:'Temperature: −50 °C blue → 0 °C pale → +50 °C red; outside values saturate.',snowMm:'Land snow: 0 dark → 150 mm white, water equivalent; higher values saturate.',iceM:'Sea ice: 0 dark → 2 m white; higher values saturate.',vegetation:'Land vegetation: 0 bare brown → 100% green.',currents:'Arrows point with the prescribed surface flow. Length is relative to each map’s maximum; compare the absolute maximum in the table.'};get('environment-map-legend').textContent=legend[selected()];
        const body=get('environment-metrics');body.replaceChildren();for(const [key,label,unit] of METRICS){const row=document.createElement('tr');for(const v of [label+' ('+unit+')',format(baseline.metrics[key]),format(current.metrics[key]),format(current.metrics[key]-baseline.metrics[key])]){const td=document.createElement('td');td.textContent=v;row.append(td);}body.append(row);}
        const profile=(s:EnvironmentSnapshot)=>Array.from({length:s.height},(_,j)=>s.temperatureC.slice(j*s.width,(j+1)*s.width).reduce((a,b)=>a+b,0)/s.width);
        const a=profile(baseline),b=profile(current),min=Math.floor(Math.min(...a,...b)/10)*10,max=Math.max(min+10,Math.ceil(Math.max(...a,...b)/10)*10);
        chart('environment-latitudes',[{values:a,color:'#edc780',dashed:true},{values:b,color:'#69dfe4'}],min,max,'90° N','90° S');
        chart('environment-history',[{values:history.map(x=>x.metrics.icePercent),color:'#69dfe4'},{values:history.map(x=>x.metrics.snowPercent),color:'#e8f1ed'},{values:history.map(x=>x.metrics.vegetationPercent),color:'#98cc74'}],0,100,`${(history[0]?.time??0).toFixed(1)} d`,`${(history.at(-1)?.time??0).toFixed(1)} d`,history.map(x=>x.time));
    }
    for(const id of ['environment-baseline-map','environment-current-map'])get<HTMLCanvasElement>(id).addEventListener('pointermove',event=>{
        if(!baseline||!current)return;const bounds=(event.target as HTMLElement).getBoundingClientRect(),u=clamp((event.clientX-bounds.left)/bounds.width),v=clamp((event.clientY-bounds.top)/bounds.height),k=Math.min(current.width-1,Math.floor(u*current.width))+Math.round(v*(current.height-1))*current.width;
        get('environment-map-probe').textContent=`${(90-v*180).toFixed(1)}° lat, ${(u*360-180).toFixed(1)}° lon · baseline → current: ${baseline.temperatureC[k].toFixed(1)} → ${current.temperatureC[k].toFixed(1)} °C · snow ${baseline.snowMm[k].toFixed(1)} → ${current.snowMm[k].toFixed(1)} mm · ice ${baseline.iceM[k].toFixed(2)} → ${current.iceM[k].toFixed(2)} m · vegetation ${(100*baseline.vegetation[k]).toFixed(0)} → ${(100*current.vegetation[k]).toFixed(0)}%`;
    });
    get('environment-play').addEventListener('click',()=>clock.togglePlay());
    get('environment-close').addEventListener('click',()=>dialog.close());get('environment-map').addEventListener('change',render);
    get('environment-capture').addEventListener('click',()=>change(()=>{baseline=captureEnvironment(rt);current=baseline;render();}));
    get('environment-export').addEventListener('click',()=>{if(!baseline||!current)return;const url=URL.createObjectURL(new Blob(['\ufeff'+comparisonCSV(baseline,current)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='environment-comparison.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
    el('environment-compare').addEventListener('click',()=>change(()=>{current=captureEnvironment(rt);if(!baseline)baseline=current;dialog.showModal();render();}));
    return {refresh(){
        get('environment-play').textContent=clock.isPlaying()?'Pause':'Play';
        const d=environmentMetrics(rt);el<HTMLButtonElement>('environment-compare').disabled=!d;
        el<HTMLOutputElement>('environment-frozen').value=d?`${d.snowMm.toFixed(2)} / ${d.iceMm.toFixed(2)} mm`:'Enable water';
        el<HTMLOutputElement>('environment-melt').value=d?`${d.meltMmDay.toFixed(4)} mm/day`:'—';
        el<HTMLOutputElement>('environment-energy').value=d?`${d.energyResidualJm2.toExponential(2)} J/m²`:'—';el('environment-energy').dataset.value=String(d?.energyResidualJm2??0);
        if(model!==rt.model){model=rt.model;history=[];lastTime=-1;}
        if(d&&rt.model&&rt.model.timeS!==lastTime){lastTime=rt.model.timeS;const age=(lastTime-rt.model.epochS)/86400;history=history.filter(h=>h.time<age);history.push({time:age,metrics:d});if(history.length>240)history=history.filter((_,i)=>i%2===0);if(!baseline)baseline=captureEnvironment(rt);if(dialog.open){current=captureEnvironment(rt);render();}}
        if(dialog.open&&!d)render();
    },restoreInputs(){el<HTMLInputElement>('environment-current').value=String(rt.environmentConfig.oceanStrengthMps);el<HTMLInputElement>('environment-vegetation').checked=rt.environmentConfig.vegetation;el<HTMLInputElement>('environment-albedo').checked=rt.environmentConfig.iceAlbedo;}};
}
