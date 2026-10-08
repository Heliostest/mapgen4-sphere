import param from './config.js';
import {makeSphereMesh} from './sphere-mesh.ts';
import {SPHERE_RADIUS} from './sphere.ts';

export async function makeMesh() {
    const count = Math.round(.72 * 4*Math.PI*SPHERE_RADIUS*SPHERE_RADIUS/(param.spacing*param.spacing));
    return makeSphereMesh(count, param.mountainSpacing, param.mesh.seed);
}
