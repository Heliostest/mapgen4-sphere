import Painting from './painting.ts';

export function installNavigation(param: any, redraw: () => void) {
    const canvas=document.getElementById('mapgen4') as HTMLCanvasElement;
    const button=document.getElementById('button-navigate');
    let rotating=false, rotateMode=false, pointer=-1, x=0, y=0;
    Painting.navigating=()=>rotateMode || rotating;
    const sync=(name: string,value: number)=> {
        param[name]=value;
        (document.querySelector(`#slider-${name} input`) as HTMLInputElement).value=String(value);
    };
    button.addEventListener('click',()=> {
        rotateMode=!rotateMode;
        button.textContent=rotateMode ? 'Drag: Rotate' : 'Drag: Paint';
        button.setAttribute('aria-pressed',String(rotateMode));
        canvas.style.cursor=rotateMode ? 'grab' : 'crosshair';
    });
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('pointerdown',e=> {
        if (rotating || (!rotateMode && e.button!==2 && !e.altKey)) return;
        rotating=true; pointer=e.pointerId; x=e.clientX; y=e.clientY;
        canvas.setPointerCapture(pointer);
        canvas.style.cursor='grabbing';
        e.preventDefault();
    });
    canvas.addEventListener('pointermove',e=> {
        if (!rotating || e.pointerId!==pointer) return;
        const bounds=canvas.getBoundingClientRect();
        sync('x',((param.x-(e.clientX-x)*1000/bounds.width)%1000+1000)%1000);
        sync('y',Math.max(0,Math.min(1000,param.y-(e.clientY-y)*1000/bounds.height)));
        x=e.clientX; y=e.clientY; redraw();
    });
    const end=(e: PointerEvent)=> {
        if (e.pointerId!==pointer) return;
        rotating=false; pointer=-1;
        canvas.style.cursor=rotateMode ? 'grab' : 'crosshair';
    };
    canvas.addEventListener('pointerup',end);
    canvas.addEventListener('pointercancel',end);
    canvas.addEventListener('lostpointercapture',end);
    canvas.addEventListener('wheel',e=> {
        e.preventDefault();
        sync('zoom',Math.max(.1,Math.min(2,param.zoom*Math.exp(-e.deltaY*.001))));
        redraw();
    },{passive:false});
}
