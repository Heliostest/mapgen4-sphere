import config,{HIGH_DETAIL_SPACING} from '../../../config.js';
import {makeMesh} from '../../../mesh.ts';
import Renderer from '../../../render.ts';
import {decodeTerrainDocument,meshIdentity,type TerrainDocument} from '../../../terrain-document.ts';
import {prepareTerrain} from '../../../terrain-preparation.ts';
import {defaultTerrainParameters} from '../../../terrain-parameters.ts';
import {makePlanetView} from '../../../planet-render.ts';
import {MIN_ZOOM,MAX_ZOOM} from '../../../sphere-view.ts';
import {decodeDisplayText,displayCell,packDisplayLayer,DISPLAY_COUNT,DISPLAY_WIDTH,DISPLAY_HEIGHT,type DisplayDocument} from './display-contract.ts';

const element=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=element<HTMLCanvasElement>('mapgen4'),month=element<HTMLSelectElement>('month'),level=element<HTMLSelectElement>('level'),layer=element<HTMLSelectElement>('layer');
const play=element<HTMLButtonElement>('play'),previous=element<HTMLButtonElement>('previous'),next=element<HTMLButtonElement>('next'),status=element('status'),loading=element('loading');
let data:DisplayDocument,terrain:TerrainDocument,render:Renderer;
let frameIndex=0,levelIndex=7,playing=false,timer:ReturnType<typeof setInterval>|undefined,probeCell:number|null=null;
let activePacked:ReturnType<typeof packDisplayLayer>|null=null;
const packedCache=new Map<string,ReturnType<typeof packDisplayLayer>>();

// This singleton belongs to the separate replay bundle/document only.
config.spacing=HIGH_DETAIL_SPACING;
Object.assign(config,defaultTerrainParameters());

Object.defineProperty(window,'speedyWeatherReplay',{value:Object.freeze({
    get ready(){return Boolean(render&&data&&terrain);},get playing(){return playing;},
    get frameIndex(){return frameIndex;},get levelIndex(){return levelIndex;},get layer(){return layer.value;},
    get month(){return data?.frames[frameIndex].month;},get sigma(){return data?.sigmaFull[levelIndex];},
    get orientation(){const p=config.render as Record<string,number>;return Object.freeze({x:p.x,y:p.y,zoom:p.zoom});},
    get temperatureSaturated(){return activePacked?.temperatureSaturated??0;},
    get presentedTimeS(){return render?.presentedPlanetTimeS;},get probeCell(){return probeCell;},
})});

async function fetchText(url:string,label:string):Promise<string> {
    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)throw new Error(`${label}读取失败（${response.status}）`);
    return response.text();
}

function pause():void {
    if(timer!==undefined)clearInterval(timer);timer=undefined;playing=false;
    play.textContent='播放回放';play.setAttribute('aria-pressed','false');
}

function present():void {
    const frame=data.frames[frameIndex],key=`${frameIndex}:${levelIndex}`;
    let packed=packedCache.get(key);
    if(!packed){packed=packDisplayLayer(frame.layers[levelIndex]);packedCache.set(key,packed);}activePacked=packed;
    // timeS controls the display sunlight only. It never feeds a solver or a formal clock.
    const view=makePlanetView(terrain.settings.planet,terrain.settings.orbit,frame.timeS,layer.value as 'wind'|'temperature','surface');
    view.thermal={...packed,timeS:frame.timeS};
    render.updatePlanet(view);render.updateView(config.render);
    month.value=String(frameIndex);level.value=String(levelIndex);
    element('frame-heading').textContent=frame.label;
    element('level-heading').textContent=`第 ${levelIndex+1} 层 · σ ${data.sigmaFull[levelIndex].toFixed(3)}`;
    status.textContent=`${frame.label} · ${frame.month} / 12${playing?' · 正在回放':' · 已暂停'}`;
    previous.disabled=frameIndex===0;next.disabled=frameIndex===11;
    element('month-track').replaceChildren(...data.frames.map((_,i)=>{
        const bar=document.createElement('span');bar.className=i===frameIndex?'active':'';return bar;
    }));
    const legend=element('legend');legend.replaceChildren();
    const description=document.createElement('div'),bar=document.createElement('div'),ticks=document.createElement('div'),note=document.createElement('p');
    const wind=layer.value==='wind';
    description.textContent=wind?'箭头指向空气流动方向':'所选大气层的月平均气温';
    bar.className=`legend-bar ${wind?'wind':'temperature'}`;ticks.className=`legend-ticks ${wind?'wind':'temperature'}`;
    for(const text of wind?['0','15','30 m/s']:['−80','0','+60 °C']){const tick=document.createElement('span');tick.textContent=text;ticks.append(tick);}
    note.textContent=wind?'风速超过 30 m/s 时颜色饱和，箭头仍按实际风向显示。':'低于 −80 °C 或高于 +60 °C 时颜色饱和。';
    legend.append(description,bar,ticks,note);
    if(!wind&&packed.temperatureSaturated){const warning=document.createElement('p');warning.className='saturation';warning.textContent=`本层 ${packed.temperatureSaturated} / ${DISPLAY_COUNT} 个格点超出色标；查看格点可见实际数值。`;legend.append(warning);}
    showProbe();
}

function showProbe():void {
    if(probeCell===null)return;
    const frame=data.frames[frameIndex],air=frame.layers[levelIndex],surface=frame.surface,k=probeCell;
    const lon=-180+(k%DISPLAY_WIDTH+.5)*360/DISPLAY_WIDTH,lat=Math.asin(1-2*(Math.floor(k/DISPLAY_WIDTH)+.5)/DISPLAY_HEIGHT)*180/Math.PI;
    element('probe-location').textContent=`${Math.abs(lat).toFixed(2)}°${lat>=0?'N':'S'} · ${Math.abs(lon).toFixed(2)}°${lon>=0?'E':'W'} · ${frame.month} 月 · 第 ${levelIndex+1} 层`;
    element('probe-fields').hidden=false;element('probe-note').hidden=false;
    element('probe-temperature').textContent=`${(air.temperatureK[k]-273.15).toFixed(2)} °C`;
    element('probe-temperature').title=`${air.temperatureK[k]} K`;
    element('probe-speed').textContent=`${Math.hypot(air.windEastMps[k],air.windNorthMps[k]).toFixed(3)} m/s`;
    element('probe-east').textContent=`${air.windEastMps[k].toFixed(3)} m/s`;
    element('probe-north').textContent=`${air.windNorthMps[k].toFixed(3)} m/s`;
    element('probe-pressure').textContent=`${(data.sigmaFull[levelIndex]*surface.pressurePa[k]/100).toFixed(2)} hPa`;
    element('probe-surface-pressure').textContent=`${(surface.pressurePa[k]/100).toFixed(2)} hPa`;
    element('probe-ice').textContent=`${(100*surface.seaIceConcentration[k]).toFixed(2)} %`;
    element('probe-rain').textContent=`${surface.rainMmDay[k].toFixed(3)} mm/d`;
}

function installReadOnlyNavigation():void {
    const p=config.render as Record<string,number>;
    let pointer=-1,startX=0,startY=0,lastX=0,lastY=0,moved=false;
    const redraw=()=>render.updateView(p);
    canvas.addEventListener('pointerdown',event=>{
        if(pointer!==-1||event.button!==0)return;
        pointer=event.pointerId;startX=lastX=event.clientX;startY=lastY=event.clientY;moved=false;
        canvas.setPointerCapture(pointer);canvas.focus({preventScroll:true});event.preventDefault();
    });
    canvas.addEventListener('pointermove',event=>{
        if(event.pointerId!==pointer)return;
        if(!moved&&Math.hypot(event.clientX-startX,event.clientY-startY)<4)return;
        moved=true;const bounds=canvas.getBoundingClientRect();
        p.x=((p.x-(event.clientX-lastX)*1000/bounds.width)%1000+1000)%1000;
        p.y=Math.max(0,Math.min(1000,p.y-(event.clientY-lastY)*1000/bounds.height));
        lastX=event.clientX;lastY=event.clientY;redraw();
    });
    canvas.addEventListener('pointerup',event=>{
        if(event.pointerId!==pointer)return;
        if(!moved){const bounds=canvas.getBoundingClientRect(),hit=render.sampleTerrain([(event.clientX-bounds.left)/bounds.width,(event.clientY-bounds.top)/bounds.height]);
            if(hit){probeCell=displayCell(...hit.uv);showProbe();}}
        if(canvas.hasPointerCapture(pointer))canvas.releasePointerCapture(pointer);pointer=-1;
    });
    for(const name of ['pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>{pointer=-1;});
    canvas.addEventListener('wheel',event=>{event.preventDefault();p.zoom=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,p.zoom*Math.exp(-event.deltaY*.001)));redraw();},{passive:false});
    canvas.addEventListener('keydown',event=>{
        let handled=true;
        if(event.key==='ArrowLeft')p.x=(p.x+10)%1000;
        else if(event.key==='ArrowRight')p.x=(p.x+990)%1000;
        else if(event.key==='ArrowUp')p.y=Math.max(0,p.y-10);
        else if(event.key==='ArrowDown')p.y=Math.min(1000,p.y+10);
        else if(event.key==='+'||event.key==='=')p.zoom=Math.min(MAX_ZOOM,p.zoom*1.1);
        else if(event.key==='-')p.zoom=Math.max(MIN_ZOOM,p.zoom/1.1);
        else handled=false;
        if(handled){event.preventDefault();redraw();}
    });
}

async function main():Promise<void> {
    const [terrainText,displayText,{mesh,t_peaks}]=await Promise.all([
        fetchText('scenes/earth-land-sea/earth-simulation.json','地理底图'),
        fetchText('build/earth-speedyweather/display.json','月平均数据'),makeMesh(config),
    ]);
    data=decodeDisplayText(displayText);
    // decodeSimulationDocument constructs a ThermalRuntime for validation.
    // Decode the identical terrain member directly so no old physics is instantiated.
    const geography=JSON.parse(terrainText);
    if(geography?.format!=='mapgen4-sphere-simulation'||geography?.version!==1)throw new Error('地理底图存档格式不符');
    terrain=decodeTerrainDocument(JSON.stringify(geography.terrain),meshIdentity(mesh,config),128);
    Object.assign(config,terrain.parameters);
    loading.textContent='正在恢复地理底图…';
    const prepared=await prepareTerrain(mesh,t_peaks,config,terrain);
    render=new Renderer(mesh);
    render.quad_elements=new Int32Array(prepared.quad_elements_buffer);
    render.a_quad_em=new Float32Array(prepared.a_quad_em_buffer);
    render.a_river_xyww=new Float32Array(prepared.a_river_xyww_buffer);
    render.numRiverTriangles=prepared.numRiverTriangles;
    render.physicalElevation=new Float32Array(prepared.terrain_elevation_buffer);
    render.baseTriangleElevation=new Float32Array(prepared.base_triangle_elevation_buffer);
    render.updateMap();
    month.replaceChildren(...data.frames.map((frame,index)=>new Option(frame.label,String(index))));
    level.replaceChildren(...data.sigmaFull.map((sigma,index)=>new Option(`第 ${index+1} 层 · σ = ${sigma.toFixed(3)}${index===0?' · 顶层':index===7?' · 最接近地表':''}`,String(index))));
    for(const control of [month,level,layer,play,previous,next])control.disabled=false;
    month.addEventListener('change',()=>{pause();frameIndex=Number(month.value);present();});
    level.addEventListener('change',()=>{levelIndex=Number(level.value);present();});
    layer.addEventListener('change',present);
    previous.addEventListener('click',()=>{pause();frameIndex=Math.max(0,frameIndex-1);present();});
    next.addEventListener('click',()=>{pause();frameIndex=Math.min(11,frameIndex+1);present();});
    play.addEventListener('click',()=>{
        if(playing){pause();present();return;}
        if(frameIndex===11)frameIndex=0;
        playing=true;play.textContent='暂停回放';play.setAttribute('aria-pressed','true');present();
        timer=setInterval(()=>{frameIndex++;if(frameIndex>=11){frameIndex=11;pause();}present();},1500);
    });
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing){pause();present();}});
    installReadOnlyNavigation();loading.hidden=true;present();
}

main().catch(error=>{
    pause();status.textContent='回放尚未就绪';
    loading.hidden=false;loading.classList.add('error');loading.setAttribute('role','alert');
    loading.textContent=`无法打开月平均回放。${error instanceof Error?error.message:String(error)}。请确认本次实际积分结果已生成，再刷新页面。`;
    console.error('SpeedyWeather replay load failed',error);
});
