// SPDX-License-Identifier: Apache-2.0
export type SphereMesh = {positions: Float32Array; triangles: Uint32Array; neighbors: number[][]};
export const SPHERE_LEVEL=6;
export function makeSphere(level: number): SphereMesh {
    if (!Number.isInteger(level) || level < 0 || level > 6) throw new RangeError('Sphere level must be an integer from 0 to 6');
    const t = (1 + Math.sqrt(5)) / 2;
    const vertices = [[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]];
    for (const p of vertices) { const length = Math.hypot(...p); for(let k=0;k<3;k++) p[k]/=length; }
    let faces = [0,11,5, 0,5,1, 0,1,7, 0,7,10, 0,10,11, 1,5,9, 5,11,4, 11,10,2, 10,7,6, 7,1,8, 3,9,4, 3,4,2, 3,2,6, 3,6,8, 3,8,9, 4,9,5, 2,4,11, 6,2,10, 8,6,7, 9,8,1];
    for (let depth=0;depth<level;depth++) {
        const midpoints = new Map<string,number>();
        const midpoint = (a:number,b:number):number => {
            const key = `${Math.min(a,b)}:${Math.max(a,b)}`;
            const existing = midpoints.get(key);
            if(existing !== undefined) return existing;
            const p = vertices[a].map((v,k)=>v+vertices[b][k]), length=Math.hypot(...p);
            const id=vertices.length;
            vertices.push(p.map(v=>v/length)); midpoints.set(key,id); return id;
        };
        const next:number[]=[];
        for(let i=0;i<faces.length;i+=3) {
            const [a,b,c]=faces.slice(i,i+3), ab=midpoint(a,b), bc=midpoint(b,c), ca=midpoint(c,a);
            next.push(a,ab,ca, b,bc,ab, c,ca,bc, ab,bc,ca);
        }
        faces=next;
    }
    const links = vertices.map(()=>new Set<number>());
    for(let i=0;i<faces.length;i+=3) for(let k=0;k<3;k++) {
        const a=faces[i+k],b=faces[i+(k+1)%3]; links[a].add(b); links[b].add(a);
    }
    return {positions:Float32Array.from(vertices.flat()),triangles:Uint32Array.from(faces),neighbors:links.map(s=>Array.from(s))};
}
