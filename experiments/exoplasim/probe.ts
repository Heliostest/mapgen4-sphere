import {cellBounds} from '../../climate-diagnostics.ts';
import type {ClimateFrame} from './data.ts';
export type MonthlyFrame=ClimateFrame&{month:number;seconds:number};
export interface ProbeMonth {month:number;seconds:number;temperatureC:number;precipitationMm:number;rainMmDay:number;eastMps:number;northMps:number;windVectorMps:number;}
export function probeCell(width:number,height:number,latitude:number,longitude:number){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>65536||!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude))throw new Error('Invalid probe coordinates or grid');
 const lon=((longitude+180)%360+360)%360-180;
 const column=Math.min(width-1,Math.floor((lon+180)/360*width));
 const row=Math.max(0,Math.min(height-1,Math.floor((1-Math.sin(latitude*Math.PI/180))*height/2))),index=row*width+column;
 return {index,row,column,latitude:Math.asin(1-2*(row+.5)/height)*180/Math.PI,longitude:(column+.5)*360/width-180,bounds:cellBounds({width,height},index)};
}
export function probeYear(frames:readonly MonthlyFrame[],latitude:number,longitude:number){
 if(frames.length!==12)throw new Error('A point year requires 12 ordered months');
 const first=frames[0],cell=probeCell(first.width,first.height,latitude,longitude),k=cell.index;
 const months:ProbeMonth[]=frames.map((frame,i)=>{
  if(frame.month!==i+1||frame.width!==first.width||frame.height!==first.height||!Number.isFinite(frame.seconds)||frame.seconds<=0)throw new Error('Invalid point sampling coverage');
  for(const key of ['temperatureK','rainMmDay','eastMps','northMps'] as const)if(frame[key]?.length!==frame.width*frame.height||!Number.isFinite(frame[key][k]))throw new Error(`Invalid point ${key}`);
  if(frame.rainMmDay[k]<0||frame.temperatureK[k]<0)throw new Error('Invalid point physical value');
  const eastMps=frame.eastMps[k],northMps=frame.northMps[k];
  return {month:i+1,seconds:frame.seconds,temperatureC:frame.temperatureK[k]-273.15,precipitationMm:frame.rainMmDay[k]*frame.seconds/86400,rainMmDay:frame.rainMmDay[k],eastMps,northMps,windVectorMps:Math.hypot(eastMps,northMps)};
 });
 const seconds=months.reduce((s,m)=>s+m.seconds,0),annualPrecipitationMm=months.reduce((s,m)=>s+m.precipitationMm,0);
 return {cell,months,durationDays:seconds/86400,annualPrecipitationMm,annualMeanTemperatureC:months.reduce((s,m)=>s+m.temperatureC*m.seconds,0)/seconds,
  coldestMonthTemperatureC:Math.min(...months.map(m=>m.temperatureC)),warmestMonthTemperatureC:Math.max(...months.map(m=>m.temperatureC)),
  wettestMonth:annualPrecipitationMm>0?months.reduce((a,b)=>b.precipitationMm>a.precipitationMm?b:a).month:null};
}
export type ProbeYear=ReturnType<typeof probeYear>;
export function probeCSV(latitude:number,longitude:number,native:ProbeYear,gcm:ProbeYear){
 const rows:(string|number)[][]=[['model','month','latitude_deg','longitude_deg','cell_latitude_deg','cell_longitude_deg','sampled_seconds','temperature_c','precipitation_mm','precipitation_mm_day','east_mps','north_mps','monthly_mean_vector_mps']];
 for(const [name,series] of [['native',native],['gcm',gcm]] as const)for(const m of series.months)rows.push([name,m.month,latitude,longitude,series.cell.latitude,series.cell.longitude,m.seconds,m.temperatureC,m.precipitationMm,m.rainMmDay,m.eastMps,m.northMps,m.windVectorMps]);
 return rows.map(row=>row.join(',')).join('\r\n');
}
