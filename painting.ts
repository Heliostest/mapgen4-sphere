/*
 * From https://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * This module allows the user to paint constraints for the map generator
 */

/*
 * The painting interface stores elevations in a periodic longitude/latitude
 * array. Pointer hits become spherical brush footprints, then the elevation
 * array is sent to the generator to produce the output.
 */

import {SphericalConstraints} from './spherical-constraints.ts';
const CANVAS_SIZE = 128;
const heightMap = new SphericalConstraints(CANVAS_SIZE);

let exported = {
    size: CANVAS_SIZE,
    onUpdate: () => {},
    onReset: () => {},
    stopStroke: () => {},
    screenToWorldCoords: (coords: number[]): number[] | null => coords,
    navigating: () => false,
    inspecting: () => false,
    onBeforePaint: () => {},
    constraints: heightMap.elevation,
    setElevationParam: elevationParam => heightMap.setElevationParam(elevationParam),
    userHasPainted: () => heightMap.userHasPainted,
    restore: (params:{seed:number;island:number},values:Float32Array,painted:boolean) => {
        exported.stopStroke();heightMap.restore(params,values,painted);
    },
};

document.getElementById('button-reset').addEventListener('click', () => {
    exported.stopStroke();exported.onReset();
    heightMap.generate();
    exported.onUpdate();
});


const SIZES = {
    // rate is effect per second
    tiny:   {key: '1', rate: 9, innerRadius: 1.5, outerRadius: 2.5},
    small:  {key: '2', rate: 8, innerRadius: 2, outerRadius: 6},
    medium: {key: '3', rate: 5, innerRadius: 5, outerRadius: 10},
    large:  {key: '4', rate: 3, innerRadius: 10, outerRadius: 16},
};

const TOOLS = {
    ocean:    {elevation: -0.25},
    shallow:  {elevation: -0.05},
    valley:   {elevation: +0.05},
    mountain: {elevation: +1.0},
};

let currentTool = 'mountain';
let currentSize = 'small';

function displayCurrentTool() {
    const className = 'current-control';
    for (let c of document.querySelectorAll("."+className)) {
        c.classList.remove(className);
    }
    document.getElementById(currentTool).classList.add(className);
    document.getElementById(currentSize).classList.add(className);
}

const controls: [string, string, () => void][] = [
    ['1', "tiny",     () => { currentSize = 'tiny'; }],
    ['2', "small",    () => { currentSize = 'small'; }],
    ['3', "medium",   () => { currentSize = 'medium'; }],
    ['4', "large",    () => { currentSize = 'large'; }],
    ['q', "ocean",    () => { currentTool = 'ocean'; }],
    ['w', "shallow",  () => { currentTool = 'shallow'; }],
    ['e', "valley",   () => { currentTool = 'valley'; }],
    ['r', "mountain", () => { currentTool = 'mountain'; }],
];

window.addEventListener('keydown', e => {
    if((e.target as HTMLElement)?.closest('input, select, textarea, [contenteditable="true"]')) return;
    for (let control of controls) {
        if (e.key === control[0]) { control[2](); displayCurrentTool(); }
    }
});

for (let control of controls) {
    document.getElementById(control[1]).addEventListener('click', () => { control[2](); displayCurrentTool(); } );
}
displayCurrentTool();


function setUpPaintEventHandling() {
    const el = document.getElementById('mapgen4');
    let dragging = false;
    let timestamp = 0;
    
    function start(event: PointerEvent) {
        if (event.button !== 0 || event.altKey || exported.navigating() || exported.inspecting()) return; // left button only
        el.setPointerCapture(event.pointerId);
        
        dragging = true;
        timestamp = Date.now() - 100;
        heightMap.beginStroke();
        move(event);
    }

    function end(_event) {
        dragging = false;
    }
    exported.stopStroke=()=>{dragging=false;};

    function move(event: PointerEvent) {
        if (!dragging || exported.navigating()) return;

        const nowMs = Date.now();
        const bounds = el.getBoundingClientRect();
        const screenCoords = [
            (event.x - bounds.left) / bounds.width,
            (event.y - bounds.top) / bounds.height,
        ];
        const coords = exported.screenToWorldCoords(screenCoords);
        if (!coords) { timestamp = nowMs; return; }
        exported.onBeforePaint();
        let brushSize = SIZES[currentSize];
        if (event.pointerType === 'pen' && event.pressure !== 0.5) {
            // Pointer Event spec says 0.5 sent when pen does not
            // support pressure; I primarily added this for Apple
            // Pencil but haven't tested on others. I want pressure
            // 0.25 to correspond to "regular" pressure for the given
            // brush size, so radius should be 1.0. I am *not*
            // currently supporting Macbook pressure-sensitive
            // touchpads, which don't show up under Pointer Events.
            // https://developer.mozilla.org/en-US/docs/Web/API/Force_Touch_events
            let radius = 2 * Math.sqrt(event.pressure);
            brushSize = {
                key: brushSize.key,
                innerRadius: Math.max(1, brushSize.innerRadius * radius),
                outerRadius: Math.max(2, brushSize.outerRadius * radius),
                rate: brushSize.rate,
            };
        }
        if (event.shiftKey) {
            // Hold down shift to paint slowly
            brushSize = {...brushSize, rate: brushSize.rate/4};
        }
        heightMap.paintAt(TOOLS[currentTool], coords[0], coords[1],
                          brushSize, nowMs - timestamp);
        timestamp = nowMs;
        exported.onUpdate();
    }
        
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    el.addEventListener('pointermove', move)
    el.addEventListener('touchstart', (e) => e.preventDefault()); // prevent scroll
}
setUpPaintEventHandling();



export default exported;
