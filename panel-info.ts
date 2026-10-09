/** Keep explanatory notes in the panel DOM, but display them in the top layer
 * so a narrow, scrolling sidebar cannot clip them. */
let nextId=0;
let active:{button:HTMLButtonElement;tip:HTMLElement;close:()=>void;position:()=>void}|null=null;
let listening=false;

export function installInfoNotes(root:HTMLElement) {
    if(!listening) {
        listening=true;
        document.addEventListener('keydown',event=>{
            if(event.key==='Escape'&&active){active.close();event.preventDefault();}
        });
        document.addEventListener('pointerdown',event=>{
            if(active&&!active.button.contains(event.target as Node)&&!active.tip.contains(event.target as Node))active.close();
        });
        document.addEventListener('scroll',event=>{
            if(active&&!active.tip.contains(event.target as Node)) {
                // Keyboard focus may scroll its button into view after focus.
                if(document.activeElement===active.button)active.position();else active.close();
            }
        },true);
        window.addEventListener('resize',()=>active?.close());
    }
    const groups=new Map<string,HTMLElement[]>();
    for(const note of root.querySelectorAll<HTMLElement>('[data-info-for]')) {
        const id=note.dataset.infoFor!;
        if(!groups.has(id))groups.set(id,[]);
        groups.get(id)!.push(note);note.removeAttribute('data-info-for');
    }
    for(const [id,notes] of groups) {
        const control=root.id===id?root:root.querySelector<HTMLElement>('#'+id)!;
        const anchor=control.matches('details')?control.querySelector<HTMLElement>('summary')!:
            control.matches('input,select,output')?control.closest<HTMLElement>('label')!:control;
        const title=notes[0].dataset.infoTitle??anchor.textContent!.trim();
        const button=document.createElement('button');button.type='button';button.className='planet-info';
        button.textContent='i';button.setAttribute('aria-label',`About ${title}`);
        const tip=document.createElement('div');tip.className='planet-tooltip';tip.id=`planet-info-${++nextId}`;
        tip.setAttribute('popover','manual');tip.setAttribute('role','tooltip');
        const heading=document.createElement('strong');heading.textContent=title;tip.append(heading,...notes);
        button.setAttribute('aria-describedby',tip.id);
        if(anchor.tagName==='SUMMARY') {
            // The summary remains rendered when its details is closed.
            anchor.append(button,tip);
            tip.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();});
        }
        else {
            const row=document.createElement('div');row.className='planet-info-row';anchor.before(row);row.append(anchor,button,tip);
        }
        let timer:ReturnType<typeof setTimeout>;
        const close=()=>{clearTimeout(timer);if(tip.matches(':popover-open'))tip.hidePopover();if(active?.button===button)active=null;};
        const position=()=>{
            const b=button.getBoundingClientRect(),t=tip.getBoundingClientRect(),gap=8,pad=12;
            const left=b.left-t.width-gap>=pad?b.left-t.width-gap:Math.min(b.left,window.innerWidth-t.width-pad);
            const top=b.left-t.width-gap>=pad?b.top:b.bottom+gap+t.height<=window.innerHeight-pad?b.bottom+gap:b.top-t.height-gap;
            tip.style.left=`${Math.max(pad,left)}px`;
            tip.style.top=`${Math.max(pad,Math.min(top,window.innerHeight-t.height-pad))}px`;
        };
        const show=()=>{
            clearTimeout(timer);if(active?.button===button)return;active?.close();
            tip.showPopover();active={button,tip,close,position};position();
        };
        const leave=()=>{clearTimeout(timer);timer=setTimeout(()=>{
            if(!button.matches(':hover,:focus')&&!tip.matches(':hover'))close();
        },120);};
        button.addEventListener('pointerenter',show);button.addEventListener('focus',show);
        button.addEventListener('pointerleave',leave);button.addEventListener('blur',leave);
        // Keep summary buttons from toggling the section; taps also reveal help.
        button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();show();});
        tip.addEventListener('pointerenter',()=>clearTimeout(timer));tip.addEventListener('pointerleave',leave);
    }
}
