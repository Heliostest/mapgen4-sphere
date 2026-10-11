/** Isolated hypothesis, frozen production except the ocean anomaly term. */
import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
const label='surface-anomaly';
await build({entryPoints:['docs/evidence/earth-moisture-structural-20261011/integrate.ts'],bundle:true,platform:'node',format:'esm',outfile:`build/earth-moisture-structural/integrate-${label}.mjs`,plugins:[{name:label,setup(b){b.onLoad({filter:/[\\/]circulation\.ts$/},async a=>{
 let contents=await readFile(a.path,'utf8');const old='marine[Math.floor(i/width)]+Math.max(0,parcel*virtual[i]-t)';
 if(!contents.includes(old))throw new Error('Hypothesis target changed');
 contents=contents.replace(old,'marine[Math.floor(i/width)]+w.land[i]*Math.max(0,m.landTemperatureK[i]*virtual[i]-t)+(1-w.land[i])*(m.oceanTemperatureK[i]*virtual[i]-marine[Math.floor(i/width)])');
 await writeFile(`build/earth-moisture-structural/${label}-circulation.ts`,contents);
 return {contents,loader:'ts'};
});}}]});
