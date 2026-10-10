import type {Mesh} from './types.d.ts';
import {initialParams} from './terrain-parameters.ts';
import {TAU,type PlanetConfig} from './planet.ts';
import {AU_M,type OrbitConfig} from './astronomy.ts';
import type {ApplicationReport} from './terrain-application.ts';

export const MAX_TERRAIN_FILE_BYTES=8*1024*1024;
export interface PhysicalSettings {planet:PlanetConfig;orbit:OrbitConfig;timeS:number;camera:'surface'|'space'}
export interface MeshIdentity {regions:number;triangles:number;spacing:number;mountainSpacing:number;seed:number;fingerprint:string}
export interface TerrainDocument {
    format:'mapgen4-sphere-terrain';version:1;mesh:MeshIdentity;
    constraints:{size:number;painted:boolean;values:number[]};
    offsets:number[]|null;report:ApplicationReport|null;
    parameters:Record<string,Record<string,number>>;settings:PhysicalSettings;
}
export function meshIdentity(mesh:Mesh,param:{spacing:number;mountainSpacing:number;mesh:{seed:number}}):MeshIdentity {
    // Include actual vertex order and topology, not merely generator counts.
    let a=2166136261,b=5381;
    for(const field of [mesh.xyz_r,mesh.xyz_t,mesh._triangles,mesh._halfedges]) {
        const bytes=new Uint8Array(field.buffer,field.byteOffset,field.byteLength);
        for(const byte of bytes){a=Math.imul(a^byte,16777619);b=Math.imul(b,33)^byte;}
    }
    return {regions:mesh.numRegions,triangles:mesh.numTriangles,spacing:param.spacing,mountainSpacing:param.mountainSpacing,seed:param.mesh.seed,fingerprint:`${a>>>0}-${b>>>0}`};
}
function object(value:unknown):Record<string,unknown> {
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Expected a document object');
    return value as Record<string,unknown>;
}
function number(value:unknown,name:string,min:number,max:number,integer=false):number {
    if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value)))throw new Error(`Invalid ${name}`);
    return value;
}
function bool(value:unknown):boolean {if(typeof value!=='boolean')throw new Error('Expected boolean');return value;}
function array(value:unknown,name:string,length:number,min:number,max:number):number[] {
    if(!Array.isArray(value)||value.length!==length)throw new Error(`Invalid ${name} length`);
    return value.map(x=>number(x,name,min,max));
}
export function decodeTerrainDocument(text:string,expected:MeshIdentity,constraintSize:number):TerrainDocument {
    if(text.length>MAX_TERRAIN_FILE_BYTES||new TextEncoder().encode(text).length>MAX_TERRAIN_FILE_BYTES)throw new Error('Terrain file exceeds 8 MiB');
    const d=object(JSON.parse(text));
    if(d.format!=='mapgen4-sphere-terrain'||d.version!==1)throw new Error('Unsupported terrain document');
    const mesh=object(d.mesh);
    for(const key of Object.keys(expected))if(mesh[key]!==expected[key])throw new Error('Terrain file uses a different mesh');
    const c=object(d.constraints);if(c.size!==constraintSize)throw new Error('Unsupported painting resolution');
    const constraints={size:constraintSize,painted:bool(c.painted),values:array(c.values,'painting',constraintSize**2,-1,1)};
    const offsets=d.offsets===null?null:array(d.offsets,'offsets',expected.triangles,-2,2);
    let report:ApplicationReport|null=null;
    if(d.report!==null) {
        const r=object(d.report);
        report={years:number(r.years,'geological years',0,1e15),sourceTimeS:number(r.sourceTimeS,'source time',0,Number.MAX_SAFE_INTEGER),
            clipped:number(r.clipped,'clipped triangles',0,expected.triangles,true),mobileKm3:number(r.mobileKm3,'mobile sediment',0,1e30),oceanKm3:number(r.oceanKm3,'ocean sediment',0,1e30)};
        if(r.importedFrom!==undefined) {
            if(typeof r.importedFrom!=='string'||!r.importedFrom.trim()||r.importedFrom.length>200)throw new Error('Invalid elevation source');
            report.importedFrom=r.importedFrom;
        }
    }
    if((offsets===null)!==(report===null))throw new Error('Application layer and report must be paired');
    const parameters:TerrainDocument['parameters']={},p=object(d.parameters);
    for(const [phase,fields] of Object.entries(initialParams)) {
        const source=object(p[phase]);parameters[phase]={};
        for(const [key,,min,max] of fields)parameters[phase][key]=number(source[key],key,min,max,key==='seed');
    }
    const s=object(d.settings),planet=object(s.planet),orbit=object(s.orbit);
    if(planet.schemaVersion!==1)throw new Error('Unsupported physical settings');
    const physical:PlanetConfig={schemaVersion:1,radiusM:number(planet.radiusM,'radius',1e4,1e8),densityKgM3:number(planet.densityKgM3,'density',100,30000),
        reliefM:number(planet.reliefM,'relief',1,1e5),oceanDepthM:number(planet.oceanDepthM,'ocean depth',1,1e5),
        siderealPeriodS:number(planet.siderealPeriodS,'sidereal period',1800,3.6e9),retrograde:bool(planet.retrograde),obliquityRad:number(planet.obliquityRad,'obliquity',0,Math.PI/2)};
    const orbital:OrbitConfig={distanceM:number(orbit.distanceM,'orbit distance',.1*AU_M,20*AU_M),bondAlbedo:number(orbit.bondAlbedo,'albedo',0,1),
        spinPhaseRad:number(orbit.spinPhaseRad,'spin phase',0,TAU),orbitPhaseRad:number(orbit.orbitPhaseRad,'orbit phase',0,TAU)};
    if(s.camera!=='space'&&s.camera!=='surface')throw new Error('Invalid camera');
    return {format:'mapgen4-sphere-terrain',version:1,mesh:{...expected},constraints,offsets,report,parameters,
        settings:{planet:physical,orbit:orbital,timeS:number(s.timeS,'time',0,Number.MAX_SAFE_INTEGER),camera:s.camera}};
}
export function encodeTerrainDocument(document:TerrainDocument):string {
    const text=JSON.stringify(document);
    decodeTerrainDocument(text,document.mesh,document.constraints.size);
    return text;
}
