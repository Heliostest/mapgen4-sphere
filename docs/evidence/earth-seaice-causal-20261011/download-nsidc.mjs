import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out='build/earth-seaice-causal/nsidc';await mkdir(out,{recursive:true});
const manifest=[],jobs=[],failed=[],base=process.env.NSIDC_MIRROR==='1'?'https://masie_web.apps.nsidc.org/pub/DATASETS/NOAA/G02135/':'https://noaadata.apps.nsidc.org/NOAA/G02135/';
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const hemi of ['north','south']) {
 const root=base+hemi+'/monthly/geotiff/',listing=await (await fetch(root)).text();
 const dirs=Array.from(new Set(Array.from(listing.matchAll(/href="(\d\d_[A-Za-z]+\/)"/g),m=>m[1])));
 if(dirs.length!==12)throw Error('Unexpected month directory listing');
 for(const dir of dirs){
  const url=root+dir,html=await (await fetch(url)).text();
  const files=Array.from(html.matchAll(/href="([NS]_(\d{4})\d{2}_concentration_v\d\.\d\.tif)"/g),m=>({file:m[1],year:+m[2]})).filter(f=>f.year>=1981&&f.year<=2010);
  console.log(hemi,dir,files.length);if(files.length<28)throw Error('Insufficient fixed-period data');
  for(const f of files)jobs.push({url:url+f.file,file:out+'/'+f.file,hemisphere:hemi,year:f.year,month:+dir.slice(0,2)});
 }
}
await writeFile('build/earth-seaice-causal/nsidc-catalogue.json',JSON.stringify(jobs));
let next=0,done=0;await Promise.all(Array.from({length:8},async()=>{
 while(next<jobs.length){const j=jobs[next++];let b;try{b=await readFile(j.file);}catch{}
  if(!b){for(let attempt=0;attempt<3;attempt++)try{
    const r=await fetch(j.url,{signal:AbortSignal.timeout(120000),headers:{Connection:'close'}});if(!r.ok)throw Error(j.url+' '+r.status);
    b=Buffer.from(await r.arrayBuffer());if(b.length!==Number(r.headers.get('content-length')))throw Error('Incomplete response');
    await writeFile(j.file,b);break;
   }catch(e){console.log('retry',j.url,attempt+1,e.message,e.cause?.code);if(attempt===2)failed.push({...j,error:e.message,cause:e.cause?.code});}
  }
  if(!b)continue;
  if(b.length<1000)throw Error('Invalid GeoTIFF');manifest.push({...j,bytes:b.length,sha256:sha(b)});if(++done%60===0)console.log('downloaded',done,'/',jobs.length);
 }
}));
manifest.sort((a,b)=>a.url.localeCompare(b.url));
await writeFile('docs/evidence/earth-seaice-causal-20261011/nsidc-inputs.json',JSON.stringify({product:'NSIDC G02135 v4; historical concentration data unchanged before 2025',doi:'10.7265/a98x-0f50',period:[1981,2010],accessDate:'2026-10-11',failed,files:manifest},null,2));
console.log('complete',manifest.length,'failed',failed.length);
