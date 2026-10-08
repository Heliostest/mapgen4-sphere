import {installPlanetControls} from '../planet-controls.ts';
import type {ThermalTexture} from '../thermal-runtime.ts';
import type {GeomorphView} from '../geomorph-runtime.ts';

// Use the actual DOM and button handler, but schedule frames explicitly to
// reproduce a view queued by controls before the renderer has presented it.
let now=0,frame:FrameRequestCallback|undefined,presented:number|null=null,queued=0;
let field:ThermalTexture|null=null;
let water:ThermalTexture|null=null;
let geology:GeomorphView|null=null;
Object.defineProperty(performance,'now',{value:()=>now});
window.requestAnimationFrame=callback=>{frame=callback;return 1;};
const failures:string[]=[];
let checks=0;
function check(condition:boolean,message:string) {checks++;if(!condition) failures.push(message);}
function advance(time:number) {now=time;frame!(time);}
try {
    const controls=installPlanetControls({
        container:document.querySelector('#controls')!,canvas:document.querySelector('#canvas')!,
        onView:view=>{queued=view.timeS;field=view.thermal??null;water=view.water??null;geology=view.geomorph??null;},sampleTerrain:()=>null,canInspect:()=>true,
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
    presented=queued;play.click();layer.value='precipitation';layer.dispatchEvent(new Event('change'));
    play.click();advance(now+1000);presented=queued;
    const visibleWater=water!,waterBytes=Array.from(visibleWater.pixels),budget=document.querySelector<HTMLOutputElement>('#water-budget')!.value;
    advance(now+1000);now+=1000;speed.value='86400';speed.dispatchEvent(new Event('change'));
    check(water!.timeS>visibleWater.timeS,'Water reproduction must queue two later fields');
    play.click();
    check(water!.timeS===visibleWater.timeS&&field!.timeS===visibleWater.timeS,'Pause restores aligned water and thermal time');
    check(JSON.stringify(Array.from(water!.pixels))===JSON.stringify(waterBytes),'Pause restores all displayed water fields');
    check(document.querySelector<HTMLOutputElement>('#water-budget')!.value===budget,'Pause restores the displayed water budget');
    play.click();advance(now+1000);presented=queued;
    const hiddenWater=water!,hiddenBytes=Array.from(hiddenWater.pixels);advance(now+1000);
    Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));
    check(play.textContent==='Play'&&water!.timeS===hiddenWater.timeS,'Hidden tabs pause water at the visible time');
    check(JSON.stringify(Array.from(water!.pixels))===JSON.stringify(hiddenBytes),'Hidden-tab rollback restores water field contents');
    Object.defineProperty(document,'hidden',{configurable:true,value:false});play.click();advance(now+1000);presented=queued;
    const captureTime=water!.timeS;advance(now+1000);advance(now+1000);
    document.querySelector<HTMLButtonElement>('#geomorph-capture')!.click();
    check(geology!.texture.timeS===captureTime,'Geological capture uses the acknowledged water snapshot, not queued future fields');
    check(queued===presented&&play.textContent==='Play','Capture freezes the astronomical clock at its visible time');
    document.querySelector<HTMLButtonElement>('#geomorph-step')!.click();
    const geologicalAge=document.querySelector<HTMLOutputElement>('#geomorph-age')!.dataset.years;
    check(Number(geologicalAge)>0&&queued===presented,'Geological time advances independently of astronomy');
    play.click();advance(now+1000);presented=queued;play.click();
    check(document.querySelector<HTMLOutputElement>('#geomorph-age')!.dataset.years===geologicalAge,'Climate playback cannot advance geological time');
    document.querySelector<HTMLButtonElement>('#water-reset')!.click();
    check(geology===null,'Environmental resets clear obsolete geological preview');
    document.querySelector('pre')!.textContent=JSON.stringify({status:failures.length?'FAIL':'PASS',checks,failures},null,2);
} catch(error) {
    document.querySelector('pre')!.textContent=JSON.stringify({status:'FAIL',error:String(error)});
}
