// SPDX-License-Identifier: Apache-2.0
import type {SphereMesh} from './mesh.ts';
import {generateTerrain,paintTerrain,type Terrain,type PlanetParams} from './terrain.ts';
import type {WorkerRequest} from './protocol.ts';
export class PlanetSession {
    mesh:SphereMesh;
    private edits:Float32Array;
    private result?:Terrain;
    private params?:PlanetParams;
    constructor(mesh:SphereMesh){this.mesh=mesh;this.edits=new Float32Array(mesh.neighbors.length).fill(NaN);}
    apply(request:WorkerRequest):Terrain{
        if(request.reset || this.params?.seed!==request.params.seed)this.edits.fill(NaN);
        const changed=!this.params || Object.keys(request.params).some(k=>request.params[k as keyof PlanetParams]!==this.params![k as keyof PlanetParams]);
        if(!this.result || changed || request.reset)this.result=generateTerrain(this.mesh,request.params,this.edits);
        for(const stroke of request.strokes??[])paintTerrain(this.mesh,this.result.elevation,this.edits,stroke.center,stroke.radius,stroke.target,stroke.strength);
        if(request.strokes?.length)this.result=generateTerrain(this.mesh,request.params,this.edits);
        this.params={...request.params};
        return this.result;
    }
}
