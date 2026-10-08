import {createNoise3D} from 'simplex-noise';
import {makeRandFloat} from '@redblobgames/prng';
import {uvToDirection, angularDistance} from './sphere.ts';

/** Original Mapgen4 elevation brush, measured on a sphere instead of a square. */
export class SphericalConstraints {
    seed = -1;
    island = -1;
    userHasPainted = false;
    elevation: Float32Array;
    private directions: ReturnType<typeof uvToDirection>[];
    private previous: Float32Array;
    private time: Float32Array;
    private strength: Float32Array;

    constructor(public size = 128) {
        this.elevation = new Float32Array(size*size);
        this.previous = new Float32Array(size*size);
        this.time = new Float32Array(size*size);
        this.strength = new Float32Array(size*size);
        this.directions = Array.from({length:size*size}, (_,i)=>uvToDirection((i%size)/size, Math.floor(i/size)/(size-1)));
    }

    setElevationParam({seed,island}: {seed:number;island:number}) {
        if (seed !== this.seed || island !== this.island) {
            this.seed=seed; this.island=island; this.generate();
        }
    }

    generate() {
        const noise = createNoise3D(makeRandFloat(this.seed));
        for (let p=0;p<this.elevation.length;p++) {
            const [x,y,z] = this.directions[p].map(v=>v*1.5);
            let sum=0, amplitudes=0;
            for (let octave=0;octave<5;octave++) {
                const f=1<<octave, a=1/f;
                sum+=a*noise(x*f,y*f,z*f); amplitudes+=a;
            }
            // There is no rectangular boundary on a planet. Island controls
            // ocean coverage while retaining the original fBm + mountain mix.
            let e=.5*(sum/amplitudes + .12 - .30*this.island);
            if (e>0) {
                const m=.5*noise(x+30,y+50,z+10)+.5*noise(2*x+33,2*y+55,2*z+17);
                const mountain=Math.min(1,e*5)*(1-Math.abs(m)/.5);
                if (mountain>0) e=Math.max(e,Math.min(e*3,mountain));
            }
            this.elevation[p]=Math.max(-1,Math.min(1,e));
        }
        // A pole is one physical point, independently of floating point sin(pi).
        this.elevation.fill(this.elevation[0],0,this.size);
        this.elevation.fill(this.elevation[this.elevation.length-1],this.elevation.length-this.size);
        this.userHasPainted=false;
    }

    beginStroke() {
        this.previous.set(this.elevation); this.time.fill(0); this.strength.fill(0);
    }

    paintAt(tool: {elevation:number}, u:number, v:number,
            brush: {innerRadius:number;outerRadius:number;rate:number}, elapsed:number) {
        const center=uvToDirection(u,v), factor=brush.rate/1000*Math.min(100,elapsed);
        const scale=(this.size-1)/Math.PI;
        for (let p=0;p<this.elevation.length;p++) {
            const distance=angularDistance(center,this.directions[p])*scale;
            if (distance>brush.outerRadius) continue;
            const strength=1-Math.min(1,Math.max(0,(distance-brush.innerRadius)/(brush.outerRadius-brush.innerRadius)));
            this.time[p]+=strength*factor;
            if (strength>this.strength[p]) this.strength[p]=(1-factor)*this.strength[p]+factor*strength;
            const mix=this.strength[p]*Math.min(1,this.time[p]);
            this.elevation[p]=(1-mix)*this.previous[p]+mix*tool.elevation;
        }
        this.userHasPainted=true;
    }
}
