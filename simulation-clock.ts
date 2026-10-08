import {finiteInRange} from './planet.ts';

/** Analytical simulation clock. Wall time only schedules its SI seconds.
 * Call setPlaying(false) on visibility loss; resuming establishes a new epoch. */
export class SimulationClock {
    playing=false;
    private lastWallMs:number|null=null;
    constructor(public timeS=0, public speed=3600) {
        finiteInRange(timeS,'simulation time',0); finiteInRange(speed,'time speed',0);
    }
    setPlaying(playing:boolean, nowMs:number) {
        this.playing=playing; this.lastWallMs=nowMs;
    }
    pauseAt(presentedTimeS:number|null,nowMs:number) {
        if(this.playing && presentedTimeS!==null && Number.isFinite(presentedTimeS) && presentedTimeS>=0) {
            this.timeS=Math.min(this.timeS,presentedTimeS);
        }
        this.setPlaying(false,nowMs);
    }
    setSpeed(speed:number, nowMs:number) {
        finiteInRange(speed,'time speed',0);
        this.tick(nowMs); this.speed=speed;
    }
    seek(timeS:number, nowMs:number) {
        finiteInRange(timeS,'simulation time',0);
        this.timeS=timeS; this.lastWallMs=nowMs;
    }
    tick(nowMs:number):number {
        if(!Number.isFinite(nowMs)) return this.timeS;
        if(this.lastWallMs===null) this.lastWallMs=nowMs;
        const elapsed=Math.max(0,nowMs-this.lastWallMs);
        this.lastWallMs=Math.max(nowMs,this.lastWallMs);
        if(this.playing) this.timeS+=elapsed/1000*this.speed;
        return this.timeS;
    }
}
