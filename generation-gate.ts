/** One worker owns the transferable buffers; only the newest revision may publish. */
export class GenerationGate {
    desired=0;
    accepted=0;
    private running:number|null=null;
    get pending(){return this.desired!==this.accepted;}
    request(){return ++this.desired;}
    acceptPrepared(){this.accepted=++this.desired;}
    start():number|null {
        if(this.running!==null||!this.pending)return null;
        return this.running=this.desired;
    }
    complete(revision:number):boolean {
        if(revision!==this.running)throw new Error('Unexpected terrain reply');
        this.running=null;
        if(revision!==this.desired)return false;
        this.accepted=revision;return true;
    }
}
