/* I use the TriangleMesh from my dual mesh library, but I add fields to it,
 * so I'm declaring that here for type checking purposes. */

import {SphereMesh} from "./sphere-mesh.ts";

export class Mesh extends SphereMesh {
    is_boundary_t: Int8Array; /* indexed on t */
    length_s: Float32Array; /* indexed on s */
}
