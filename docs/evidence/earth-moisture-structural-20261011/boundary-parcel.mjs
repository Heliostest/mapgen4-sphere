/** Isolate the resolved surface boundary temperature in finite frontal parcels. */
import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
const label='boundary-parcel',entry=process.argv[2]??'investigate';
await build({entryPoints:[`docs/evidence/earth-moisture-structural-20261011/${entry}.ts`],bundle:true,platform:'node',format:'esm',outfile:`build/earth-moisture-structural/${entry}-${label}.mjs`,plugins:[{name:label,setup(b){
 b.onLoad({filter:/[\\/]circulation\.ts$/},async()=>({contents:await readFile('build/earth-moisture-structural/friction-balance-circulation.ts','utf8'),loader:'ts'}));
 b.onLoad({filter:/[\\/]water\.ts$/},async a=>{
  let contents=await readFile(a.path,'utf8');
  const changes=[
   ['const orographicRain=new Float64Array(n),frontalRain=new Float64Array(n);','const surfaceParcel=Float64Array.from(temperatureK,(t,i)=>coupling?.landTemperatureK&&coupling?.oceanTemperatureK?land[i]*coupling.landTemperatureK[i]+(1-land[i])*coupling.oceanTemperatureK[i]:t),commonSurface=surfaceParcel.map((t,i)=>t/scales[i]);const orographicRain=new Float64Array(n),frontalRain=new Float64Array(n);'],
   ['Math.min(temperatureK[from]-temperatureK[to],commonTemperature[from]-commonTemperature[to])','Math.min(surfaceParcel[from]-surfaceParcel[to],commonSurface[from]-commonSurface[to])'],
   ['moistureCapacity(uphillT-frontLift)','moistureCapacity(surfaceParcel[from]-.0065*ascent-frontLift)']
  ];
  for(const [old,replacement] of changes){if(!contents.includes(old))throw new Error('Hypothesis target changed: '+old);contents=contents.replace(old,replacement);}
  await writeFile(`build/earth-moisture-structural/${label}-water.ts`,contents);
  return {contents,loader:'ts'};
 });
}}]});
