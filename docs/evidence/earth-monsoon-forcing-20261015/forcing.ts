/** Offline diagnostic helpers; not part of the production runtime. */
export const days=[31,28,31,30,31,30,31,31,30,31,30,31];
export const centers=days.map((d,i)=>days.slice(0,i).reduce((s,x)=>s+x,0)+d/2);
export function monthBracket(timeS:number,yearS:number) {
 const day=((timeS/yearS*365+78)%365+365)%365;
 let a=11,b=0,left=centers[11]-365,right=centers[0];
 if(day>=centers[11]){left=centers[11];right=centers[0]+365;}
 else if(day>=centers[0])for(let j=0;j<11;j++)if(day>=centers[j]&&day<centers[j+1]){a=j;b=j+1;left=centers[j];right=centers[j+1];break;}
 return {a,b,f:(day-left)/(right-left)};
}
export function interpolate(months:number[][],timeS:number,yearS:number,out:Float64Array) {
 const {a,b,f}=monthBracket(timeS,yearS);
 for(let i=0;i<out.length;i++)out[i]=months[a][i]*(1-f)+months[b][i]*f;
}
/** Return the actual imposed sensible-energy change per whole cell area.
 * Direct edits deliberately do not mislabel this as internal heat exchange. */
export function nudge(t:Float64Array,c:ArrayLike<number>,target:ArrayLike<number>,dt:number,tau:number,out:Float64Array) {
 const fraction=-Math.expm1(-dt/tau);
 for(let i=0;i<t.length;i++)if(c[i]>0){const before=t[i];t[i]+=(target[i]-t[i])*fraction;out[i]+=(t[i]-before)*c[i];}
}
export class Sum {
 total=0;private correction=0;
 add(value:number){const x=value-this.correction,total=this.total+x;this.correction=(total-this.total)-x;this.total=total;}
}
