// SPDX-License-Identifier: Apache-2.0
import {makeSphere,SPHERE_LEVEL} from './mesh.ts';
import {PlanetSession} from './session.ts';
import type {WorkerRequest,WorkerResponse} from './protocol.ts';
const session=new PlanetSession(makeSphere(SPHERE_LEVEL));
const scope=self as unknown as {onmessage:(event:MessageEvent<WorkerRequest>)=>void;postMessage:(reply:WorkerResponse,transfer?:Transferable[])=>void};
scope.onmessage=({data})=>{
    const start=performance.now();
    try{
        const source=session.apply(data);
        // Keep authoritative arrays in the worker: transferred response copies detach.
        const result={elevation:source.elevation.slice(),moisture:source.moisture.slice(),drainage:source.drainage.slice(),flow:source.flow.slice()};
        scope.postMessage({id:data.id,result,elapsed:performance.now()-start},Object.values(result).map(a=>a.buffer));
    }catch(error){scope.postMessage({id:data.id,error:String(error),elapsed:performance.now()-start});}
};
