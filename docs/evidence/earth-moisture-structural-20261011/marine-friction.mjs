/** Isolate explicit marine-balanced forcing, retain current thermal potential. */
import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
const label='marine-friction',entry=process.argv[2]??'investigate';
await build({entryPoints:[`docs/evidence/earth-moisture-structural-20261011/${entry}.ts`],bundle:true,platform:'node',format:'esm',outfile:`build/earth-moisture-structural/${entry}-${label}.mjs`,plugins:[{name:label,setup(b){b.onLoad({filter:/[\\/]circulation\.ts$/},async a=>{
 let contents=await readFile(a.path,'utf8');
 const changes=[
 ['const wind=circulationWinds(g,m.planet,m.orbit,timeS,w.land,w.config.windMps);','const wind=circulationWinds(g,m.planet,m.orbit,timeS,w.land,w.config.windMps),background=circulationWinds(g,m.planet,m.orbit,timeS,new Float64Array(g.count),w.config.windMps);'],
 ['rotatingDrag(w.windEastMps[i]-wind.eastMps[i],w.windNorthMps[i],ax,ay,coriolis,drag,dt)','rotatingDrag(w.windEastMps[i],w.windNorthMps[i],ax+background.eastMps[i]/(.25*86400),ay+coriolis*background.eastMps[i],coriolis,drag,dt)'],
 ['if(modern)v-=wind.northMps[i];','if(modern){u-=wind.eastMps[i];v-=wind.northMps[i];}']
 ];
 for(const [old,replacement] of changes){if(!contents.includes(old))throw new Error('Hypothesis target changed: '+old);contents=contents.replace(old,replacement);}
 await writeFile(`build/earth-moisture-structural/${label}-circulation.ts`,contents);return {contents,loader:'ts'};
});}}]});
