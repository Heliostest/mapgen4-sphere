import {decodeTerrainDocument,type TerrainDocument,type MeshIdentity} from './terrain-document.ts';
import {decodeRuntimeState,record,scalar,field,type RuntimeState} from './runtime-state.ts';
import {ThermalRuntime} from './thermal-runtime.ts';
import {METRICS,type EnvironmentSnapshot,type EnvironmentMetrics,type ComparisonState} from './environment-comparison.ts';
import {SURFACE_WIDTH,SURFACE_HEIGHT} from './surface-grid.ts';
import type {PlanetLayer} from './planet-render.ts';

export const MAX_SIMULATION_FILE_BYTES=32*1024*1024;
export interface SimulationDocument {
    format:'mapgen4-sphere-simulation';version:1;terrain:TerrainDocument;runtime:RuntimeState;
    view:{speed:number;layer:PlanetLayer};comparison:ComparisonState;
}
function text(v:unknown,name:string,max:number) {if(typeof v!=='string'||v.length>max)throw new Error(`Invalid ${name}`);return v;}
function metrics(value:unknown):EnvironmentMetrics {
    const d=record(value);return Object.fromEntries(METRICS.map(([k])=>[k,scalar(d[k]===undefined&&['landIceMm','glacierSpeedMyr','glacialSolidResidualM'].includes(k)?0:d[k],k)])) as unknown as EnvironmentMetrics;
}
function baseline(value:unknown):EnvironmentSnapshot|null {
    if(value===null)return null;
    const d=record(value),width=SURFACE_WIDTH,height=SURFACE_HEIGHT,n=width*height;
    if(d.width!==width||d.height!==height)throw new Error('Invalid comparison dimensions');
    const parameters=text(d.parameters,'comparison parameters',16384);record(JSON.parse(parameters));
    const rgb=field(d.rgb,'comparison pixels',3*n,0,255);if(rgb.some(v=>!Number.isInteger(v)))throw new Error('Invalid comparison pixel');
    return {timeS:scalar(d.timeS,'baseline time',0,Number.MAX_SAFE_INTEGER),ageDays:scalar(d.ageDays,'baseline age',0),description:text(d.description,'comparison description',2048),parameters,width,height,rgb:new Uint8Array(rgb),metrics:metrics(d.metrics),
        temperatureC:field(d.temperatureC,'baseline temperature',n,-273.15,1e5),snowMm:field(d.snowMm,'baseline snow',n,0),iceM:field(d.iceM,'baseline ice',n,0),landIceM:d.landIceM===undefined?new Float64Array(n):field(d.landIceM,'baseline land ice',n,0),vegetation:field(d.vegetation,'baseline vegetation',n,0,1),land:field(d.land,'baseline land',n,0,1),east:field(d.east,'baseline east',n),north:field(d.north,'baseline north',n)};
}
export function decodeSimulationDocument(source:string,expected:MeshIdentity,constraintSize:number):SimulationDocument {
    if(source.length>MAX_SIMULATION_FILE_BYTES||new TextEncoder().encode(source).length>MAX_SIMULATION_FILE_BYTES)throw new Error('Simulation file exceeds 32 MiB');
    const d=record(JSON.parse(source));
    if(d.format!=='mapgen4-sphere-simulation'||d.version!==1)throw new Error('Unsupported simulation document');
    const terrain=decodeTerrainDocument(JSON.stringify(d.terrain),expected,constraintSize),runtime=decodeRuntimeState(d.runtime),v=record(d.view),c=record(d.comparison);
    const layers:PlanetLayer[]=['original','day-night','insolation','temperature','precipitation','soil-moisture','runoff','erosion','wind','surface'];
    if(!layers.includes(v.layer as PlanetLayer))throw new Error('Invalid display layer');
    const speed=scalar(v.speed,'clock speed',60,864000);if(![60,3600,86400,864000].includes(speed))throw new Error('Unsupported clock speed');
    if(runtime.state&&runtime.state.lastTarget!==terrain.settings.timeS)throw new Error('Clock and runtime time differ');
    if(!Array.isArray(c.history)||c.history.length>240)throw new Error('Invalid comparison history');
    let previous=-1;
    const history=c.history.map(item=>{const h=record(item),time=scalar(h.time,'history time',0);if(time<=previous)throw new Error('Unordered comparison history');previous=time;return {time,metrics:metrics(h.metrics)};});
    if(history.length&&(!runtime.state?.water||previous>(runtime.state.lastTarget-runtime.state.epochS)/86400+1e-8))throw new Error('History outside simulation');
    // Constructors check physical compatibility and the stability-limited step
    // on an independent runtime; no live object is involved in decoding.
    ThermalRuntime.fromSnapshot(runtime,terrain.settings.planet,terrain.settings.orbit);
    return {format:'mapgen4-sphere-simulation',version:1,terrain,runtime,view:{speed,layer:v.layer as PlanetLayer},comparison:{baseline:baseline(c.baseline),history}};
}
export function encodeSimulationDocument(document:SimulationDocument):string {
    const source=JSON.stringify(document,(_,v)=>ArrayBuffer.isView(v)?Array.from(v as Float64Array):v);
    decodeSimulationDocument(source,document.terrain.mesh,document.terrain.constraints.size);return source;
}
