import param from './config.js';
import {makeSphereMesh} from './sphere-mesh.ts';
import {SPHERE_RADIUS} from './sphere.ts';

export async function makeMesh(settings=param) {
    const count = Math.round(.72 * 4*Math.PI*SPHERE_RADIUS*SPHERE_RADIUS/(settings.spacing*settings.spacing));
    return makeSphereMesh(count, settings.mountainSpacing, settings.mesh.seed);
}
