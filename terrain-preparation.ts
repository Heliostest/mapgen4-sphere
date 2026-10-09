import type {Mesh} from './types.d.ts';
import type {TerrainDocument} from './terrain-document.ts';

export interface PreparedTerrain {
    numRiverTriangles:number;quad_elements_buffer:ArrayBuffer;a_quad_em_buffer:ArrayBuffer;a_river_xyww_buffer:ArrayBuffer;
    terrain_elevation_buffer:ArrayBuffer;base_triangle_elevation_buffer:ArrayBuffer;
}
/** A separate worker owns temporary buffers. Failure cannot damage the live map. */
export function prepareTerrain(mesh:Mesh,t_peaks:number[],base:object,d:TerrainDocument):Promise<PreparedTerrain> {
    return new Promise((resolve,reject)=>{
        const worker=new Worker('build/_worker.js'),param={...base,...d.parameters};
        const finish=(error?:Error,data?:PreparedTerrain)=>{clearTimeout(timeout);worker.terminate();if(error)reject(error);else resolve(data!);};
        const timeout=setTimeout(()=>finish(new Error('Terrain preparation timed out')),30000);
        worker.addEventListener('error',()=>finish(new Error('Terrain preparation failed')));
        worker.addEventListener('messageerror',()=>finish(new Error('Invalid terrain worker reply')));
        worker.addEventListener('message',event=>finish(undefined,event.data),{once:true});
        const indices=new Int32Array(3*mesh.numSolidSides),em=new Float32Array(2*(mesh.numRegions+mesh.numTriangles)),rivers=new Float32Array(63*mesh.numSolidTriangles);
        worker.postMessage({mesh,t_peaks,param});
        worker.postMessage({param,revision:0,offsets:d.offsets?new Float32Array(d.offsets):null,constraints:{size:d.constraints.size,constraints:new Float32Array(d.constraints.values)},quad_elements_buffer:indices.buffer,a_quad_em_buffer:em.buffer,a_river_xyww_buffer:rivers.buffer},[indices.buffer,em.buffer,rivers.buffer]);
    });
}
