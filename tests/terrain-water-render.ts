import Renderer from '../render.ts';
import {makeSphereMesh} from '../sphere-mesh.ts';
import {ThermalRuntime} from '../thermal-runtime.ts';
import {sampleTerrainGrid,makeThermalGrid} from '../thermal.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';
import {makePlanetView} from '../planet-render.ts';
import {defaultTerrainParameters} from '../terrain-parameters.ts';
import {terrainWaterView} from '../terrain-water-view.ts';

const output=document.querySelector('pre')!;
try {
    const {mesh}=makeSphereMesh(25,35,12345),r=new Renderer(mesh),{gl}=r.webgl;
    const elevation=new Float32Array(mesh.numRegions+mesh.numTriangles);
    // A smooth, irregular bowl centered on the visible hemisphere, entirely land.
    const height=(x:number,y:number,z:number)=>.01+.05*(1-z)+.012*y*y+.007*x*y;
    for(let i=0;i<mesh.numRegions;i++)elevation[i]=height(...Array.from(mesh.xyz_r.subarray(3*i,3*i+3)) as [number,number,number]);
    for(let i=0;i<mesh.numTriangles;i++)elevation[mesh.numRegions+i]=height(...Array.from(mesh.xyz_t.subarray(3*i,3*i+3)) as [number,number,number]);
    r.physicalElevation=elevation;
    for(let i=0;i<elevation.length;i++){r.a_quad_em[2*i]=elevation[i];r.a_quad_em[2*i+1]=.5;}
    for(let s=0;s<mesh.numSolidSides;s++)r.quad_elements.set([mesh.r_begin_s(s),mesh.r_begin_s(mesh.s_opposite_s(s)),mesh.numRegions+mesh.t_inner_s(s)],3*s);
    r.updateMap();r.resizeCanvas();
    const rt=new ThermalRuntime(makeThermalGrid(24,12)),sample=sampleTerrainGrid(rt.grid,mesh.xyz_r,elevation);
    rt.enabled=rt.waterEnabled=true;rt.environmentConfig.terrainWater=true;
    rt.setTerrain(sample.landFraction,sample.landElevation,{mesh,directions:mesh.xyz_r,elevation});rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);
    const w=rt.water!,route=w.routing!,params={...defaultTerrainParameters().render,ambient:1,flat:0,slope:0,outline_strength:0,outline_water:0};
    // Isolate the controlled reservoir inputs from generated rain/melt, which
    // now also feeds the continuous channel display before the first step.
    w.precipitationKgM2S.fill(0);w.meltKgM2S.fill(0);
    const surface={width:4,height:3,timeS:0,pixels:Uint8Array.from(Array.from({length:12},()=>[180,164,118,0]).flat())};
    const counts:{label:string;blue:number;green:number;volumeM3:number}[]=[];
    for(const [label,level,soil] of [['Dry basin',0,0],['Saturated ground',0,1],['Low lake',180,1],['High lake',350,1],['Drained again',0,0]] as const) {
        w.surfaceKgM2.fill(0);w.soilKgM2.fill(soil*w.config.soilCapacityKgM2);const state=route.checkpoint();state.fluxM3S.fill(0);state.receiverSide.fill(-1);
        for(let t=0;t<mesh.numTriangles;t++) {
            state.volumeM3[t]=Math.max(0,level-route.network.bedM[t])*route.network.areaM2[t];
            w.surfaceKgM2[route.network.cell[t]]+=state.volumeM3[t]*1000/w.cellAreaM2;
        }
        route.restore(state,w);rt.model!.steps++; // Different fixture state: invalidate view cache.
        r.updatePlanet({...makePlanetView(DEFAULT_PLANET,DEFAULT_ORBIT,0,'surface','surface'),surface,terrainWater:terrainWaterView(rt)});r.updateView(params);
        await new Promise(requestAnimationFrame);
        const tex=r.fbo_drape.texture!,pixels=new Uint8Array(tex.width*tex.height*4);r.fbo_drape.viewport();
        gl.readPixels(0,0,tex.width,tex.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        let blue=0,green=0;for(let p=0;p<pixels.length;p+=4)if(pixels[p+3]>0){if(pixels[p+2]>pixels[p]&&pixels[p+1]>pixels[p])blue++;if(pixels[p+1]>pixels[p]&&pixels[p+1]>pixels[p+2])green++;}
        counts.push({label,blue,green,volumeM3:state.volumeM3.reduce((a,b)=>a+b,0)});
        const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption');canvas.width=canvas.height=640;
        // Preserve the exact GPU framebuffer read above, flipped to canvas rows.
        const frame=new OffscreenCanvas(tex.width,tex.height),image=new ImageData(tex.width,tex.height),stride=tex.width*4;
        for(let y=0;y<tex.height;y++)image.data.set(pixels.subarray(y*stride,(y+1)*stride),(tex.height-y-1)*stride);
        frame.getContext('2d')!.putImageData(image,0,0);canvas.getContext('2d')!.drawImage(frame,0,0,640,640);
        caption.textContent=label;figure.append(canvas,caption);document.querySelector('.row')!.append(figure);
    }
    if(counts[0].blue||counts[4].blue||counts[0].green)throw new Error('Dry basin carries a water mask');
    if(counts[2].blue<1000||counts[3].blue<counts[2].blue*1.5)throw new Error('Lake area does not grow with reservoir volume');
    if(counts[1].green<=counts[0].green)throw new Error('Saturated ground is not visible');
    if(gl.getError()!==gl.NO_ERROR)throw new Error('WebGL error');
    output.textContent=JSON.stringify({status:'PASS',counts},null,2);
}catch(error){output.textContent=JSON.stringify({status:'FAIL',error:String(error)},null,2);}
