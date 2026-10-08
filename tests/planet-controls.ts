import {installPlanetControls} from '../planet-controls.ts';

// Use the actual DOM and button handler, but schedule frames explicitly to
// reproduce a view queued by controls before the renderer has presented it.
let now=0,frame:FrameRequestCallback|undefined,presented:number|null=null,queued=0;
Object.defineProperty(performance,'now',{value:()=>now});
window.requestAnimationFrame=callback=>{frame=callback;return 1;};
const failures:string[]=[];
let checks=0;
function check(condition:boolean,message:string) {checks++;if(!condition) failures.push(message);}
function advance(time:number) {now=time;frame!(time);}
try {
    installPlanetControls({
        container:document.querySelector('#controls')!,canvas:document.querySelector('#canvas')!,
        onView:view=>{queued=view.timeS;},sampleTerrain:()=>null,canInspect:()=>true,
        presentedTimeS:()=>presented,renderParams:()=>({}),
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
    document.querySelector('pre')!.textContent=JSON.stringify({status:failures.length?'FAIL':'PASS',checks,failures},null,2);
} catch(error) {
    document.querySelector('pre')!.textContent=JSON.stringify({status:'FAIL',error:String(error)});
}
