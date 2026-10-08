import {DEFAULT_PLANET,derivePlanet,physicalHeight,displayExaggeration,TAU,type PlanetConfig} from './planet.ts';
import {AU_M,DEFAULT_ORBIT,deriveOrbit,sunState,incidentFlux,localSolarHour,wrapAngle,type OrbitConfig} from './astronomy.ts';
import {makePlanetView,type PlanetView,type PlanetLayer,type PlanetCamera} from './planet-render.ts';
import {SimulationClock} from './simulation-clock.ts';
import {uvToDirection} from './sphere.ts';
import {ThermalRuntime} from './thermal-runtime.ts';
import {sampleTerrainGrid} from './thermal.ts';
import {installThermalPanel} from './thermal-panel.ts';
import {installWaterPanel} from './water-panel.ts';
import {GeomorphRuntime} from './geomorph-runtime.ts';
import {installGeomorphPanel} from './geomorph-panel.ts';
import type {PhysicalSettings} from './terrain-document.ts';
import {DEFAULT_THERMAL} from './thermal.ts';
import {DEFAULT_WATER} from './water.ts';

type Sample={uv:[number,number];elevation:number};
type Options={
    container:HTMLElement; canvas:HTMLCanvasElement;
    onView:(view:PlanetView)=>void;
    sampleTerrain:(coords:number[])=>Sample|null;
    canInspect:()=>boolean;
    presentedTimeS:()=>number|null;
    renderParams:()=>{sphere_radius?:number;mountain_height?:number};
    terrain?:()=>{directions:ArrayLike<number>;elevation:ArrayLike<number>}|null;
    terrainReady?:()=>boolean;
    applyErosion?:(g:GeomorphRuntime)=>void;
};

/** Physical settings deliberately live outside generator parameters: changing
 * these values cannot erase constraints or trigger a terrain generation. */
export function installPlanetControls(options:Options) {
    let planet:PlanetConfig={...DEFAULT_PLANET},orbit:OrbitConfig={...DEFAULT_ORBIT};
    let layer:PlanetLayer='original',camera:PlanetCamera='surface',inspecting=false;
    let probe:Sample|null=null;
    const clock=new SimulationClock();
    const thermal=new ThermalRuntime();
    const geomorph=new GeomorphRuntime();
    const waterLayer=()=>['precipitation','soil-moisture','runoff'].includes(layer);
    const root=document.createElement('div');root.id='planet-controls';
    const header=document.createElement('h3');header.textContent='Planet physics';root.append(header);
    // Keep the legacy paint/navigation buttons in their original positions.
    const firstGroup=options.container.querySelector('div');
    options.container.insertBefore(root,firstGroup);

    function note(text:string,parent:HTMLElement=root) {
        const p=document.createElement('p');p.className='planet-note';p.textContent=text;parent.append(p);return p;
    }
    function group(title:string,open=false) {
        const details=document.createElement('details');details.open=open;
        const summary=document.createElement('summary');summary.textContent=title;details.append(summary);root.append(details);return details;
    }
    function labelFor(id:string,title:string,parent:HTMLElement) {
        const label=document.createElement('label');label.htmlFor=id;
        const span=document.createElement('span');span.textContent=title;label.append(span);parent.append(label);return label;
    }
    function output(id:string,title:string,parent:HTMLElement=root) {
        const label=labelFor(id,title,parent),out=document.createElement('output');out.id=id;label.append(out);return out;
    }
    function button(id:string,title:string,action:()=>void,parent:HTMLElement=root) {
        const b=document.createElement('button');b.id=id;b.type='button';b.textContent=title;b.addEventListener('click',action);parent.append(b);return b;
    }
    function select(id:string,title:string,items:[string,string][],value:string,change:(v:string)=>void,parent:HTMLElement=root) {
        const label=labelFor(id,title,parent),el=document.createElement('select');el.id=id;
        for(const [v,text] of items){const option=document.createElement('option');option.value=v;option.textContent=text;el.append(option);}
        el.value=value;el.addEventListener('change',()=>{change(el.value);emit();});label.append(el);return el;
    }
    const inputs=new Map<string,{input:HTMLInputElement;get:()=>number}>();
    function number(id:string,title:string,min:number,max:number,step:string,get:()=>number,set:(v:number)=>void,parent:HTMLElement=root,range=false) {
        const label=labelFor(id,title,parent),el=document.createElement('input');el.id=id;el.type=range?'range':'number';
        el.min=String(min);el.max=String(max);el.step=step;el.value=String(Number(get().toPrecision(12)));
        el.addEventListener(range?'input':'change',()=>{
            const value=el.valueAsNumber;
            if(!el.checkValidity() || !Number.isFinite(value)) {el.setAttribute('aria-invalid','true');return;}
            el.removeAttribute('aria-invalid');pause(false);set(value);thermal.invalidate();emit();
        });
        label.append(el);inputs.set(id,{input:el,get});return el;
    }

    const layerSelect=select('planet-layer','Display layer',[
        ['original','Original map'],['day-night','Day / night'],['insolation','Solar energy'],['temperature','Temperature (daily mean)'],
        ['precipitation','Precipitation'],['soil-moisture','Soil moisture'],['runoff','Surface outflow'],
        ['erosion','Terrain change (erosion)'],
        ['wind','Surface wind (estimated)'],
    ],layer,v=>{
        layer=v as PlanetLayer;
        if(layer==='temperature'||layer==='wind'||waterLayer()){thermal.enabled=true;thermalPanel.reveal();}
        if(waterLayer()){thermal.waterEnabled=true;waterPanel.reveal();}
        if(layer==='erosion'){thermal.enabled=thermal.waterEnabled=true;geomorphPanel.reveal();}
    });
    const cameraSelect=select('planet-camera','View',[
        ['surface','Follow surface'],['space','From space'],
    ],camera,v=>camera=v as PlanetCamera);
    const legend=note('Original map · physical settings preserve your terrain.');legend.id='planet-legend';
    button('planet-generate-climate','Generate climate now',()=>{
        pause(false);thermal.enabled=thermal.waterEnabled=true;thermal.invalidate();
        layer='temperature';layerSelect.value=layer;thermalPanel.reveal();waterPanel.reveal();emit();
    });
    note('Generate temperature, rain and wind belts at the current date without Play. Change season, tilt or terrain to regenerate; Play evolves the result.');
    const play=button('planet-play','Play',()=>{
        if(inspecting) {inspecting=false;updateInspectButton();}
        if(clock.playing) pause(false);
        else clock.setPlaying(true,performance.now());
        emit();
    });
    select('planet-speed','Time speed',[
        ['60','1 minute / second'],['3600','1 hour / second'],['86400','1 day / second'],['864000','10 days / second'],
    ],String(clock.speed),v=>clock.setSpeed(Number(v),performance.now(),thermal.maxAdvanceS));
    const time=number('planet-time-days','Elapsed time (days)',0,1e6,'any',()=>clock.timeS/86400,v=>clock.seek(v*86400,performance.now()));
    const spin=number('planet-spin-phase','Spin phase (°)',0,360,'0.1',()=>sunState(planet,orbit,clock.timeS).spinAngleRad*180/Math.PI,v=>{
        orbit.spinPhaseRad=wrapAngle(v*Math.PI/180-(planet.retrograde?-1:1)*TAU*((clock.timeS%planet.siderealPeriodS)/planet.siderealPeriodS));
    },root,true);
    const season=number('planet-orbit-phase','Season phase (°)',0,360,'0.1',()=>sunState(planet,orbit,clock.timeS).orbitAngleRad*180/Math.PI,v=>{
        const year=deriveOrbit(planet,orbit).yearS;
        orbit.orbitPhaseRad=wrapAngle(v*Math.PI/180-TAU*((clock.timeS%year)/year));
    },root,true);
    const phases=note('');phases.id='planet-phases';
    button('planet-reset-time','Reset time',()=>{pause(false);clock.seek(0,performance.now());orbit.spinPhaseRad=orbit.orbitPhaseRad=0;thermal.invalidate();emit();});
    const inspect=button('planet-inspect','Inspect: off',()=>{inspecting=!inspecting;pause(false);updateInspectButton();emit();});
    inspect.setAttribute('aria-pressed','false');
    const probeOutput=note('Inspect a surface point to read its location and solar energy.');probeOutput.id='planet-probe';
    probeOutput.setAttribute('aria-live','polite');

    const size=group('Physical size',true);
    number('planet-radius','Radius (km)',10,100000,'any',()=>planet.radiusM/1000,v=>planet.radiusM=v*1000,size);
    number('planet-density','Mean density (kg/m³)',100,30000,'any',()=>planet.densityKgM3,v=>planet.densityKgM3=v,size);
    const mass=output('planet-mass','Mass',size),gravity=output('planet-gravity','Surface gravity',size),escape=output('planet-escape','Escape speed',size);
    note('Physical radius is independent of render → sphere_radius and zoom.',size);

    const rotation=group('Rotation & solar orbit');
    number('planet-period','Sidereal day (hours)',.5,1000000,'any',()=>planet.siderealPeriodS/3600,v=>planet.siderealPeriodS=v*3600,rotation);
    number('planet-tilt','Axial tilt (°)',0,90,'any',()=>planet.obliquityRad*180/Math.PI,v=>planet.obliquityRad=v*Math.PI/180,rotation);
    const retroLabel=labelFor('planet-retrograde','Retrograde spin',rotation),retro=document.createElement('input');retro.id='planet-retrograde';retro.type='checkbox';retroLabel.append(retro);
    retro.addEventListener('change',()=>{pause(false);planet.retrograde=retro.checked;emit();});
    number('planet-distance','Orbit distance (AU)',.1,20,'any',()=>orbit.distanceM/AU_M,v=>orbit.distanceM=v*AU_M,rotation);
    number('planet-albedo','Bond albedo',0,1,'any',()=>orbit.bondAlbedo,v=>orbit.bondAlbedo=v,rotation);
    const year=output('planet-year','Orbital year',rotation),day=output('planet-solar-day','Mean solar day',rotation);
    note('Fixed solar mass and luminosity; circular orbit. Season 0° = northern spring equinox, 90° = northern summer solstice.',rotation);

    const scale=group('Physical terrain scale');
    number('planet-relief','Land height scale (km)',.001,100,'any',()=>planet.reliefM/1000,v=>planet.reliefM=v*1000,scale);
    number('planet-ocean-depth','Seafloor scale (km)',.001,100,'any',()=>planet.oceanDepthM/1000,v=>planet.oceanDepthM=v*1000,scale);
    const exaggeration=output('planet-exaggeration','Display exaggeration',scale);
    note('Calibrated elevations before artistic folds. Ocean depth is a seafloor estimate; rendered water stays at sea level.',scale);

    const thermalPanel=installThermalPanel(root,thermal,mutate=>{
        pause(false);mutate();
        if(!thermal.enabled) {
            thermal.waterEnabled=false;
            if(layer==='temperature'||layer==='wind'||waterLayer()){layer='original';layerSelect.value=layer;}
        }
        emit();
    });
    const waterPanel=installWaterPanel(root,thermal,mutate=>{
        pause(false);mutate();
        if(!thermal.waterEnabled&&waterLayer()){layer='original';layerSelect.value=layer;}
        emit();
    });
    const geomorphPanel=installGeomorphPanel(root,geomorph,thermal,action=>{
        // Pause may roll time back over queued fields. Synchronize that state
        // before capturing, never capture an unpresented future water field.
        pause(false);sendView();action();probe=null;
        probeOutput.textContent='Inspect a surface point to read its location and solar energy.';emit();
    },{ready:()=>options.terrainReady?.()??true,apply:()=>{
        if(geomorph.model&&geomorph.model.years>0&&geomorph.view?.preview&&(options.terrainReady?.()??true)) {
            options.applyErosion?.(geomorph);layer='original';layerSelect.value=layer;
        }
    }});

    const radiation=group('Radiation reference',true);
    const flux=output('planet-flux','Stellar irradiance',radiation),temperature=output('planet-temperature','Radiative Teq',radiation);
    note('Global blackbody reference, not surface air temperature. The optional thermal model has its own effective emissivity and heat transport.',radiation);
    const warning=note('');warning.id='planet-model-note';
    note('Painting pauses time. Hidden tabs pause until you press Play. Terrain Reset clears painting and applied erosion.');
    button('planet-earth','Earth preset',()=>{
        pause(false);planet={...DEFAULT_PLANET};orbit={...DEFAULT_ORBIT};clock.seek(0,performance.now());thermal.invalidate();
        retro.checked=false;
        for(const {input,get} of inputs.values()) {input.value=String(Number(get().toPrecision(12)));input.removeAttribute('aria-invalid');}
        emit();
    });

    function updateInspectButton() {
        inspect.textContent=inspecting?'Inspect: on':'Inspect: off';inspect.setAttribute('aria-pressed',String(inspecting));
        options.canvas.style.cursor=inspecting?'help':'crosshair';
    }
    function pause(redraw=true) {
        clock.pauseAt(options.presentedTimeS(),performance.now());
        if(redraw) emit();
    }
    function refresh() {
        const p=derivePlanet(planet),o=deriveOrbit(planet,orbit),sun=sunState(planet,orbit,clock.timeS);
        mass.value=`${p.massKg.toExponential(3)} kg`;
        gravity.value=`${p.gravityMps2.toFixed(2)} m/s²`;escape.value=`${(p.escapeMps/1000).toFixed(2)} km/s`;
        year.value=`${(o.yearS/86400).toFixed(3)} d`;
        day.value=Number.isFinite(o.solarDayS)?`${(o.solarDayS/3600).toFixed(3)} h`:'No mean solar cycle';
        flux.value=`${o.fluxWm2.toFixed(1)} W/m²`;
        temperature.value=`${o.equilibriumK.toFixed(1)} K (${(o.equilibriumK-273.15).toFixed(1)} °C)`;
        const render=options.renderParams();
        exaggeration.value=`${displayExaggeration(planet,render.sphere_radius??300,render.mountain_height??50).toFixed(1)}×`;
        play.textContent=clock.playing?'Pause':'Play';play.setAttribute('aria-pressed',String(clock.playing));
        if(document.activeElement!==time) time.value=(clock.timeS/86400).toFixed(6);
        if(document.activeElement!==spin) spin.value=(sun.spinAngleRad*180/Math.PI).toFixed(1);
        if(document.activeElement!==season) season.value=(sun.orbitAngleRad*180/Math.PI).toFixed(1);
        phases.textContent=`Spin ${(sun.spinAngleRad*180/Math.PI).toFixed(1)}° · season ${(sun.orbitAngleRad*180/Math.PI).toFixed(1)}° · Sun latitude ${(sun.declinationRad*180/Math.PI).toFixed(1)}°`;
        legend.textContent=layer==='insolation'?`Solar energy: 0–${o.fluxWm2.toFixed(0)} W/m² · dark blue → teal → orange. Colors retain terrain shading.`:
            layer==='wind'?(thermal.model?'Estimated surface wind: arrows point toward flow; dark blue → green = 0–30 m/s. Geographic circulation template, not a pressure solver.':thermal.status):
            layer==='erosion'?(geomorph.model?'Net bed change: −100 m blue · 0 m cream · +100 m red; outside values saturate. Coarse preview; source climate and artistic rivers are retained.':'Capture current water in Erosion & deposition preview to begin.'):
            waterLayer()?(!thermal.water?thermal.status:layer==='precipitation'?'Precipitation: 0–20 mm/day · dark blue → cyan → cream. Latest-step rate; higher values saturate.':layer==='soil-moisture'?'Soil moisture: 0–100% of soil capacity · brown → green; ocean blue. Fraction per land area.':'Cell surface outflow: 0–10⁷ m³/s · dark blue → cyan, log scale. Latest-step transfer; higher values saturate. Artistic rivers are independent.'):
            layer==='temperature'?(thermal.model?'Temperature: −80 °C blue · 0 °C cream · +60 °C red. Generated daily-mean reference is ready while paused; Play evolves it. Outside values saturate.':thermal.status):
            layer==='day-night'?'Day / night · night brightness helps editing; night receives 0 W/m².':'Original map · physical settings preserve your terrain.';
        warning.textContent=p.rotationRatio>.05?'Rapid spin: the spherical gravity/sea-level approximation becomes inaccurate.':
            Math.max(planet.reliefM,planet.oceanDepthM)>.05*planet.radiusM?'Terrain is large relative to radius: spherical surface diagnostics are approximate.':'';
        if(probe) {
            const direction=uvToDirection(...probe.uv),local=localSolarHour(direction,sun.direction);
            const height=probe.elevation>0?probe.elevation*planet.reliefM:physicalHeight(Math.max(-1,probe.elevation),planet);
            probeOutput.textContent=`${((.5-probe.uv[1])*180).toFixed(2)}° lat, ${((probe.uv[0]-.5)*360).toFixed(2)}° lon · ${height.toFixed(0)} m ${height<0?'seafloor':'elevation'} · ${incidentFlux(direction,sun.direction,o.fluxWm2).toFixed(1)} W/m² · ${local===null?'solar time undefined at pole':`${local.toFixed(2)} h local solar time`}`;
            const cellK=thermal.sample(...probe.uv);
            if(cellK!==null) probeOutput.textContent+=` · ${(cellK-273.15).toFixed(1)} °C daily-mean cell`;
            const wind=thermal.sampleWind(...probe.uv);
            if(wind)probeOutput.textContent+=` · estimated wind E ${wind.eastMps.toFixed(1)} / N ${wind.northMps.toFixed(1)} m/s`;
            const water=thermal.sampleWater(...probe.uv);
            if(water)probeOutput.textContent+=` · rain ${water.rainMmDay.toFixed(2)} mm/day · ${water.soilMm===null?'ocean':`soil ${water.soilMm.toFixed(1)} mm / standing ${water.surfaceMm!.toFixed(1)} mm per land area`} · cell outflow ${water.dischargeM3S.toExponential(2)} m³/s`;
            const erosion=geomorph.sample(...probe.uv);
            if(erosion)probeOutput.textContent+=` · bed change ${erosion.deltaM.toFixed(2)} m · mobile sediment ${erosion.mobileMm.toFixed(2)} mm whole-cell equivalent${geomorph.previewEnabled?' · terrain preview':''}`;
        }
        thermalPanel.refresh(clock.timeS,clock.limited);
        waterPanel.refresh();
        geomorphPanel.refresh();
    }
    function sendView() {
        const view=makePlanetView(planet,orbit,clock.timeS,layer,camera);
        view.thermal=thermal.sync(planet,orbit,clock.timeS,options.presentedTimeS());
        view.water=thermal.waterTexture;
        const previousGeomorph=geomorph.model;
        geomorph.reconcile(thermal);view.geomorph=geomorph.view;
        if(previousGeomorph&&!geomorph.model){probe=null;probeOutput.textContent='Inspect a surface point to read its location and solar energy.';}
        options.onView(view);
    }
    function emit() {sendView();refresh();}
    options.canvas.addEventListener('pointerdown',event=>{
        if(!inspecting || event.button!==0 || event.altKey || !options.canInspect()) return;
        pause(false);
        const bounds=options.canvas.getBoundingClientRect();
        probe=options.sampleTerrain([(event.clientX-bounds.left)/bounds.width,(event.clientY-bounds.top)/bounds.height]);
        if(!probe) probeOutput.textContent='No terrain here. Select a point on the globe.';
        emit();
    });
    document.addEventListener('visibilitychange',()=>{if(document.hidden) pause();});
    let lastReadout=0;
    const frame=(now:number)=>{
        requestAnimationFrame(frame);
        if(!clock.playing) return;
        clock.tick(now,thermal.maxAdvanceS);
        sendView();
        if(now-lastReadout>100) {refresh();lastReadout=now;}
    };
    requestAnimationFrame(frame);emit();
    return {
        pause,refresh,isInspecting:()=>inspecting,
        settings:():PhysicalSettings=>({planet:{...planet},orbit:{...orbit},timeS:clock.timeS,camera}),
        restoreSettings:(settings:PhysicalSettings)=>{
            pause(false);planet={...settings.planet};orbit={...settings.orbit};camera=settings.camera;
            clock.seek(settings.timeS,performance.now());layer='original';layerSelect.value=layer;cameraSelect.value=camera;
            inspecting=false;updateInspectButton();retro.checked=planet.retrograde;probe=null;
            probeOutput.textContent='Inspect a surface point to read its location and solar energy.';
            thermal.enabled=thermal.waterEnabled=false;thermal.config={...DEFAULT_THERMAL};thermal.waterConfig={...DEFAULT_WATER};thermal.invalidate();
            geomorph.reset();thermalPanel.restoreInputs();waterPanel.restoreInputs();
            for(const {input,get} of inputs.values()){input.value=String(Number(get().toPrecision(12)));input.removeAttribute('aria-invalid');}
            emit();
        },
        terrainChanged:()=>{
            probe=null;probeOutput.textContent='Inspect a surface point to read its location and solar energy.';
            const terrain=options.terrain?.();
            if(terrain){const sampled=sampleTerrainGrid(thermal.grid,terrain.directions,terrain.elevation);thermal.setTerrain(sampled.landFraction,sampled.landElevation);}
            emit();
        },
    };
}
