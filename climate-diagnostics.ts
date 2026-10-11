import type {ThermalGrid} from './thermal.ts';
export type Bounds={south:number;north:number;west:number;east:number};
const rad=Math.PI/180,days=[31,28,31,30,31,30,31,31,30,31,30,31];
export function cellBounds(grid:Pick<ThermalGrid,'width'|'height'>,k:number):Bounds {
 const row=Math.floor(k/grid.width),x=k%grid.width;
 return {south:Math.asin(1-2*(row+1)/grid.height)/rad,north:Math.asin(1-2*row/grid.height)/rad,west:-180+360*x/grid.width,east:-180+360*(x+1)/grid.width};
}
function longitudeSegments(b:Bounds):[number,number][] {
 if(b.east-b.west>=360)return [[-180,180]];
 const w=((b.west+180)%360+360)%360-180,width=((b.east-b.west)%360+360)%360;
 return w+width<=180?[[w,w+width]]:[[w,180],[-180,w+width-360]];
}
/** Solid angle of a spherical rectangle intersection, including dateline wrap. */
export function sphericalOverlap(a:Bounds,b:Bounds):number {
 const lo=Math.max(a.south,b.south),hi=Math.min(a.north,b.north);if(hi<=lo)return 0;
 let width=0;for(const [al,ar] of longitudeSegments(a))for(const [bl,br] of longitudeSegments(b))width+=Math.max(0,Math.min(ar,br)-Math.max(al,bl));
 return width*rad*(Math.sin(hi*rad)-Math.sin(lo*rad));
}
export type ObservationCell={bounds:Bounds;monthlyMm:ArrayLike<number>};
/** Sample uniform parent-column depth on identical GPCC-valid land support.
 * Land fractions weight both sides; missing cells enter neither denominator.
 * This comparison does not infer a subcell precipitation distribution. */
export function matchedSupport(grid:Pick<ThermalGrid,'width'|'height'|'count'>,land:ArrayLike<number>,region:Bounds,observations:ObservationCell[]) {
 const weights=new Float64Array(grid.count),observedMonthlyMm=new Float64Array(12);let solidAngle=0;
 for(const cell of observations){if(cell.monthlyMm.length!==12||Array.from(cell.monthlyMm).some(x=>!Number.isFinite(x)||x<0))continue;
  for(let k=0;k<grid.count;k++){if(land[k]<=0)continue;const b=cellBounds(grid,k);
   let a=0;for(const [west,east] of longitudeSegments(region)){const left=Math.max(west,b.west),right=Math.min(east,b.east);if(right>left)a+=sphericalOverlap({south:Math.max(region.south,b.south),north:Math.min(region.north,b.north),west:left,east:right},cell.bounds);}
   a*=land[k];if(a<=0)continue;weights[k]+=a;solidAngle+=a;for(let m=0;m<12;m++)observedMonthlyMm[m]+=a*cell.monthlyMm[m];
  }
 }
 if(solidAngle>0)for(let m=0;m<12;m++)observedMonthlyMm[m]/=solidAngle;
 return {weights,solidAngle,observedMonthlyMm,mean:(values:ArrayLike<number>)=>solidAngle>0?weights.reduce((sum,a,k)=>sum+a*values[k],0)/solidAngle:NaN};
}
/** Gregorian non-leap months mapped to a physical orbital year. Phase-zero
 * Earth day zero is March 20 (day 78). Integrate seconds, then calendar bins. */
export class CalendarFlux {
 readonly months:Float64Array[];readonly total:Float64Array;
 constructor(count:number,readonly yearS:number,readonly startDay=78){this.total=new Float64Array(count);this.months=days.map(()=>new Float64Array(count));}
 add(fromS:number,dtS:number,rate:ArrayLike<number>) {
  const dayS=this.yearS/365;let left=fromS,right=fromS+dtS;
  for(let k=0;k<this.total.length;k++)this.total[k]+=rate[k]*dtS;
  while(left<right){let d=((left/dayS+this.startDay)%365+365)%365,month=0,bound=days[0];while(month<11&&d>=bound-1e-10){month++;bound+=days[month];}
   const next=Math.min(right,left+(bound-d)*dayS),delta=next-left;
   if(delta<=0)throw new Error('Calendar integration failed to advance');
   for(let k=0;k<this.total.length;k++)this.months[month][k]+=rate[k]*delta;left=next;
  }
 }
}
export class VaporLedger {
 readonly evaporation:Float64Array;readonly precipitation:Float64Array;readonly transport:Float64Array;
 constructor(readonly initial:ArrayLike<number>){this.initial=Float64Array.from(initial);this.evaporation=new Float64Array(initial.length);this.precipitation=new Float64Array(initial.length);this.transport=new Float64Array(initial.length);}
 add(dtS:number,e:ArrayLike<number>,p:ArrayLike<number>,netTransport:ArrayLike<number>){for(let k=0;k<this.initial.length;k++){this.evaporation[k]+=e[k]*dtS;this.precipitation[k]+=p[k]*dtS;this.transport[k]+=netTransport[k];}}
 residual(final:ArrayLike<number>){return Float64Array.from(final,(v,k)=>v-this.initial[k]-this.evaporation[k]+this.precipitation[k]-this.transport[k]);}
}
