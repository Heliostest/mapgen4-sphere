import Renderer from '../render.ts';
import {makeSphereMesh} from '../sphere-mesh.ts';
import {ThermalRuntime} from '../thermal-runtime.ts';
import {sampleTerrainGrid,makeThermalGrid} from '../thermal.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';
import {makePlanetView} from '../planet-render.ts';
import {defaultTerrainParameters} from '../terrain-parameters.ts';
import {terrainWaterView} from '../terrain-water-view.ts';
import {channelNetwork,riverChannelField} from '../river-channels.ts';
import Geometry from '../geometry.ts';

const output=document.querySelector('pre')!;
const checks:{name:string;pass:boolean;detail:unknown}[]=[];
const check=(name:string,pass:boolean,detail:unknown)=>checks.push({name,pass,detail});
try {
    const {mesh}=makeSphereMesh(240,35,12345),r=new Renderer(mesh),{gl}=r.webgl;
    const elevation=new Float32Array(mesh.numRegions+mesh.numTriangles);
    // Keep every source corner negative and every triangle confirmed inland.
    // A mixed sign triangle-center mask otherwise leaves marine-colored edge
    // strips, which would confound the dry-bed rendering acceptance.
    const height=(x:number,y:number,z:number)=>-.21+.065*(1-z)+.035*y*y+.012*x*y;
    for(let i=0;i<mesh.numRegions;i++)elevation[i]=height(mesh.xyz_r[3*i],mesh.xyz_r[3*i+1],mesh.xyz_r[3*i+2]);
    for(let i=0;i<mesh.numTriangles;i++)elevation[mesh.numRegions+i]=height(mesh.xyz_t[3*i],mesh.xyz_t[3*i+1],mesh.xyz_t[3*i+2]);
    const inlandLakeId=Int32Array.from({length:mesh.numTriangles},(_,t)=>+(elevation[mesh.numRegions+t]<0));
    r.physicalElevation=elevation;
    for(let i=0;i<elevation.length;i++){r.a_quad_em[2*i]=elevation[i];r.a_quad_em[2*i+1]=.5;}
    for(let s=0;s<mesh.numSolidSides;s++)r.quad_elements.set([mesh.r_begin_s(s),mesh.r_begin_s(mesh.s_opposite_s(s)),mesh.numRegions+mesh.t_inner_s(s)],3*s);
    r.updateMap();r.resizeCanvas();
    const rt=new ThermalRuntime(makeThermalGrid(24,12)),sample=sampleTerrainGrid(rt.grid,mesh.xyz_r,elevation);
    rt.enabled=rt.waterEnabled=true;rt.environmentConfig.terrainWater=true;
    rt.setTerrain(sample.landFraction,sample.landElevation,{mesh,directions:mesh.xyz_r,elevation,drainage:{basinId:new Int32Array(mesh.numTriangles),terminal:new Uint8Array(mesh.numTriangles),inlandLakeId}});
    rt.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);
    const w=rt.water!,route=w.routing!;
    // Remove illustrative climatic supply. The fixture edits finite stores only.
    rt.sampleSurface=()=>null;w.precipitationKgM2S.fill(0);w.meltKgM2S.fill(0);w.soilKgM2.fill(0);
    const params={...defaultTerrainParameters().render,ambient:1,flat:0,slope:0,outline_strength:0,outline_water:0,mountain_height:200};
    const surface={width:4,height:3,timeS:0,pixels:Uint8Array.from(Array.from({length:12},()=>[180,164,118,0]).flat())};
    const draw=async(renderParams=params)=>{
        const before=route.volumeM3.slice(),coarse=w.surfaceKgM2.slice(),ocean=w.oceanGlobalKgM2,view=terrainWaterView(rt,{minFlowM3S:0})!;
        r.updatePlanet({...makePlanetView(DEFAULT_PLANET,DEFAULT_ORBIT,0,'surface','surface'),surface,terrainWater:view});r.updateView(renderParams);
        await new Promise(requestAnimationFrame);
        const tex=r.fbo_drape.texture!,pixels=new Uint8Array(tex.width*tex.height*4);r.fbo_drape.viewport();
        gl.readPixels(0,0,tex.width,tex.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        check('渲染不会改写细粗网格与外洋库存',before.every((v,t)=>v===route.volumeM3[t])&&coarse.every((v,k)=>v===w.surfaceKgM2[k])&&ocean===w.oceanGlobalKgM2,{triangles:before.length});
        let blue=0;for(let p=0;p<pixels.length;p+=4)if(pixels[p+3]&&pixels[p+2]>pixels[p]&&pixels[p+1]>pixels[p])blue++;
        return {pixels,width:tex.width,height:tex.height,blue,riverTriangles:view.riverTriangles};
    };
    const appendFrame=(frame:Awaited<ReturnType<typeof draw>>,label:string)=>{
        const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption');canvas.width=canvas.height=640;
        const gpu=new OffscreenCanvas(frame.width,frame.height),image=new ImageData(frame.width,frame.height),stride=frame.width*4;
        for(let y=0;y<frame.height;y++)image.data.set(frame.pixels.subarray(y*stride,(y+1)*stride),(frame.height-y-1)*stride);
        gpu.getContext('2d')!.putImageData(image,0,0);canvas.getContext('2d')!.drawImage(gpu,0,0,640,640);
        caption.textContent=label;figure.append(canvas,caption);document.querySelector('.row')!.append(figure);
    };
    const figures:{label:string;blue:number;volumeM3:number;riverTriangles:number}[]=[];
    for(const [label,level] of [['零库存：负高程干床',null],['少量蓄水：湖岸在盆底',-2130],['更多蓄水：湖岸扩大',-1680],['排干：恢复干床',null]] as const) {
        w.surfaceKgM2.fill(0);const state=route.checkpoint();state.fluxM3S.fill(0);state.receiverSide.fill(-1);
        for(let t=0;t<mesh.numTriangles;t++) {
            state.volumeM3[t]=level===null?0:Math.max(0,level-route.network.bedM[t])*route.network.areaM2[t];
            const k=route.network.cell[t];if(k>=0)w.surfaceKgM2[k]+=state.volumeM3[t]*1000/w.cellAreaM2;
        }
        route.restore(state,w);rt.model!.steps++;
        const frame=await draw(),volumeM3=state.volumeM3.reduce((a,b)=>a+b,0);figures.push({label,blue:frame.blue,volumeM3,riverTriangles:frame.riverTriangles});
        appendFrame(frame,`${label}；蓝色像素 ${frame.blue.toLocaleString()}；受控库存 ${volumeM3.toExponential(3)} m³。`);
    }
    check('零库存与排干无蓝色湖水',figures[0].blue===0&&figures[3].blue===0,figures.map(f=>({label:f.label,blue:f.blue})));
    check('蓄水增加使实际 GPU 湖面扩大',figures[1].blue>1000&&figures[2].blue>figures[1].blue*1.5,figures.map(f=>({blue:f.blue,volumeM3:f.volumeM3})));
    check('显示门槛为 0 也不画零流量',figures.every(f=>f.riverTriangles===0),figures.map(f=>f.riverTriangles));
    check('负高程湖盆保留有限床与有效格子',route.network.bedM.some((h,t)=>inlandLakeId[t]>0&&h<0&&route.network.cell[t]>=0),{minimumBedM:Math.min(...route.network.bedM)});
    // Read the real half-float height pass; this fails while GPU flattens the
    // classified negative bed, even if its surface color already looks dry.
    r.fbo_depth.viewport();const depthTex=r.fbo_depth.texture!,format=gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT),type=gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
    const components=format===gl.RED?1:format===gl.RG?2:4,size=depthTex.width*depthTex.height*components;
    const raw=type===gl.FLOAT?new Float32Array(size):type===gl.HALF_FLOAT?new Uint16Array(size):new Uint8Array(size);
    gl.readPixels(0,0,depthTex.width,depthTex.height,format,type,raw);
    const half=(v:number)=>{const s=(v&32768)?-1:1,e=(v>>10)&31,f=v&1023;return s*(e===0?2**-14*f/1024:e===31?Infinity:2**(e-15)*(1+f/1024));};
    const depths=Float32Array.from({length:depthTex.width*depthTex.height},(_,i)=>type===gl.HALF_FLOAT?half(raw[i*components]):raw[i*components]);
    let negative=0,minDepth=0;for(const d of depths){if(d<-.005)negative++;minDepth=Math.min(minDepth,d);}
    check('实际 GPU 高程通道保留负床',negative>1000,{negativePixels:negative,minimumShaderElevation:minDepth,format,type});
    const a=await draw({...params,ambient:.2,slope:2,flat:2.5,overhead:.04,light_angle_deg:10}),b=await draw({...params,ambient:.2,slope:2,flat:2.5,overhead:.04,light_angle_deg:190});
    let litChanges=0;for(let i=0;i<depths.length;i++)if(depths[i]<-.005&&Math.abs(a.pixels[4*i]-b.pixels[4*i])>3)litChanges++;
    check('干负床坡面响应相反光照',litChanges>100,{changedNegativePixels:litChanges});
    appendFrame(a,'排干后的同一负床：光向 10°；实际 DEM 坡面光照。');
    appendFrame(b,'同一负床：光向 190°；反向光照改变坡面明暗。');
    const pickingError=(inland:boolean)=>{
        r.updatePicking(params.mountain_height,params.sphere_radius);let maximum=0;
        for(let v=0;v<elevation.length;v++) {
            const radius=Math.hypot(...r.pickPositions.subarray(3*v,3*v+3));
            const expected=params.sphere_radius+params.mountain_height*(inland?elevation[v]*DEFAULT_PLANET.oceanDepthM/DEFAULT_PLANET.reliefM:Math.max(0,elevation[v]));
            maximum=Math.max(maximum,Math.abs(radius-expected));
        }
        return maximum;
    };
    const inlandPickingError=pickingError(true);
    r.updatePlanet({...makePlanetView(DEFAULT_PLANET,DEFAULT_ORBIT,0,'surface','surface'),surface});
    const marinePickingError=pickingError(false);
    r.updatePlanet({...makePlanetView(DEFAULT_PLANET,DEFAULT_ORBIT,0,'surface','surface'),surface,terrainWater:terrainWaterView(rt,{minFlowM3S:0})});
    const restoredPickingError=pickingError(true);
    check('拾取负床与 GPU 半径一致，切换分类后重新构建',Math.max(inlandPickingError,marinePickingError,restoredPickingError)<1e-4,{inlandPickingError,marinePickingError,restoredPickingError});
    // Exercise both reference and measured-transfer overlays on the same
    // production upload buffer, with paused inventories unchanged.
    w.precipitationKgM2S.fill(.00002);w.soilKgM2.set(w.land.map(f=>f*w.config.soilCapacityKgM2));rt.model!.temperatureK.fill(290);
    const channels=channelNetwork(mesh,route.network);route.receiverSide.set(channels.receiverSide);route.fluxM3S.fill(1e6);rt.model!.steps++;
    const field=riverChannelField(rt),scratch=new Float32Array(mesh.numSolidTriangles*126),style={lg_min_flow:-Infinity,lg_river_width:Math.log(.07),max_width:.85,headwaters:true};
    const referenceTriangles=Geometry.setRiverGeometry({mesh,s_downslope_t:field.receiverSide,flow_s:field.sides},5.5,style,scratch);
    const physicalTriangles=Geometry.setRiverGeometry({mesh,s_downslope_t:route.receiverSide,flow_s:field.physicalSides},5.5,style,scratch);
    const both=await draw();const bufferBytes=(()=>{r.buffer_river_xyww.bind();return gl.getBufferParameter(gl.ARRAY_BUFFER,gl.BUFFER_SIZE);})();
    check('双图层实际 GPU 上传容量足够',referenceTriangles>0&&physicalTriangles>0&&both.riverTriangles===referenceTriangles+physicalTriangles&&both.riverTriangles*21*4<=bufferBytes,{referenceTriangles,physicalTriangles,riverTriangles:both.riverTriangles,uploadBytes:both.riverTriangles*21*4,bufferBytes});
    const error=gl.getError();check('WebGL 无错误',error===gl.NO_ERROR,{error});
    const pass=checks.every(c=>c.pass);
    document.querySelector('#result')!.textContent=`${pass?'通过 PASS':'失败 FAIL'}：${checks.filter(c=>c.pass).length}/${checks.length} 项验收；真实 GPU 负高程像素 ${negative.toLocaleString()}；反向照明改变 ${litChanges.toLocaleString()} 像素；参考 / 实时两图层 ${referenceTriangles} / ${physicalTriangles} 个三角形；WebGL 错误 ${error}。`;
    output.textContent=JSON.stringify({status:pass?'PASS':'FAIL',fixture:'controlled finite negative inland bed; no observed water levels or rainfall claim',figures,checks},null,2);
}catch(error){document.querySelector('#result')!.textContent=`失败 FAIL：${String(error)}`;output.textContent=JSON.stringify({status:'FAIL',error:String(error),checks},null,2);}
