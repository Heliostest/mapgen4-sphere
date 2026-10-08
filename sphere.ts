// Shared spherical coordinates, atlas seams, and painting distances.
// Default radius and fixed reference scale for terrain generation. Runtime
// radius changes stretch this angular mesh without replacing painted terrain.
export const SPHERE_RADIUS = 300;
export type Direction = [number, number, number];

export function uvToDirection(u: number, v: number): Direction {
    const lon = (u - .5) * 2 * Math.PI, lat = (.5 - v) * Math.PI;
    return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
}

export function directionToUV(p: ArrayLike<number>): [number, number] {
    const length = Math.hypot(p[0], p[1], p[2]);
    return [.5 + Math.atan2(p[0], p[2]) / (2*Math.PI), .5 - Math.asin(Math.max(-1, Math.min(1, p[1]/length))) / Math.PI];
}

// Rows include both poles; columns are periodic (no duplicate last column).
export function sampleSphere(data: Float32Array, size: number, u: number, v: number): number {
    const x = ((u % 1 + 1) % 1) * size;
    const y = Math.max(0, Math.min(size-1, v * (size-1)));
    const x0 = Math.floor(x), y0 = Math.floor(y), y1 = Math.min(size-1, y0+1);
    const fx = x-x0, fy = y-y0;
    const row = (r: number) => {
        if (r === 0 || r === size-1) return data[r*size];
        return data[r*size+x0]*(1-fx) + data[r*size+(x0+1)%size]*fx;
    };
    return row(y0)*(1-fy) + row(y1)*fy;
}

/** Unwrap a primitive and copy it across the atlas edge. Extra components
 * travel with the vertex (elevation/moisture or river widths). At a pole,
 * the triangular surface occupies a trapezoid in longitude/latitude. */
export function atlasTriangles(points: number[][]): number[][][] {
    let p = points.map(v => v.slice());
    const pole = p.findIndex(v => v[1] < 1e-5 || v[1] > 1000-1e-5);
    if (pole >= 0) p[pole][0] = p[(pole+1)%3][0];
    if (Math.max(...p.map(v=>v[0])) - Math.min(...p.map(v=>v[0])) > 500) {
        for (const v of p) if (v[0] < 500) v[0] += 1000;
    }
    let tris = [p];
    if (pole >= 0) {
        const a = p[(pole+1)%3], b = p[(pole+2)%3];
        const pa = p[pole].slice(), pb = p[pole].slice();
        pa[0] = a[0]; pb[0] = b[0];
        tris = [[pa,a,b], [pa,b,pb]];
    }
    const result = tris.slice();
    if (p.some(v=>v[0] > 1000)) {
        for (const tri of tris) result.push(tri.map(v=>[v[0]-1000,...v.slice(1)]));
    }
    return result;
}

export function angularDistance(a: ArrayLike<number>, b: ArrayLike<number>): number {
    const cross = Math.hypot(a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]);
    return Math.atan2(cross, a[0]*b[0]+a[1]*b[1]+a[2]*b[2]);
}
