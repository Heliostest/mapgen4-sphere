import Delaunator from 'delaunator';
import {makeRandFloat} from '@redblobgames/prng';
import {TriangleMesh} from './dual-mesh/index.ts';
import {SPHERE_RADIUS, directionToUV, angularDistance, type Direction} from './sphere.ts';

export class SphereMesh extends TriangleMesh {
    declare xyz_r: Float32Array;
    declare xyz_t: Float32Array;
    declare is_boundary_t: Int8Array;
    declare length_s: Float32Array;
    is_ghost_r(_r: number) { return false; }
    is_ghost_s(_s: number) { return false; }
    is_ghost_t(_t: number) { return false; }
}

/** Stereographic Delaunay + its pole closes the sphere. The added pole is a
 * real region, not a ghost or a duplicated longitude boundary. */
export function makeSphereMesh(count: number, mountainSpacing: number, seed: number) {
    const random = makeRandFloat(seed);
    const directions: Direction[] = [[0,-1,0]];
    const goldenAngle = Math.PI * (3-Math.sqrt(5));
    const angularSpacing = Math.sqrt(4*Math.PI/count);
    for (let i=0; i<count-2; i++) {
        const y = -1 + 2*(i+1)/(count-1);
        const angle = i * goldenAngle;
        const radius = Math.sqrt(1-y*y);
        // Bounded tangent perturbations preserve the well-spaced Fibonacci
        // distribution at every density and latitude. A fixed longitude
        // jitter creates skinny dual quads at high resolution.
        const east = .30*angularSpacing*(random()-.5);
        const north = .30*angularSpacing*(random()-.5);
        const p: Direction = [radius*Math.sin(angle)+east*Math.cos(angle)-north*y*Math.sin(angle),
            y+north*radius, radius*Math.cos(angle)-east*Math.sin(angle)-north*y*Math.cos(angle)];
        const length=Math.hypot(...p);
        directions.push(p.map(v=>v/length) as Direction);
    }
    const stereo = directions.map(([x,y,z]): [number,number] => [x/(1-y),z/(1-y)]);
    const triangulation = Delaunator.from(stereo);
    const init = TriangleMesh.addGhostStructure({points: stereo, delaunator: {
        triangles:Int32Array.from(triangulation.triangles), halfedges:triangulation.halfedges,
    }});
    directions.push([0,1,0]);
    init.points = directions.map(p => {
        const uv = directionToUV(p); return [uv[0]*1000,uv[1]*1000];
    });
    init.numSolidSides = init.delaunator.triangles.length;
    const mesh = new SphereMesh(init);
    mesh.numSolidRegions = mesh.numRegions;
    mesh.xyz_r = Float32Array.from(directions.flat());
    mesh.xyz_t = new Float32Array(3*mesh.numTriangles);
    mesh.is_boundary_t = new Int8Array(mesh.numTriangles);
    mesh.length_s = new Float32Array(mesh.numSides);
    for (let t=0; t<mesh.numTriangles; t++) {
        const r = mesh.r_around_t(t);
        const p: Direction = [0,0,0];
        for (const v of r) for (let k=0;k<3;k++) p[k] += directions[v][k];
        const length = Math.hypot(...p);
        for (let k=0;k<3;k++) mesh.xyz_t[3*t+k] = p[k] /= length;
        const uv = directionToUV(p);
        mesh._vertex_t[t] = [1000*uv[0],1000*uv[1]];
    }
    for (let s=0;s<mesh.numSides;s++) {
        mesh.length_s[s] = SPHERE_RADIUS * angularDistance(directions[mesh.r_begin_s(s)], directions[mesh.r_end_s(s)]);
    }
    const order = Array.from({length:count}, (_,i)=>i);
    for (let i=order.length-1;i>0;i--) {
        const j = Math.floor(random()*(i+1)); [order[i],order[j]] = [order[j],order[i]];
    }
    const peaks: number[] = [], limit = Math.cos(mountainSpacing/SPHERE_RADIUS);
    for (const r of order) {
        const a = directions[r];
        if (peaks.every(q => { const b=directions[q]; return a[0]*b[0]+a[1]*b[1]+a[2]*b[2] < limit; })) peaks.push(r);
    }
    const t_peaks = peaks.map(r=>mesh.t_inner_s(mesh._s_of_r[r]));
    return {mesh,t_peaks};
}
