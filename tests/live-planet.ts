import {installPlanetControls} from '../planet-controls.ts';
import {makeSphereMesh} from '../sphere-mesh.ts';
import {DEFAULT_PLANET} from '../planet.ts';
import {DEFAULT_ORBIT} from '../astronomy.ts';
import type {PlanetView} from '../planet-render.ts';

let now=0,ready=false,frame:FrameRequestCallback,presented:number|null=null,view:PlanetView;
Object.defineProperty(performance,'now',{value:()=>now});
Object.defineProperty(document,'hidden',{configurable:true,value:false});
window.requestAnimationFrame=callback=>{frame=callback;return 1;};
const checks:string[]=[],failures:string[]=[];
function check(condition:boolean,message:string){checks.push(message);if(!condition)failures.push(message);}
function advance(ms:number){presented=view.timeS;now+=ms;frame(now);}
try {
    const {mesh}=makeSphereMesh(35,45,12345);
    const elevation=Float32Array.from({length:mesh.numRegions+mesh.numTriangles},(_,i)=>i<mesh.numRegions?(mesh.xyz_r[3*i+1]>.1?.15:-.2):.05);
    const terrain={directions:mesh.xyz_r,elevation,mesh};
    const controls=installPlanetControls({container:document.querySelector('#controls')!,canvas:document.querySelector('#canvas')!,
        onView:v=>view=v,sampleTerrain:()=>null,canInspect:()=>true,presentedTimeS:()=>presented,renderParams:()=>({}),
        terrain:()=>ready?terrain:null,terrainReady:()=>ready});
    const play=document.querySelector<HTMLButtonElement>('#planet-play')!;
    advance(5000);check(view.timeS===0&&play.textContent==='Play','Startup waits for accepted terrain');
    ready=true;controls.terrainChanged();
    const initial=controls.simulation();
    check(initial.runtime.enabled&&initial.runtime.waterEnabled&&initial.view.weather,'Thermal, water and cloud cover start enabled');
    check(['vegetation','iceAlbedo','terrainWater','glaciers','dynamicCirculation'].every(k=>initial.runtime.environmentConfig[k]===true),'All coupled environment systems start enabled');
    check(view.layer==='surface'&&controls.settings().camera==='space'&&view.model!==null,'Startup shows natural terrain from space');
    check(play.textContent==='Pause','Startup plays automatically after terrain is ready');
    check(!!view.surface&&!!view.weather&&!!view.terrainWater,'Startup produces surface, cloud and terrain-water render data');
    const pose=Array.from(view.model??[]);advance(5000);
    const evolved=controls.simulation();
    check(view.timeS>0&&pose.some((v,i)=>v!==view.model?.[i]),'Playback rotates the visible planet');
    check((evolved.runtime.state?.thermal.steps??0)>0&&!!evolved.runtime.state?.water?.routing&&!!evolved.runtime.state?.water?.glacier&&!!evolved.runtime.state?.circulation,'Playback advances real coupled state');
    presented=view.timeS;controls.pause();const paused=JSON.stringify(controls.simulation());advance(5000);
    check(play.textContent==='Play'&&JSON.stringify(controls.simulation())===paused,'Pause freezes coupled history');
    controls.terrainChanged();advance(1000);
    check(play.textContent==='Play','Later terrain changes cannot restart a paused world');
    controls.restoreSettings({planet:{...DEFAULT_PLANET},orbit:{...DEFAULT_ORBIT},timeS:1234,camera:'surface'});
    controls.terrainChanged();advance(1000);
    check(!controls.simulation().runtime.enabled&&!controls.simulation().view.weather&&view.timeS===1234&&play.textContent==='Play','Restored terrain settings remain paused with their own modes');
    document.querySelector<HTMLButtonElement>('#planet-live')?.click();advance(1000);
    check(play.textContent==='Pause'&&controls.settings().camera==='space'&&!!controls.simulation().runtime.state?.water?.routing,'Live planet button enables and resumes all systems');
    presented=view.timeS;Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));
    const hiddenTime=view.timeS;advance(5000);
    Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));advance(1000);
    check(play.textContent==='Play'&&view.timeS===hiddenTime,'Hiding an already running planet pauses without surprise restart');
    document.querySelector('pre')!.textContent=JSON.stringify({status:failures.length?'FAIL':'PASS',checks,failures},null,2);
}catch(error){document.querySelector('pre')!.textContent=JSON.stringify({status:'FAIL',error:String(error)},null,2);}
