import {installPlanetControls} from '../planet-controls.ts';
import type {ThermalTexture} from '../thermal-runtime.ts';

// Use the actual DOM and button handler, but schedule frames explicitly to
// reproduce a view queued by controls before the renderer has presented it.
let now=0,frame:FrameRequestCallback|undefined,presented:number|null=null,queued=0;
let field:ThermalTexture|null=null;
Object.defineProperty(performance,'now',{value:()=>now});
window.requestAnimationFrame=callback=>{frame=callback;return 1;};
const failures:string[]=[];
let checks=0;
function check(condition:boolean,message:string) {checks++;if(!condition) failures.push(message);}
function advance(time:number) {now=time;frame!(time);}
try {
    const controls=installPlanetControls({
        container:document.querySelector('#controls')!,canvas:document.querySelector('#canvas')!,
        onView:view=>{queued=view.timeS;field=view.thermal??null;},sampleTerrain:()=>null,canInspect:()=>true,
        presentedTimeS:()=>presented,renderParams:()=>({}),
        terrain:()=>({directions:new Float32Array([0,0,1]),elevation:new Float32Array([1])}),
    });
    const play=document.querySelector<HTMLButtonElement>('#planet-play')!;
    play.click();advance(1000);presented=queued;
    advance(1000+1000/60);
    check(queued>presented,'The reproduction must queue an unpresented frame');
    play.click();
    check(queued===presented,`Pause must freeze the visible time: presented ${presented}, paused ${queued}`);
    check(play.textContent==='Play','Pause must update the button');
    play.click();advance(now+1000);
    check(Math.abs(queued-(presented+3600))<1e-8,'Resume must advance from the frozen visible time');
    presented=queued;play.click();controls.terrainChanged();
    const layer=document.querySelector<HTMLSelectElement>('#planet-layer')!;
    layer.value='temperature';layer.dispatchEvent(new Event('change'));
    play.click();advance(now+1000);presented=queued;
    const visibleField=field!,visibleBytes=Array.from(visibleField.pixels);
    advance(now+1000);check(field!.timeS>visibleField.timeS,'Thermal reproduction must queue a later field');
    const queuedField=field!.timeS;
    const speed=document.querySelector<HTMLSelectElement>('#planet-speed')!;
    now+=1000;speed.value='864000';speed.dispatchEvent(new Event('change'));
    check(field!.timeS>queuedField,'Speed change must queue another update before either field is presented');
    play.click();
    check(queued===presented && field!.timeS===visibleField.timeS,'Pause must restore matching thermal and astronomical times');
    check(JSON.stringify(Array.from(field!.pixels))===JSON.stringify(visibleBytes),'Pause must restore the visible temperature field');
    play.click();advance(now+1000);
    check(field!.timeS>visibleField.timeS,'Thermal model must resume after presented-frame rollback');
    document.querySelector('pre')!.textContent=JSON.stringify({status:failures.length?'FAIL':'PASS',checks,failures},null,2);
} catch(error) {
    document.querySelector('pre')!.textContent=JSON.stringify({status:'FAIL',error:String(error)});
}
