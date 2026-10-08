// SPDX-License-Identifier: Apache-2.0
export class PaintGesture {
    active:number|null=null;
    private touches=new Set<number>();
    private pinching=false;
    begin(id:number,type:string,button:number,enabled:boolean){
        if(type==='touch'){
            this.touches.add(id);
            if(this.touches.size>1){this.pinching=true;this.active=null;}
        }
        if(this.pinching || !enabled || button!==0)return false;
        this.active=id;return true;
    }
    end(id:number,type:string){
        if(type==='touch'){this.touches.delete(id);if(!this.touches.size)this.pinching=false;}
        if(this.active===id)this.active=null;
    }
    cancel(){this.active=null;this.touches.clear();this.pinching=false;}
}
export function onPageExit(target:EventTarget,cleanup:()=>void){
    target.addEventListener('pagehide',event=>{if(!(event as PageTransitionEvent).persisted)cleanup();});
}
