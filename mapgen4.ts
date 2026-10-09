/*
 * From http://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *      http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import param from "./config.js";
import {makeMesh} from "./mesh.ts";
import Painting from "./painting.ts";
import Renderer from "./render.ts";
import {installNavigation} from './navigation.ts';
import {initialParams} from './terrain-parameters.ts';

import {installPlanetControls} from './planet-controls.ts';
import {GenerationGate} from './generation-gate.ts';
import {TerrainApplication,bakeTerrainOffsets} from './terrain-application.ts';
import {meshIdentity,decodeTerrainDocument,encodeTerrainDocument} from './terrain-document.ts';
import {installTerrainSessionPanel} from './terrain-session-panel.ts';
import {encodeSimulationDocument,decodeSimulationDocument} from './simulation-document.ts';
import {prepareTerrain} from './terrain-preparation.ts';
import type {TerrainDocument} from './terrain-document.ts';
import type {Mesh} from "./types.d.ts";



/**
 * Starts the UI, once the mesh has been loaded in.
 */
function main({mesh, t_peaks}: { mesh: Mesh; t_peaks: number[]; }) {
    let render = new Renderer(mesh);
    let planetControls:ReturnType<typeof installPlanetControls>|undefined;
    let sessionPanel:ReturnType<typeof installTerrainSessionPanel>|undefined;
    const gate=new GenerationGate(),application=new TerrainApplication(),identity=meshIdentity(mesh,param);
    let documentRevision=0;
    const sliders=document.getElementById('sliders');
    for(const event of ['input','change','click'])sliders.addEventListener(event,()=>documentRevision++,true);

    /* set initial parameters */
    for (let phase of ['elevation', 'biomes', 'rivers', 'render']) {
        const container = document.createElement('div');
        const header = document.createElement('h3');
        header.appendChild(document.createTextNode(phase));
        container.appendChild(header);
        document.getElementById('sliders').appendChild(container);
        for (let [name, initialValue, min, max] of initialParams[phase]) {
            const isRadius = name === 'sphere_radius';
            const step = name === 'seed' || isRadius? 1 : 0.001;
            param[phase][name] = initialValue;

            let span = document.createElement('span');
            span.appendChild(document.createTextNode(name));
            
            let slider = document.createElement('input');
            slider.setAttribute('type', name === 'seed'? 'number' : 'range');
            slider.setAttribute('min', String(min));
            slider.setAttribute('max', String(max));
            slider.setAttribute('step', step.toString());
            const radiusValue = isRadius? document.createElement('span') : null;
            if (radiusValue) {
                radiusValue.className = 'radius-value';
                radiusValue.setAttribute('aria-hidden', 'true');
                radiusValue.textContent = String(initialValue);
                slider.setAttribute('aria-label', name);
                slider.title = 'Base sphere radius, independent of zoom. Mountain height stays the same.';
            }
            slider.addEventListener('input', _event => {
                if(!Number.isFinite(slider.valueAsNumber)||!slider.checkValidity())return;
                param[phase][name] = slider.valueAsNumber;
                if (radiusValue) radiusValue.textContent = slider.value;
                if(phase==='render')redraw();
                else {planetControls?.pause();generate();}
            });

            /* improve slider behavior on iOS */
            function handleTouch(event: TouchEvent) {
                let rect = slider.getBoundingClientRect();
                let value = (event.changedTouches[0].clientX - rect.left) / rect.width;
                value = min + value * (max - min);
                value = Math.round(value / step) * step;
                if (value < min) { value = min; }
                if (value > max) { value = max; }
                slider.value = value.toString();
                slider.dispatchEvent(new Event('input'));
                event.preventDefault();
                event.stopPropagation();
            };
            slider.addEventListener('touchmove', handleTouch);
            slider.addEventListener('touchstart', handleTouch);

            let label = document.createElement('label');
            label.setAttribute('id', `slider-${name}`);
            label.appendChild(span);
            if (radiusValue) label.appendChild(radiusValue);
            label.appendChild(slider);

            container.appendChild(label);
            slider.value = String(initialValue);
        }
    }
    
    function redraw() {
        render.updateView(param.render);
    }
    installNavigation(param.render, ()=>{documentRevision++;redraw();});
    planetControls=installPlanetControls({
        container:document.getElementById('sliders'),
        canvas:document.getElementById('mapgen4') as HTMLCanvasElement,
        onView:view=>{render.updatePlanet(view);redraw();},
        sampleTerrain:coords=>render.sampleTerrain(coords),
        canInspect:()=>!Painting.navigating(),
        presentedTimeS:()=>render.presentedPlanetTimeS,
        renderParams:()=>param.render,
        terrain:()=>render.physicalElevation.length?{directions:mesh.xyz_r,elevation:render.physicalElevation,mesh,quadElements:render.pickElements}:null,
        terrainReady:()=>!gate.pending&&render.baseTriangleElevation.length===mesh.numTriangles,
        applyErosion:g=>{
            if(gate.pending||!g.model||g.model.years<=0||!g.view?.preview)return;
            const baked=bakeTerrainOffsets(render.baseTriangleElevation,render.physicalElevation.subarray(mesh.numRegions),mesh.xyz_t,g.view.preview);
            const d=g.model.diagnostics();
            application.apply(baked.offsets,{years:g.model.years,sourceTimeS:g.sourceTimeS,clipped:baked.clipped,mobileKm3:d.mobileKm3,oceanKm3:d.oceanKm3});
            g.reset('Erosion applied. Rivers and environment are being rebuilt.');generate();
        },
    });
    function terrainDocument():TerrainDocument {
        return {format:'mapgen4-sphere-terrain',version:1,mesh:identity,
            constraints:{size:Painting.size,painted:Painting.userHasPainted(),values:Array.from(Painting.constraints)},
            offsets:application.offsets?Array.from(application.offsets):null,report:application.report,
            parameters:Object.fromEntries(Object.entries(initialParams).map(([phase,fields])=>[phase,Object.fromEntries(fields.map(([key])=>[key,param[phase][key]]))])),settings:planetControls.settings()};
    }
    function restoreAuthored(d:TerrainDocument) {
        for(const [phase,values] of Object.entries(d.parameters))for(const [key,value] of Object.entries(values)) {
            param[phase][key]=value;(document.querySelector(`#slider-${key} input`) as HTMLInputElement).value=String(value);
        }
        document.querySelector('#slider-sphere_radius .radius-value').textContent=String(d.parameters.render.sphere_radius);
        Painting.restore(d.parameters.elevation as {seed:number;island:number},new Float32Array(d.constraints.values),d.constraints.painted);
        application.restore(d.offsets?new Float32Array(d.offsets):null,d.report);
    }
    sessionPanel=installTerrainSessionPanel(document.getElementById('planet-controls'),{
        revision:()=>`${gate.desired}:${documentRevision}:${planetControls.settings().timeS}`,
        state:()=>({pending:gate.pending,canUndo:application.canUndo,report:application.report,revision:gate.desired,accepted:gate.accepted}),
        undo:()=>{if(!application.canUndo)return;planetControls.pause();application.undo();generate();},
        save:()=>{
            if(gate.pending)throw new Error('Wait for terrain generation');
            planetControls.pause();
            return encodeTerrainDocument(terrainDocument());
        },
        saveSimulation:()=>{
            if(gate.pending)throw new Error('Wait for terrain generation');
            planetControls.pause();
            return encodeSimulationDocument({format:'mapgen4-sphere-simulation',version:1,terrain:terrainDocument(),...planetControls.simulation()});
        },
        load:async(text,stillCurrent)=>{
            // Fully validate before touching any live settings, author arrays or history.
            if(JSON.parse(text)?.format==='mapgen4-sphere-simulation') {
                const d=decodeSimulationDocument(text,identity,Painting.size);
                const prepared=await prepareTerrain(mesh,t_peaks,param,d.terrain);
                if(!stillCurrent())return 'Load canceled because newer edits or time changes were made.';
                const elevation=new Float32Array(prepared.terrain_elevation_buffer);
                const candidate=planetControls.prepareSimulation(d,{directions:mesh.xyz_r,elevation,mesh,quadElements:new Int32Array(prepared.quad_elements_buffer).slice()});
                // All fallible parsing, generation and model construction has completed.
                gate.acceptPrepared();documentRevision++;restoreAuthored(d.terrain);
                render.quad_elements=new Int32Array(prepared.quad_elements_buffer);render.a_quad_em=new Float32Array(prepared.a_quad_em_buffer);render.a_river_xyww=new Float32Array(prepared.a_river_xyww_buffer);
                render.numRiverTriangles=prepared.numRiverTriangles;render.physicalElevation=elevation;render.baseTriangleElevation=new Float32Array(prepared.base_triangle_elevation_buffer);
                render.updateMap();planetControls.restoreSimulation(d,candidate);updateUI();redraw();
                return 'Complete simulation restored, paused at the saved moment. Press Play to continue.';
            }
            const d=decodeTerrainDocument(text,identity,Painting.size);
            restoreAuthored(d);
            planetControls.restoreSettings(d.settings);generate();
            return 'Terrain document loaded. Rebuilding terrain; climate history starts fresh.';
        },
    });
    // Legacy artist controls only update physical scale readouts, never SI state.
    for(const name of ['sphere_radius','mountain_height']) {
        document.querySelector(`#slider-${name} input`).addEventListener('input',()=>planetControls.refresh());
    }
    Painting.inspecting=()=>planetControls.isInspecting();
    Painting.onBeforePaint=()=>planetControls.pause();
    Painting.onReset=()=>{planetControls.pause();application.reset();};

    /* Ask render module to copy WebGL into Canvas */
    function download() {
        render.screenshotCallback = () => {
            let a = document.createElement('a');
            render.screenshotCanvas.toBlob(blob => {
                // TODO: Firefox doesn't seem to allow a.click() to
                // download; is it everyone or just my setup?
                a.href = URL.createObjectURL(blob);
                a.setAttribute('download', `mapgen4-${param.elevation.seed}.png`);
                a.click();
            });
        };
        render.updateView(param.render);
    }
    
    Painting.screenToWorldCoords = (coords) => {
        return render.screenToWorld(coords);
    };

    Painting.onUpdate = () => {
        generate();
    };

    const worker = new window.Worker("build/_worker.js");
    let elapsedTimeHistory = [];

    worker.addEventListener('messageerror', event => {
        console.log("WORKER ERROR", event);
    });
    
    worker.addEventListener('message', event => {
        let {elapsed, revision, numRiverTriangles, quad_elements_buffer, a_quad_em_buffer, a_river_xyww_buffer, terrain_elevation_buffer, base_triangle_elevation_buffer} = event.data;
        elapsedTimeHistory.push(elapsed | 0);
        if (elapsedTimeHistory.length > 10) { elapsedTimeHistory.splice(0, 1); }
        const timingDiv = document.getElementById('timing');
        if (timingDiv) { timingDiv.innerText = `${elapsedTimeHistory.join(' ')} milliseconds`; }
        const accepted=gate.complete(revision);
        if(accepted||render.quad_elements.byteLength===0) {
            render.quad_elements = new Int32Array(quad_elements_buffer);
            render.a_quad_em = new Float32Array(a_quad_em_buffer);
            render.a_river_xyww = new Float32Array(a_river_xyww_buffer);
        }
        // Recycle transferred buffers even for stale replies. Publish only a
        // complete accepted snapshot; retained renderer copies remain drawable.
        if(accepted) {
            render.numRiverTriangles = numRiverTriangles;
            render.physicalElevation = new Float32Array(terrain_elevation_buffer);
            render.baseTriangleElevation = new Float32Array(base_triangle_elevation_buffer);
            render.updateMap();planetControls.terrainChanged();redraw();
        }
        submitLatest();updateUI();
    });

    function updateUI() {
        let userHasPainted = Painting.userHasPainted()||application.offsets!==null;
        (document.querySelector("#slider-seed input") as HTMLInputElement).disabled = userHasPainted;
        (document.querySelector("#slider-island input") as HTMLInputElement).disabled = userHasPainted;
        (document.querySelector("#button-reset") as HTMLInputElement).disabled = !userHasPainted;
        sessionPanel?.refresh();planetControls?.refresh();
    }
    
    function generate() {
        Painting.setElevationParam(param.elevation);
        gate.request();documentRevision++;updateUI();submitLatest();
    }
    function submitLatest() {
        const revision=gate.start();
        if(revision!==null) {
            worker.postMessage({
                param,revision,offsets:application.offsets,
                constraints: {
                    size: Painting.size,
                    constraints: Painting.constraints,
                },
                quad_elements_buffer: render.quad_elements.buffer,
                a_quad_em_buffer: render.a_quad_em.buffer,
                a_river_xyww_buffer: render.a_river_xyww.buffer,
            }, [
                render.quad_elements.buffer,
                render.a_quad_em.buffer,
                render.a_river_xyww.buffer,
            ]
            );
        }
    }

    worker.postMessage({mesh, t_peaks, param});
    generate();

    const downloadButton = document.getElementById('button-download');
    if (downloadButton) downloadButton.addEventListener('click', download);
}

makeMesh().then(main).catch(error => {
    console.error(error);
    const message=document.createElement('p');
    message.textContent=`Unable to start Mapgen4: ${error.message ?? error}`;
    document.getElementById('sliders').prepend(message);
});
