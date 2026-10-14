/** Exact mean positive depth above a linear triangular bed. */
export function triangleStorageDepth(h:number,a:number,b:number,c:number) {
    if(a>b)[a,b]=[b,a];if(b>c)[b,c]=[c,b];if(a>b)[a,b]=[b,a];
    if(h<=a)return 0;if(h>=c)return h-(a+b+c)/3;
    if(h<=b)return (h-a)**3/(3*(b-a)*(c-a));
    return h-(a+b+c)/3+(c-h)**3/(3*(c-a)*(c-b));
}
export class LakeStorage {
    readonly min:number;readonly max:number;
    private readonly coefficients:Float64Array;private readonly mean:number;
    constructor(readonly patches:{vertices:number[][];weight:number}[]) {
        this.min=Math.min(...patches.flatMap(p=>p.vertices.map(v=>v[2])));
        this.max=Math.max(...patches.flatMap(p=>p.vertices.map(v=>v[2])));
        this.coefficients=new Float64Array(patches.length*7);let mean=0;
        for(let i=0;i<patches.length;i++){const [a,b,c]=patches[i].vertices.map(v=>v[2]).sort((a,b)=>a-b),m=(a+b+c)/3,w=patches[i].weight;this.coefficients.set([a,b,c,m,1/(3*(b-a)*(c-a)),1/(3*(c-a)*(c-b)),w],i*7);mean+=w*m;}this.mean=mean;
    }
    depth(h:number) {let result=0;const p=this.coefficients;for(let i=0;i<p.length;i+=7){let d=0;if(h>=p[i+2])d=h-p[i+3];else if(h>p[i]){if(h<=p[i+1])d=(h-p[i])**3*p[i+4];else d=h-p[i+3]+(p[i+2]-h)**3*p[i+5];}result+=p[i+6]*d;}return result;}
    level(depthM:number) {
        if(depthM<=0)return this.min;
        if(depthM+this.mean>=this.max)return depthM+this.mean;
        let lo=this.min,hi=this.max+depthM;
        for(let i=0;i<36;i++){const mid=(lo+hi)/2;if(this.depth(mid)<depthM)lo=mid;else hi=mid;}
        return (lo+hi)/2;
    }
}
