import Renderer from '../render.ts';
import {makeSphereMesh} from '../sphere-mesh.ts';
import {makePlanetView} from '../planet-render.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';
import {defaultTerrainParameters} from '../terrain-parameters.ts';
import {sphereProjection} from '../sphere-view.ts';
import {vec3} from 'gl-matrix';

// Real renderer, latitude mapping and texture replacement. Check complete
// rings inside each polar cap, not only a few pixels at the exact pole.
const output=document.querySelector('pre')!;
try {
    const {mesh}=makeSphereMesh(600,35,12345),r=new Renderer(mesh),{gl}=r.webgl;
    for(let v=0;v<mesh.numRegions+mesh.numTriangles;v++){r.a_quad_em[2*v]=.1;r.a_quad_em[2*v+1]=.5;}
    for(let s=0;s<mesh.numSolidSides;s++)r.quad_elements.set([mesh.r_begin_s(s),mesh.r_begin_s(mesh.s_opposite_s(s)),mesh.numRegions+mesh.t_inner_s(s)],3*s);
    r.updateMap();r.fbo_land.clear(0,0,0,1);r.drawLand(0);r.fbo_river.clear(0,0,0,0);r.fbo_depth.clear(0,0,0,1);
    const pixels=new Uint8Array(96*49*4);
    for(let y=0;y<49;y++)for(let x=0;x<96;x++)pixels.set(y<3?[100,0,100,0]:y>=46?[100,200,0,255]:y<8?[0,120,220,0]:y>40?[210,40,20,255]:y<24?(x%2?[0,0,200,0]:[200,0,0,255]):(x%2?[200,200,0,0]:[0,200,0,255]),4*(y*96+x));
    const view=makePlanetView(DEFAULT_PLANET,DEFAULT_ORBIT,0,'surface','surface');view.surface={width:96,height:49,pixels,timeS:0};r.updatePlanet(view);
    let checks=0;
    const checkPole=(y:number,x:number,expected:number[])=>{
        const params={...defaultTerrainParameters().render,y,x,zoom:.25,mountain_height:0,ambient:1,flat:0,slope:0,outline_strength:0,outline_water:0};
        const camera=sphereProjection(params);r.projection=camera.projection;r.rotation=camera.rotation;
        r.fbo_drape.clear(0,0,0,0);r.drawDrape(params);
        const tex=r.fbo_drape.texture!,actual=new Uint8Array(4*9);
        gl.readPixels(tex.width/2-1,tex.height/2-1,3,3,gl.RGBA,gl.UNSIGNED_BYTE,actual);
        for(let p=0;p<9;p++)for(let c=0;c<3;c++)if(Math.abs(actual[4*p+c]-expected[c])>2)throw new Error(`Pole y=${y}, rotation x=${x}: expected ${expected}, got ${Array.from(actual.slice(4*p,4*p+4))}`);
        checks++;
    };
    for(const x of [0,202.349,500,850]){checkPole(0,x,[100,0,100]);checkPole(1000,x,[100,200,0]);}
    for(const sign of [-1,1])for(const rotation of [202.349,750]) {
        checkPole(sign>0?0:1000,rotation,sign>0?[100,0,100]:[100,200,0]);
        for(const degrees of [4,18])for(let lon=0;lon<12;lon++) {
            const a=degrees*Math.PI/180,l=lon*Math.PI/6;
            const clip=vec3.transformMat4(vec3.create(),[300*Math.sin(a)*Math.sin(l),300*sign*Math.cos(a),300*Math.sin(a)*Math.cos(l)],r.projection);
            const tex=r.fbo_drape.texture!,actual=new Uint8Array(4);
            gl.readPixels(Math.floor((clip[0]+1)*.5*tex.width),Math.floor((clip[1]+1)*.5*tex.height),1,1,gl.RGBA,gl.UNSIGNED_BYTE,actual);
            const expected=degrees===4?(sign>0?[100,0,100]:[100,200,0]):sign>0?[0,120,220]:[210,40,20];
            if(expected.some((c,i)=>Math.abs(c-actual[i])>2))throw new Error(`Polar ring ${sign*degrees}°, longitude ${lon}, rotation ${rotation}: ${actual}, expected ${expected}`);
            checks++;
        }
    }
    const updated=new Uint8Array(4*5*4);for(let i=0;i<updated.length;i+=4)updated.set([20,40,60,255],i);
    r.updatePlanet({...view,surface:{width:4,height:5,timeS:0,pixels:updated}});checkPole(0,202.349,[20,40,60]);checkPole(1000,202.349,[20,40,60]);
    r.updatePlanet({...view,layer:'original',surface:null});r.updatePlanet(view);checkPole(0,202.349,[100,0,100]);checkPole(1000,202.349,[100,200,0]);
    if(gl.getError()!==gl.NO_ERROR)throw new Error('WebGL error');
    output.textContent=JSON.stringify({status:'PASS',checks},null,2);
}catch(error){output.textContent=JSON.stringify({status:'FAIL',error:String(error)},null,2);}
