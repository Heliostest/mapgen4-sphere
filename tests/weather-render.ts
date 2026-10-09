import Renderer from '../render.ts';
import {makeSphereMesh} from '../sphere-mesh.ts';
import {ThermalModel,makeThermalGrid,DEFAULT_THERMAL} from '../thermal.ts';
import {WaterModel,DEFAULT_WATER,moistureCapacity} from '../water.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';
import {makePlanetView} from '../planet-render.ts';
import {defaultTerrainParameters} from '../terrain-parameters.ts';
import {weatherTexture} from '../weather.ts';

const output=document.querySelector('pre')!;
try {
    const {mesh}=makeSphereMesh(25,35,12345),r=new Renderer(mesh),{gl}=r.webgl;
    const elevation=new Float32Array(mesh.numRegions+mesh.numTriangles).fill(.03);r.physicalElevation=elevation;
    for(let i=0;i<elevation.length;i++){r.a_quad_em[2*i]=elevation[i];r.a_quad_em[2*i+1]=.5;}
    for(let s=0;s<mesh.numSolidSides;s++)r.quad_elements.set([mesh.r_begin_s(s),mesh.r_begin_s(mesh.s_opposite_s(s)),mesh.numRegions+mesh.t_inner_s(s)],3*s);
    r.updateMap();r.resizeCanvas();const grid=makeThermalGrid(),land=new Float64Array(grid.count).fill(1),m=new ThermalModel(DEFAULT_PLANET,DEFAULT_ORBIT,DEFAULT_THERMAL,land,0,grid);m.temperatureK.fill(290);m.steps=1;
    const w=new WaterModel(grid,DEFAULT_PLANET.radiusM,land,new Float64Array(grid.count),m.temperatureK,DEFAULT_WATER);w.snowfallKgM2S=new Float64Array(grid.count);
    const params={...defaultTerrainParameters().render,ambient:1,flat:0,slope:0,outline_strength:0,outline_water:0};
    const surface={width:4,height:3,timeS:0,pixels:Uint8Array.from(Array.from({length:12},()=>[72,120,74,0]).flat())},frames:Uint8Array[]=[],counts:{label:string;blue:number;white:number}[]=[];
    for(const [label,humidity,rain,snow,east,north] of [['Dry',0,0,0,0,0],['Humid cloud',1,0,0,0,0],['Rain / east wind',1,50,0,10,0],['Rain / north wind',1,50,0,0,10],['Land snowfall',1,50,50,0,0],['Dry again',0,0,0,0,0]] as const) {
        w.atmosphereKgM2.fill(humidity*moistureCapacity(290));w.precipitationKgM2S.fill(rain/86400);w.snowfallKgM2S.fill(snow/86400);
        const thermal={width:grid.width,height:grid.height,timeS:0,pixels:Uint8Array.from(Array.from({length:grid.count},()=>[130,Math.round(128+east*1.27),Math.round(128+north*1.27),255]).flat())};
        r.updatePlanet({...makePlanetView(DEFAULT_PLANET,DEFAULT_ORBIT,0,'surface','surface'),surface,thermal,weather:weatherTexture(m,w)});r.updateView(params);await new Promise(requestAnimationFrame);
        const tex=r.fbo_drape.texture,pixels=new Uint8Array(tex.width*tex.height*4);r.fbo_drape.viewport();gl.readPixels(0,0,tex.width,tex.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);frames.push(pixels);
        let blue=0,white=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]){if(pixels[i+2]>pixels[i]+40&&pixels[i+2]>pixels[i+1]+30)blue++;if(pixels[i]>210&&pixels[i+1]>210&&pixels[i+2]>210)white++;}counts.push({label,blue,white});
        const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption');canvas.width=canvas.height=480;
        const frame=new OffscreenCanvas(tex.width,tex.height),img=new ImageData(tex.width,tex.height),stride=4*tex.width;
        for(let y=0;y<tex.height;y++)img.data.set(pixels.subarray(y*stride,(y+1)*stride),(tex.height-y-1)*stride);frame.getContext('2d')!.putImageData(img,0,0);canvas.getContext('2d')!.drawImage(frame,0,0,480,480);caption.textContent=label;figure.append(canvas,caption);document.querySelector('.row')!.append(figure);
    }
    if(!frames[0].every((v,i)=>v===frames[5][i]))throw new Error('Dry restoration changed pixels');
    if(frames[0].every((v,i)=>v===frames[1][i]))throw new Error('Humidity does not draw clouds');
    if(counts[0].blue||counts[1].blue||counts[2].blue<1000)throw new Error('Rain mask disconnected from precipitation');
    if(frames[2].every((v,i)=>v===frames[3][i]))throw new Error('Wind orientation does not affect rain strokes');
    if(counts[4].blue||counts[4].white<1000)throw new Error('Frozen precipitation must draw snow instead of rain');
    if(gl.getError()!==gl.NO_ERROR)throw new Error('WebGL error');output.textContent=JSON.stringify({status:'PASS',counts},null,2);
}catch(error){output.textContent=JSON.stringify({status:'FAIL',error:String(error)},null,2);}
