// SPDX-License-Identifier: Apache-2.0
import './style.css';
import {makeSphere,SPHERE_LEVEL} from './mesh.ts';
import {defaultParams} from './terrain.ts';
import {PlanetRenderer} from './renderer.ts';
import type {Stroke,WorkerRequest,WorkerResponse} from './protocol.ts';
import {PaintGesture,onPageExit} from './interaction.ts';

const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const input=(id:string)=>el<HTMLInputElement>(id);
const status=el('status'),canvas=el<HTMLCanvasElement>('planet');

function start(){
    const mesh=makeSphere(SPHERE_LEVEL),view=new PlanetRenderer(canvas,mesh),worker=new Worker('build/planet-worker.js');
    const params={...defaultParams};
    let busy=false,dirty=true,reset=false,requestId=0,failed=false,ready=false;
    let strokes:Stroke[]=[],tool='rotate',lastPaint=0;
    const gesture=new PaintGesture();
    let currentPoint:number[]|null=null;
    const radius=()=>input('brush').valueAsNumber*Math.PI/180;
    const notify=(message:string,error=false)=>{status.textContent=message;status.hidden=!message;status.className=error?'error':ready?'ready':'';};
    const fail=(message:string)=>{failed=true;busy=false;worker.terminate();notify(message,true);};
    function flush(){
        if(busy || !dirty || failed)return;
        const request:WorkerRequest={id:++requestId,params:{...params},reset,strokes};
        strokes=[];reset=false;dirty=false;busy=true;
        notify(ready?'正在更新地形…':'正在生成球面地形…');
        worker.postMessage(request);
    }
    function regenerate(clear=false){
        dirty=true;if(clear){reset=true;strokes=[];}flush();
    }
    worker.onmessage=({data}:MessageEvent<WorkerResponse>)=>{
        if(data.id!==requestId)return;
        busy=false;
        if(data.error || !data.result){fail(`地形生成失败：${data.error??'未收到地图数据'}。请刷新重试。`);return;}
        view.update(data.result);ready=true;
        const ocean=data.result.elevation.filter(v=>v<=0).length/data.result.elevation.length*100;
        el('ocean-stat').textContent=`${ocean.toFixed(1)}%`;el('land-stat').textContent=`${(100-ocean).toFixed(1)}%`;
        el('timing').textContent=`${Math.round(data.elapsed)} ms`;
        el<HTMLButtonElement>('download').disabled=false;
        canvas.dataset.revision=String(data.id);
        notify('');flush();
    };
    worker.onerror=event=>{event.preventDefault();fail('地形计算未能启动。请检查构建是否完成，并通过本地 HTTP 服务打开页面。');};
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fail('图形连接已中断，请刷新页面恢复地图。');});

    function selectTool(name:string){
        tool=name;gesture.cancel();view.setTool(tool!=='rotate');
        for(const button of document.querySelectorAll<HTMLButtonElement>('[data-tool]')){
            const active=button.dataset.tool===tool;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
        }
        el('tool-hint').textContent=tool==='rotate'?'拖动旋转 · 滚轮缩放 · 选择笔刷绘制地形':'按住绘制 · 右键拖动旋转 · 滚轮缩放';
    }
    for(const button of document.querySelectorAll<HTMLButtonElement>('[data-tool]'))button.addEventListener('click',()=>selectTool(button.dataset.tool!));
    document.addEventListener('keydown',event=>{
        if((event.target as HTMLElement).matches('input,textarea,select') || event.ctrlKey || event.metaKey || event.altKey)return;
        const index=Number(event.key)-1;if(index>=0 && index<4)selectTool(['rotate','ocean','land','mountain'][index]);
    });
    function paint(time:number){
        if(gesture.active===null || !currentPoint || !ready || failed)return;
        const elapsed=Math.min(80,Math.max(16,time-lastPaint));lastPaint=time;
        const target=tool==='ocean'?-0.45:tool==='land'?0.12:0.85;
        strokes.push({center:currentPoint,radius:radius(),target,strength:1-Math.exp(-elapsed/150)});
        dirty=true;flush();
    }
    // Time-based strokes work even while holding the pointer still.
    const paintTimer=setInterval(()=>paint(performance.now()),40);
    canvas.addEventListener('pointerdown',event=>{
        if(!gesture.begin(event.pointerId,event.pointerType,event.button,tool!=='rotate' && ready))return;
        canvas.setPointerCapture(event.pointerId);currentPoint=view.pick(event.clientX,event.clientY);lastPaint=performance.now()-50;paint(performance.now());
    });
    canvas.addEventListener('pointermove',event=>{
        if(gesture.active!==null && event.pointerId!==gesture.active)return;
        currentPoint=view.pick(event.clientX,event.clientY);view.showBrush(tool==='rotate'?null:currentPoint,radius());
    });
    const end=(event:PointerEvent)=>{gesture.end(event.pointerId,event.pointerType);if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);};
    canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
    canvas.addEventListener('pointerleave',()=>{if(gesture.active===null)view.showBrush(null,0);});
    canvas.addEventListener('contextmenu',event=>event.preventDefault());
    window.addEventListener('blur',()=>gesture.cancel());
    onPageExit(window,()=>{clearInterval(paintTimer);worker.terminate();});

    input('seed').addEventListener('change',()=>{
        params.seed=Number.isFinite(input('seed').valueAsNumber)?Math.max(1,Math.min(2147483647,Math.trunc(input('seed').valueAsNumber))):187;
        input('seed').value=String(params.seed);el('world-seed').textContent=String(params.seed);regenerate(true);
    });
    el('new-world').addEventListener('click',()=>{input('seed').value=String(crypto.getRandomValues(new Uint32Array(1))[0]%2147483646+1);input('seed').dispatchEvent(new Event('change'));});
    input('sea-level').addEventListener('input',()=>{params.seaLevel=input('sea-level').valueAsNumber/100;el('sea-value').textContent=`${input('sea-level').value}%`;regenerate();});
    input('rainfall').addEventListener('input',()=>{params.rainfall=input('rainfall').valueAsNumber;el('rain-value').textContent=params.rainfall.toFixed(1);regenerate();});
    input('relief').addEventListener('input',()=>{el('relief-value').textContent=`${input('relief').value}%`;view.setRelief(input('relief').valueAsNumber/100);});
    input('brush').addEventListener('input',()=>{el('brush-value').textContent=`${input('brush').value}°`;if(tool!=='rotate')view.showBrush(currentPoint,radius());});
    input('show-rivers').addEventListener('change',()=>view.setRivers(input('show-rivers').checked));
    input('show-grid').addEventListener('change',()=>view.setGrid(input('show-grid').checked));
    input('auto-rotate').addEventListener('change',()=>view.setRotation(input('auto-rotate').checked));
    el('reset-terrain').addEventListener('click',()=>{gesture.cancel();regenerate(true);});
    el('reset-view').addEventListener('click',()=>view.resetView());
    el('download').addEventListener('click',()=>view.exportImage(params.seed));
    selectTool('rotate');flush();
}
try{start();}catch(error){status.className='error';status.textContent=`无法显示球面地图。请使用支持 WebGL2 的浏览器并开启硬件加速。${error instanceof Error?error.message:''}`;}
