import {mat4, vec3} from 'gl-matrix';
import {directionToUV, SPHERE_RADIUS} from './sphere.ts';

export const MIN_ZOOM = .05;
export const MAX_ZOOM = 2;

/** Height follows the local sphere normal, independent of the camera.
 * Keep this displacement identical to sphere_position in render.ts. */
export function terrainPosition(direction: ArrayLike<number>, elevation: number, height: number, sphereRadius=SPHERE_RADIUS,inlandDepthRatio=0): [number,number,number] {
    const visible=elevation<0&&inlandDepthRatio>0?elevation*inlandDepthRatio:Math.max(0,elevation);
    const radius=sphereRadius+height*visible;
    return [direction[0]*radius,direction[1]*radius,direction[2]*radius];
}

export function sphereProjection(param: any, model:mat4|null=null): {projection: mat4; rotation: mat4} {
    const rotation=mat4.create(), radians=Math.PI/180;
    mat4.rotateZ(rotation,rotation,param.rotate_deg*radians);
    mat4.rotateX(rotation,rotation,(90-param.y*.18+param.tilt_deg)*radians);
    mat4.rotateY(rotation,rotation,-(param.x*.36-180)*radians);
    if(model) mat4.multiply(rotation,rotation,model);
    const extent=100/param.zoom;
    const projection=mat4.ortho(mat4.create(),-extent,extent,-extent,extent,-2000,2000);
    mat4.multiply(projection,projection,rotation);
    return {projection,rotation};
}

/** Ray/triangle picking uses the same displaced vertices as the GPU, so high
 * mountains and the silhouette are editable without painting the far side. */
export function pickTerrain(coords: number[], inverse: mat4, positions: Float32Array, indices: Int32Array, directions: Float32Array): [number,number] | null {
    return pickTerrainHit(coords,inverse,positions,indices,directions)?.uv ?? null;
}

export type TerrainHit = {uv:[number,number];indices:[number,number,number];weights:[number,number,number]};

/** Retain barycentrics so physical fields can be probed independently of the
 * exaggerated/decorated positions used to determine the visible surface. */
export function pickTerrainHit(coords: number[], inverse: mat4, positions: Float32Array, indices: Int32Array, directions: Float32Array): TerrainHit | null {
    const origin=vec3.transformMat4(vec3.create(),[coords[0]*2-1,1-coords[1]*2,-1],inverse);
    const end=vec3.transformMat4(vec3.create(),[coords[0]*2-1,1-coords[1]*2,1],inverse);
    const dx=end[0]-origin[0], dy=end[1]-origin[1], dz=end[2]-origin[2];
    let nearest=Infinity;
    let surface: [number,number,number] = [0,0,0];
    let vertices:[number,number,number]=[0,0,0], weights:[number,number,number]=[0,0,0];
    for (let i=0;i<indices.length;i+=3) {
        const a=3*indices[i], b=3*indices[i+1], c=3*indices[i+2];
        const ax=positions[a], ay=positions[a+1], az=positions[a+2];
        const e1x=positions[b]-ax,e1y=positions[b+1]-ay,e1z=positions[b+2]-az;
        const e2x=positions[c]-ax,e2y=positions[c+1]-ay,e2z=positions[c+2]-az;
        const px=dy*e2z-dz*e2y,py=dz*e2x-dx*e2z,pz=dx*e2y-dy*e2x;
        const det=e1x*px+e1y*py+e1z*pz;
        if (Math.abs(det)<1e-9) continue;
        const tx=origin[0]-ax,ty=origin[1]-ay,tz=origin[2]-az;
        const u=(tx*px+ty*py+tz*pz)/det;
        if (u<0 || u>1) continue;
        const qx=ty*e1z-tz*e1y,qy=tz*e1x-tx*e1z,qz=tx*e1y-ty*e1x;
        const v=(dx*qx+dy*qy+dz*qz)/det;
        if (v<0 || u+v>1) continue;
        const distance=(e2x*qx+e2y*qy+e2z*qz)/det;
        if (distance>=0 && distance<nearest) {
            nearest=distance;
            vertices=[a/3,b/3,c/3];weights=[1-u-v,u,v];
            // Recover the undisplaced surface location using barycentric
            // coordinates, so varying vertex heights do not shift brush UVs.
            for (let k=0;k<3;k++) surface[k]=directions[a+k]*(1-u-v)+directions[b+k]*u+directions[c+k]*v;
        }
    }
    if (!Number.isFinite(nearest)) return null;
    return {uv:directionToUV(surface),indices:vertices,weights};
}
