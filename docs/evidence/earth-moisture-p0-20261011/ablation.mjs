// Isolated source ablations: do not edit product sources or formal defaults.
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
const variant=process.argv[2];
const replace=(source,from,to)=>{if(!source.includes(from))throw Error(`Missing ablation anchor: ${from}`);return source.replace(from,to);};
await build({entryPoints:['docs/evidence/earth-moisture-p0-20261011/investigate.ts'],outfile:`build/earth-moisture-p0/ablation-${variant}.mjs`,bundle:true,platform:'node',format:'esm',plugins:[{name:'isolated-closure-ablation',setup(b){b.onLoad({filter:/[\\/](water|circulation)\.ts$/},async a=>{
 let contents=await readFile(a.path,'utf8');
 if(a.path.endsWith('water.ts')&&variant==='no-orography')contents=replace(contents,'+.0065*DAY*this.upslope[i]','');
 if(a.path.endsWith('water.ts')&&variant==='resolved-lapse'){
  contents=replace(contents,'const frontalCooling=new Float64Array(n);','const frontalCooling=new Float64Array(n),unresolvedAscent=new Float64Array(n);');
  contents=replace(contents,'const parcel=(i:number)=>','unresolvedAscent[to]+=DAY*Math.abs(rate)*Math.max(0,.0065*Math.max(0,this.heightM[to]-this.heightM[from])-Math.max(0,temperatureK[from]-temperatureK[to]));\n            const parcel=(i:number)=>');
  contents=replace(contents,'+.0065*DAY*this.upslope[i]','+unresolvedAscent[i]');
 }
 if(a.path.endsWith('circulation.ts')&&variant==='air-pressure')contents=replace(contents,'const parcel=w.land[i]*m.landTemperatureK[i]/m.radiationScale[i]+(1-w.land[i])*m.oceanTemperatureK[i];','const parcel=t/m.radiationScale[i];');
 if(a.path.endsWith('circulation.ts')&&variant==='no-meridional-template')contents=replace(contents,'const wind=circulationWinds(g,m.planet,m.orbit,timeS,w.land,w.config.windMps);','const wind=circulationWinds(g,m.planet,m.orbit,timeS,w.land,w.config.windMps); if(modern)wind.northMps.fill(0);');
 if(a.path.endsWith('circulation.ts')&&variant==='coast-pressure')contents=replace(contents,'const wind=circulationWinds(g,m.planet,m.orbit,timeS,w.land,w.config.windMps);','const wind=circulationWinds(g,m.planet,m.orbit,timeS,w.land,w.config.windMps); if(modern)for(let i=0;i<g.count;i++){wind.eastMps[i]*=1-w.land[i];wind.northMps[i]*=1-w.land[i];}');
 if(a.path.endsWith('circulation.ts')&&['energy-center','energy-center-meridional','surface-center'].includes(variant))contents=replace(contents,'const wind=circulationWinds(g,m.planet,m.orbit,timeS,w.land,w.config.windMps);',`const wind=circulationWinds(g,m.planet,m.orbit,timeS,w.land,w.config.windMps);
        if(modern) {
            let energy=m.temperatureK.map((t,i)=>t/m.radiationScale[i]+2.45e6*w.atmosphereKgM2[i]/m.capacity[i]);
            for(let p=0;p<3;p++)energy=energy.map((t,i)=>(2*t+energy[Math.floor(i/width)*width+(i%width+width-1)%width]+energy[Math.floor(i/width)*width+(i%width+1)%width])/4);
            const rotation=Math.min(1,86164/m.planet.siderealPeriodS);
            for(let x=0;x<width;x++){
                let maximum=-Infinity;for(let j=0;j<height;j++)if(Math.abs(g.sinLat[j])<=.574)maximum=Math.max(maximum,energy[j*width+x]);
                let sum=0,weight=0;for(let j=0;j<height;j++)if(Math.abs(g.sinLat[j])<=.574){const a=Math.exp((energy[j*width+x]-maximum)/2);sum+=a*Math.asin(g.sinLat[j]);weight+=a;}
                const center=sum/weight;
                for(let j=0;j<height;j++){
                    const i=j*width+x,shifted=(Math.asin(g.sinLat[j])-center)*180/Math.PI,d=Math.min(90,Math.abs(shifted)),band=Math.min(2,Math.floor(d/30)),shape=Math.sin(Math.PI*(d-band*30)/30),speed=w.config.windMps*(1-.25*w.land[i])*shape;
                    wind.eastMps[i]=(band===1?1:-1)*speed*rotation*(m.planet.retrograde?-1:1);
                    wind.northMps[i]=(band===1?1:-1)*Math.sign(shifted)*.35*speed;
                }
            }
        }`);
 if(a.path.endsWith('circulation.ts')&&variant==='energy-center-meridional')contents=replace(contents,'wind.eastMps[i]=(band===1?1:-1)*speed*rotation*(m.planet.retrograde?-1:1);','// Retain the original zonal template.');
 if(a.path.endsWith('circulation.ts')&&variant==='surface-center')contents=replace(contents,'t/m.radiationScale[i]+2.45e6*w.atmosphereKgM2[i]/m.capacity[i]','w.land[i]*m.landTemperatureK[i]/m.radiationScale[i]+(1-w.land[i])*m.oceanTemperatureK[i]+2.45e6*w.atmosphereKgM2[i]/m.capacity[i]');
 return {contents,loader:'ts'};
 });}}]});
