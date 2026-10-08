import type {PlanetParams,Terrain} from './terrain.ts';
export type Stroke={center:number[];radius:number;target:number;strength:number};
export type WorkerRequest={id:number;params:PlanetParams;reset?:boolean;strokes?:Stroke[]};
export type WorkerResponse={id:number;result?:Terrain;error?:string;elapsed:number};
