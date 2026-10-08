import {mat4} from 'gl-matrix';
import Renderer from '../render.ts';
import {makeSphereMesh} from '../sphere-mesh.ts';
import {makeThermalGrid} from '../thermal.ts';
import {makePlanetView} from '../planet-render.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';
import {sphereProjection} from '../sphere-view.ts';

const output=document.querySelector('pre')!;
try {
    const {mesh}=makeSphereMesh(120,35,12345),r=new Renderer(mesh),{gl}=r.webgl;
    const vertices=mesh.numRegions+mesh.numTriangles;
    r.physicalElevation=new Float32Array(vertices).fill(.8);
    for(let v=0;v<vertices;v++){r.a_quad_em[2*v]=.8;r.a_quad_em[2*v+1]=.5;}
    for(let s=0;s<mesh.numSolidSides;s++)r.quad_elements.set([mesh.r_begin_s(s),mesh.r_begin_s(mesh.s_opposite_s(s)),mesh.numRegions+mesh.t_inner_s(s)],3*s);
    r.updateMap();
    const grid=makeThermalGrid(),field=(v:number)=>new Float64Array(grid.count).fill(v);
    const original=makePlanetView(DEFAULT_PLANET,DEFAULT_ORBIT,0,'original','surface');
    const evolved={...original,geomorph:{preview:{grid,land:field(1),baseHeightM:field(8000),heightM:field(4000)},texture:{width:grid.width,height:grid.height,timeS:0,pixels:new Uint8Array(grid.count*4)}}};
    let checks=0;
    const check=(ok:boolean,message:string)=>{checks++;if(!ok)throw new Error(message);};
    const gpuHeights=(height:number)=>{
        const data=new Float32Array(r.atlasVertexCount*4);r.buffer_quad_xy.bind();gl.getBufferSubData(gl.ARRAY_BUFFER,0,data);
        check(data.every((v,i)=>i%4!==2||v===Math.fround(height)),`Actual GPU vertex elevations must be ${height}`);
    };
    r.updatePlanet(evolved);gpuHeights(.4);
    check(r.a_quad_em.every((v,i)=>i%2!==0||v===Math.fround(.8)),'Preview mutated worker/source terrain');
    for(const radius of [100,300,1000])for(const height of [0,50,150]) {
        r.updatePicking(height,radius);
        let maxError=0;
        for(let v=0;v<vertices;v++)for(let j=0;j<3;j++)maxError=Math.max(maxError,Math.abs(r.pickPositions[3*v+j]-r.pickDirections[3*v+j]*(radius+height*Math.fround(.4))));
        check(maxError<.0001,'Picking and uploaded GPU elevations diverge');
    }
    for(const camera of [{x:500,y:500,rotate_deg:0,tilt_deg:0},{x:230,y:740,rotate_deg:90,tilt_deg:30}]) {
        r.updatePicking(50,300);r.inverse_projection=mat4.invert(mat4.create(),sphereProjection({...camera,zoom:.3}).projection)!;
        check(Math.abs(r.sampleTerrain([.5,.5])!.elevation-.4)<1e-6,'Physical probe must report preview height under rotation');
    }
    const borrowed=structuredClone({e:r.a_quad_em,q:r.quad_elements,river:r.a_river_xyww},{transfer:[r.a_quad_em.buffer,r.quad_elements.buffer,r.a_river_xyww.buffer]});
    check(r.a_quad_em.byteLength===0,'Reproduction must detach live worker buffers');
    r.updatePlanet(original);gpuHeights(.8);r.updatePlanet(evolved);gpuHeights(.4);
    check(borrowed.e.every((v,i)=>i%2!==0||v===Math.fround(.8)),'Worker received modified preview data');
    r.a_quad_em=borrowed.e;r.quad_elements=borrowed.q;r.a_river_xyww=borrowed.river;
    for(let v=0;v<vertices;v++)r.a_quad_em[2*v]=.6;
    r.physicalElevation.fill(.6);r.updateMap();r.updatePlanet(original);gpuHeights(.6);
    check(gl.getError()===gl.NO_ERROR,'WebGL error during preview upload');
    output.textContent=JSON.stringify({status:'PASS',checks},null,2);
}catch(error){output.textContent=JSON.stringify({status:'FAIL',error:String(error)},null,2);}
