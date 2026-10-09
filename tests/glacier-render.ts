import Renderer from '../render.ts';
import {makeSphereMesh} from '../sphere-mesh.ts';
import {makeThermalGrid,ThermalModel,DEFAULT_THERMAL,sampleTerrainGrid} from '../thermal.ts';
import {WaterModel,DEFAULT_WATER,FUSION_J_KG} from '../water.ts';
import {GlacierModel,ICE_DENSITY,GLACIER_YEAR} from '../glacier.ts';
import {EnvironmentModel,DEFAULT_ENVIRONMENT} from '../environment.ts';
import {makeSurfaceGrid,resampleClimateField} from '../surface-grid.ts';
import {terrainRoutingNetwork} from '../terrain-water.ts';
import {terrainWaterView} from '../terrain-water-view.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';
import {makePlanetView} from '../planet-render.ts';
import {defaultTerrainParameters} from '../terrain-parameters.ts';
import {previewElevation} from '../terrain-preview.ts';
import type {ThermalRuntime} from '../thermal-runtime.ts';

const output=document.querySelector('pre')!;
const check=(ok:boolean,message:string)=>{if(!ok)throw new Error(message);};
try {
    const {mesh}=makeSphereMesh(6000,35,12345),r=new Renderer(mesh),{gl}=r.webgl,grid=makeThermalGrid(),n=grid.count,surfaceGrid=makeSurfaceGrid();
    const field=(v:number)=>new Float64Array(n).fill(v),temperature=field(260);
    const params={...defaultTerrainParameters().render,zoom:.28,ambient:1,flat:0,slope:0,outline_strength:0,outline_water:0};
    const elevation=new Float32Array(mesh.numRegions+mesh.numTriangles);
    const setBed=(height:(x:number,y:number,z:number)=>number)=>{
        for(let i=0;i<elevation.length;i++) {
            const xyz=i<mesh.numRegions?mesh.xyz_r:mesh.xyz_t,k=i<mesh.numRegions?i:i-mesh.numRegions;
            elevation[i]=height(xyz[3*k],xyz[3*k+1],xyz[3*k+2]);r.a_quad_em[2*i]=elevation[i];r.a_quad_em[2*i+1]=.5;
        }
        r.physicalElevation=elevation.slice();
        for(let s=0;s<mesh.numSolidSides;s++)r.quad_elements.set([mesh.r_begin_s(s),mesh.r_begin_s(mesh.s_opposite_s(s)),mesh.numRegions+mesh.t_inner_s(s)],3*s);
        r.updateMap();r.resizeCanvas();
    };
    const frame=async(section:string,label:string,view:Parameters<Renderer['updatePlanet']>[0],camera={x:500,y:500})=>{
        r.updatePlanet(view);r.updateView({...params,...camera});await new Promise(requestAnimationFrame);
        const tex=r.fbo_drape.texture!,pixels=new Uint8Array(tex.width*tex.height*4);r.fbo_drape.viewport();gl.readPixels(0,0,tex.width,tex.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption');canvas.width=canvas.height=640;
        const source=new OffscreenCanvas(tex.width,tex.height),image=new ImageData(tex.width,tex.height),stride=tex.width*4;
        for(let y=0;y<tex.height;y++)image.data.set(pixels.subarray(y*stride,(y+1)*stride),(tex.height-y-1)*stride);
        source.getContext('2d')!.putImageData(image,0,0);canvas.getContext('2d')!.drawImage(source,0,0,640,640);caption.textContent=label;figure.append(canvas,caption);document.querySelector(`#${section} .row`)!.append(figure);
        return pixels;
    };
    const view=makePlanetView(DEFAULT_PLANET,DEFAULT_ORBIT,0,'surface','surface');
    const iceTexture=(w:WaterModel,thickness=false,range=thickness?3000:5)=>{
        const h=resampleClimateField(grid,w.landIceKgM2.map((v,i)=>w.land[i]>0?v/(ICE_DENSITY*w.land[i]):0),surfaceGrid),pixels=new Uint8Array(h.length*4);
        for(let i=0;i<h.length;i++) {
            const f=Math.min(1,h[i]/range),bare=thickness?[15,43,61]:[185,164,110],ice=thickness?[240,247,249]:[190,217,224];
            for(let c=0;c<3;c++)pixels[4*i+c]=Math.round(bare[c]*(1-f)+ice[c]*f);
        }
        return {width:surfaceGrid.width,height:surfaceGrid.height,timeS:0,pixels};
    };
    setBed((_x,_y,z)=>.01+.19*Math.max(0,z)**4);
    const bed=Float64Array.from({length:n},(_,i)=>{const y=grid.sinLat[Math.floor(i/grid.width)],lon=2*Math.PI*((i%grid.width+.5)/grid.width-.5),z=Math.sqrt(1-y*y)*Math.cos(lon);return 100+1900*Math.max(0,z)**4;});
    const w=new WaterModel(grid,DEFAULT_PLANET.radiusM,field(1),bed,temperature,{...DEFAULT_WATER,initialOceanDepthM:0});
    const request=Float64Array.from({length:n},(_,i)=>{const y=grid.sinLat[Math.floor(i/grid.width)],lon=2*Math.PI*((i%grid.width+.5)/grid.width-.5),z=Math.sqrt(1-y*y)*Math.cos(lon);return z>Math.cos(.3)?3000*ICE_DENSITY:0;});
    w.surfaceKgM2.set(request);const mass=w.diagnostics().totalMm;w.seedLandIce(request);const g=new GlacierModel(w,9.81),initialIce=w.landIceKgM2.slice();
    const initial=await frame('flow','Initial: finite 3,000 m ice dome',{...view,surface:iceTexture(w)});
    for(let year=0;year<2000;year++)g.step(GLACIER_YEAR,temperature);
    const final=await frame('flow','After 2,000 physical years: ice spreads to adjacent land',{...view,surface:iceTexture(w)});
    await frame('flow','Final thickness: dark = 0 m; white = 3,000 m',{...view,surface:iceTexture(w,true)});
    const flow={years:2000,stepYears:1,radiusM:w.radiusM,temperatureK:260,initialIceMm:initialIce.reduce((a,b)=>a+b,0)/n,finalIceMm:w.diagnostics().landIceMm,waterResidualMm:w.diagnostics().totalMm-mass,maxErosionM:Math.max(...g.erodedM),...g.diagnostics(),newIceCells:w.landIceKgM2.filter((v,i)=>v>ICE_DENSITY*5&&initialIce[i]===0).length};
    check(flow.newIceCells>0,'No visible ice crossed into previously bare cells');check(Math.abs(flow.waterResidualMm)<1e-6&&Math.abs(flow.solidResidualM)<1e-10,'Controlled flow budgets do not close');check(initial.some((v,i)=>v!==final[i]),'Flow does not change actual renderer pixels');

    setBed(()=>.8);
    const land=field(1),base=field(8000),candidate=field(8000);
    for(const row of [0,grid.height-1])for(let x=0;x<grid.width;x++)candidate[row*grid.width+x]-=700*(.5+.5*Math.cos(2*Math.PI*x/grid.width));
    const preview={grid,land,baseHeightM:base,heightM:candidate},cover={width:4,height:3,timeS:0,pixels:Uint8Array.from(Array.from({length:12},()=>[190,217,224,0]).flat())};
    const geometry={preview,texture:{width:grid.width,height:grid.height,timeS:0,pixels:new Uint8Array(n*4)}};
    for(const [label,y] of [['North',0],['South',1000]] as const)await frame('pole',`${label}: same candidate / same scale`,{...view,surface:cover,geomorph:geometry},{x:202.349,y});
    const poleRanges=[0,1].map(v=>{const samples=Array.from({length:100},(_,x)=>previewElevation(.8,x/100,v,preview));return Math.max(...samples)-Math.min(...samples);});
    const atlas=new Float32Array(r.atlasVertexCount*4);r.buffer_quad_xy.bind();gl.getBufferSubData(gl.ARRAY_BUFFER,0,atlas);
    const gpuPoles=[0,1000].map(y=>{
        const heights:number[]=[];for(let i=0;i<atlas.length;i+=4)if(Math.abs(atlas[i+1]-y)<1e-5)heights.push(atlas[i+2]);
        check(heights.length>0,'No polar atlas vertices were uploaded');
        return {vertices:heights.length,min:Math.min(...heights),max:Math.max(...heights)};
    });
    // Report first so the pre-fix browser captures remain useful evidence.
    check(poleRanges.every(v=>v<1e-14),`One physical pole has multiple heights: ${poleRanges}`);
    check(gpuPoles.every(p=>p.max===p.min&&Math.abs(p.min-.765)<1e-7),'Actual GPU polar vertices have inconsistent candidate heights');

    setBed((_x,y,z)=>.00001+.00015*(1-z)+.00002*y*y);
    const sample=sampleTerrainGrid(grid,mesh.xyz_r,elevation),zero=field(0),meltTemperature=field(273.15),config={...DEFAULT_WATER,initialOceanDepthM:0,evaporationFraction:0,windMps:0,moistureDiffusivityM2s:0};
    const reference={temperatureK:meltTemperature,radiationScale:field(1),absorbedWm2:zero,humidityFraction:zero,soilFraction:zero,surfaceMm:zero,rainMmDay:zero,evaporationMmDay:zero,windEastMps:zero,windNorthMps:zero};
    const mw=new WaterModel(grid,DEFAULT_PLANET.radiusM,sample.landFraction,sample.landElevation.map(v=>v*DEFAULT_PLANET.reliefM),meltTemperature,config,reference);
    const ice=Float64Array.from({length:n},(_,i)=>(i%grid.width>=grid.width/2?ICE_DENSITY*.5*mw.land[i]:0));mw.surfaceKgM2.set(ice);mw.seedLandIce(ice);
    const thermal=new ThermalModel(DEFAULT_PLANET,DEFAULT_ORBIT,{...DEFAULT_THERMAL,landHeatCapacity:1e8},mw.land,0,grid,{temperatureK:meltTemperature,radiationScale:field(1),absorbedWm2:zero});
    const env=new EnvironmentModel(thermal,mw,{...DEFAULT_ENVIRONMENT,glaciers:true});
    mw.attachRouting(terrainRoutingNetwork(mesh,elevation,grid,mw.radiusM,DEFAULT_PLANET.reliefM,r.quad_elements));
    const routingView=()=>terrainWaterView({water:mw,terrainSource:{mesh,elevation},model:thermal} as ThermalRuntime);
    const meltInitial=await frame('melt','Initial ice diagnostic: pale = 0.5 m ice upstream',{...view,surface:iceTexture(mw,false,.5),terrainWater:routingView()});
    thermal.temperatureK.fill(277);const beforeHeat=env.enthalpy(),beforeMass=mw.diagnostics().totalMm,beforeIce=mw.diagnostics().landIceMm,dt=21600;
    env.phase(dt);for(let step=0;step<100;step++)mw.routeSurface(dt);
    thermal.steps++; // Invalidate the cached view for the prescribed fixture state.
    await frame('melt','Fusion heat + 25 days routing: melted water enters terrain reservoirs',{...view,surface:iceTexture(mw),terrainWater:routingView()});
    for(let step=100;step<10000;step++)mw.routeSurface(dt);
    thermal.steps++;
    const meltFinal=await frame('melt','After 2,500 physical days routing: stored water reaches lower basin',{...view,surface:iceTexture(mw),terrainWater:routingView()});
    const volume=mw.routing!.volumeM3,totalVolume=volume.reduce((a,b)=>a+b,0),sourceMeanBedM=ice.reduce((sum,v,i)=>sum+v*mw.heightM[i],0)/ice.reduce((a,b)=>a+b,0);
    const melt={routingDays:10000*dt/86400,initialIceMm:beforeIce,finalIceMm:mw.diagnostics().landIceMm,surfaceMm:mw.diagnostics().surfaceMm,resolvedSurfaceMm:totalVolume*1000/mw.cellAreaM2/n,sourceMeanBedM,finalMeanBedM:volume.reduce((sum,v,i)=>sum+v*mw.routing!.network.bedM[i],0)/totalVolume,waterResidualMm:mw.diagnostics().totalMm-beforeMass,enthalpyResidualJm2:env.enthalpy()-beforeHeat,fusionEnergyJm2:(beforeIce-mw.diagnostics().landIceMm)*FUSION_J_KG,maxDepthM:Math.max(...volume.map((v,i)=>v/mw.routing!.network.areaM2[i]))};
    check(melt.finalIceMm===0&&melt.surfaceMm>0&&melt.maxDepthM>0,'Finite melt did not reach terrain reservoirs');check(Math.abs(melt.waterResidualMm)<1e-7&&Math.abs(melt.enthalpyResidualJm2)<1e-4,'Melt budgets do not close');check(meltInitial.some((v,i)=>v!==meltFinal[i]),'Melt did not change actual renderer pixels');
    check(Math.abs(melt.resolvedSurfaceMm-melt.surfaceMm)<1e-7&&melt.finalMeanBedM<melt.sourceMeanBedM,'Melt did not resolve into lower authored terrain');
    check(gl.getError()===gl.NO_ERROR,'WebGL error');output.textContent=JSON.stringify({status:'PASS',flow,poleRanges,gpuPoles,melt},null,2);
}catch(error){output.textContent=JSON.stringify({status:'FAIL',error:String(error)},null,2);}
