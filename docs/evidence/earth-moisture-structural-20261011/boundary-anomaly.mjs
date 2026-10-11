/** Compare land boundary heating with marine boundary heating once. */
import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
const label='boundary-anomaly',entry=process.argv[2]??'investigate';
await build({entryPoints:[`docs/evidence/earth-moisture-structural-20261011/${entry}.ts`],bundle:true,platform:'node',format:'esm',outfile:`build/earth-moisture-structural/${entry}-${label}.mjs`,plugins:[{name:label,setup(b){b.onLoad({filter:/[\\/]circulation\.ts$/},async a=>{
 let contents=await readFile(a.path,'utf8');
 const changes=[
 ['const marine=new Float64Array(height),weight=', 'const marineBuoy=new Float64Array(height),marine=new Float64Array(height),weight='],
 ['weight[j]+=1-w.land[i];marine[j]+=', 'weight[j]+=1-w.land[i];marineBuoy[j]+=(1-w.land[i])*Math.max(0,m.oceanTemperatureK[i]*virtual[i]-m.temperatureK[i]);marine[j]+='],
 ['if(weight[j]>0)marine[j]/=weight[j];','if(weight[j]>0){marine[j]/=weight[j];marineBuoy[j]/=weight[j];}'],
 ['marine[j]=north>=0&&south<height?', 'marineBuoy[j]=north>=0&&south<height?marineBuoy[north]+(marineBuoy[south]-marineBuoy[north])*(g.sinLat[j]-g.sinLat[north])/(g.sinLat[south]-g.sinLat[north]):0;marine[j]=north>=0&&south<height?'],
 ['marine[Math.floor(i/width)]+Math.max(0,parcel*virtual[i]-t)','marine[Math.floor(i/width)]+w.land[i]*(Math.max(0,m.landTemperatureK[i]*virtual[i]-t)-marineBuoy[Math.floor(i/width)])+(1-w.land[i])*(m.oceanTemperatureK[i]*virtual[i]-marine[Math.floor(i/width)])']
 ];
 for(const [old,replacement] of changes){if(!contents.includes(old))throw new Error('Hypothesis target changed: '+old);contents=contents.replace(old,replacement);}
 await writeFile(`build/earth-moisture-structural/${label}-circulation.ts`,contents);
 return {contents,loader:'ts'};
});}}]});
