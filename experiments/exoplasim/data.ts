import {sphericalOverlap,cellBounds} from '../../climate-diagnostics.ts';
export interface ClimateFrame {width:number;height:number;temperatureK:ArrayLike<number>;rainMmDay:ArrayLike<number>;eastMps:ArrayLike<number>;northMps:ArrayLike<number>;}
export const FIELDS=['temperatureK','rainMmDay','eastMps','northMps'] as const;
export function validateSupportedWorld(value:{mesh?:{spacing:number};runtime?:{enabled:boolean;waterEnabled:boolean;grid:{width:number;height:number}}}){
 if(!value.mesh||![2.75,5.5].includes(value.mesh.spacing))throw new Error('Prototype supports only the existing standard/high sphere mesh');
 if(!value.runtime?.enabled||!value.runtime?.waterEnabled)throw new Error('Save a complete world with temperature and water enabled before exporting');
 if(value.runtime.grid?.width!==48||value.runtime.grid?.height!==24)throw new Error('Prototype requires the current 48×24 climate grid');
}
/** Right-endpoint diagnostic represents the preceding physical step. */
export function sampleMonth(index:number,stepS:number){
 let day=index*stepS/86400;
 if(!Number.isInteger(index)||index<0||!Number.isFinite(stepS)||stepS<=0||day>=365)throw new Error('Sample outside the first model year');
 const days=[31,28,31,30,31,30,31,31,30,31,30,31];let month=0;
 while(day>=days[month])day-=days[month++];return month;
}
export type Remap={width:number;height:number;sourceCount:number;cells:{k:number;weight:number}[][]};
/** Gaussian quadrature weights define effective cell areas. Native longitude
 * centres start at Greenwich; our equal-area cells start west of the dateline. */
export function makeRemap(longitudes:number,weights:ArrayLike<number>,width=48,height=24):Remap {
 if(!Number.isInteger(longitudes)||longitudes<4||weights.length<2||Array.from(weights).some(x=>!Number.isFinite(x)||x<=0)||Math.abs(Array.from(weights).reduce((s,v)=>s+v,0)-2)>1e-8)throw new Error('Invalid Gaussian grid');
 const bounds=[];let north=1;
 for(let y=0;y<weights.length;y++){
  const south=Math.max(-1,north-weights[y]);
  for(let x=0;x<longitudes;x++)bounds.push({north:Math.asin(north)*180/Math.PI,south:Math.asin(south)*180/Math.PI,west:(x-.5)*360/longitudes,east:(x+.5)*360/longitudes});
  north=south;
 }
 const cells=Array.from({length:width*height},(_,i)=>{
  const b=cellBounds({width,height},i),area=4*Math.PI/(width*height),parts:{k:number;weight:number}[]=[];
  for(let k=0;k<bounds.length;k++){const overlap=sphericalOverlap(b,bounds[k]);if(overlap>1e-15)parts.push({k,weight:overlap/area});}
  if(Math.abs(parts.reduce((s,p)=>s+p.weight,0)-1)>1e-8)throw new Error('Incomplete remapping coverage');
  return parts;
 });
 return {width,height,sourceCount:longitudes*weights.length,cells};
}
export function remap(map:Remap,values:ArrayLike<number>):number[]{
 if(values.length!==map.sourceCount||Array.from(values).some(x=>!Number.isFinite(x)))throw new Error('Invalid source field');
 return map.cells.map(parts=>parts.reduce((s,p)=>s+p.weight*values[p.k],0));
}
export function rawFields(temperature:ArrayLike<number>,rain:ArrayLike<number>,east:ArrayLike<number>,north:ArrayLike<number>){
 return {temperatureK:Array.from(temperature),rainMmDay:Array.from(rain,v=>v*86400000),eastMps:Array.from(east),northMps:Array.from(north)};
}
export function validateFrame(frame:ClimateFrame){
 const n=frame.width*frame.height;
 if(!Number.isInteger(frame.width)||!Number.isInteger(frame.height)||frame.width<1||frame.height<1||n>65536)throw new Error('Invalid frame dimensions');
 for(const key of FIELDS){const a=frame[key];if(!a||a.length!==n||Array.from(a).some(v=>!Number.isFinite(v)))throw new Error(`Invalid ${key}`);}
 if(Array.from(frame.rainMmDay).some(v=>v<0)||Array.from(frame.temperatureK).some(v=>v<0||v>1000)||[...Array.from(frame.eastMps),...Array.from(frame.northMps)].some(v=>Math.abs(v)>1000))throw new Error('Invalid physical field');
 return frame;
}
export function displayTextures(frame:ClimateFrame){
 validateFrame(frame);const n=frame.width*frame.height,air=new Uint8Array(4*n),water=new Uint8Array(4*n);
 const byte=(v:number)=>Math.round(255*Math.max(0,Math.min(1,v)));
 for(let k=0;k<n;k++){
  air[4*k]=byte((frame.temperatureK[k]-193.15)/140);
  air[4*k+1]=Math.max(0,Math.min(255,128+Math.round(1.27*frame.eastMps[k])));
  air[4*k+2]=Math.max(0,Math.min(255,128+Math.round(1.27*frame.northMps[k])));air[4*k+3]=255;
  water[4*k]=byte(frame.rainMmDay[k]/20);water[4*k+3]=255;
 }
 return {thermal:{width:frame.width,height:frame.height,pixels:air,timeS:0},water:{width:frame.width,height:frame.height,pixels:water,timeS:0}};
}
