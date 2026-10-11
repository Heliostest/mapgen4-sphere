import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out='build/earth-seaice-causal/ncei-nsidc';await mkdir(out,{recursive:true});
const base='https://www.ncei.noaa.gov/data/sea-ice-concentration/access/';
const mirror='https://noaa-cdr-sea-ice-concentration-pds.s3.amazonaws.com/ncei_data/';
const jobs=[],manifest=[],failed=[];
const sha=b=>createHash('sha256').update(b).digest('hex');
async function get(url) {
 for(let i=0;i<3;i++)try {const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('HTTP '+r.status);return r;}catch(e){if(i===2)throw e;}
}
let nextYear=1981;
try {jobs.push(...JSON.parse(await readFile('build/earth-seaice-causal/ncei-catalogue.json','utf8')));}catch{}
if(jobs.length===0)await Promise.all(Array.from({length:6},async()=>{
 while(nextYear<=2010) {
  const year=nextYear++,url=base+year+'/',html=await (await get(url)).text();
  const files=Array.from(new Set(Array.from(html.matchAll(/href="(seaice_conc_monthly_([ns]h)_[a-z0-9]+_(\d{4})(\d{2})_v02r00\.nc)"/g),m=>m[1])));
  console.log('catalogue',year,files.length);if(files.length<20)throw Error('Incomplete monthly listing '+year);
  for(const file of files) {const m=file.match(/_([ns]h)_[a-z0-9]+_(\d{4})(\d{2})_/);jobs.push({url:url+file,file:out+'/'+file,hemisphere:m[1]==='nh'?'north':'south',year:+m[2],month:+m[3]});}
 }
}));
jobs.sort((a,b)=>a.url.localeCompare(b.url));
await writeFile('build/earth-seaice-causal/ncei-catalogue.json',JSON.stringify(jobs));
let next=0,done=0;
await Promise.all(Array.from({length:8},async()=>{
 while(next<jobs.length) {
  const j=jobs[next++];let b;try{b=await readFile(j.file);}catch{}
  const downloadUrl=j.url.replace(base,mirror);
  if(!b)try {const r=await get(downloadUrl);b=Buffer.from(await r.arrayBuffer());const length=r.headers.get('content-length');if(length&&b.length!==+length)throw Error('Incomplete response');await writeFile(j.file,b);}catch(e){failed.push({...j,error:e.message});console.log('failed',downloadUrl,e.message);continue;}
  if(b.length<1000)throw Error('Invalid NetCDF');manifest.push({...j,downloadUrl,bytes:b.length,sha256:sha(b)});
  if(++done%48===0)console.log('downloaded',done,'/',jobs.length);
 }
}));
manifest.sort((a,b)=>a.url.localeCompare(b.url));
await writeFile('docs/evidence/earth-seaice-causal-20261011/nsidc-inputs.json',JSON.stringify({product:'NOAA/NSIDC G02202 v02r00; NASA Team monthly field (not the merged official CDR)',variable:'goddard_nt_seaice_conc_monthly',doi:'10.7265/N55M63M1',period:[1981,2010],accessDate:'2026-10-11',archive:base,mirror,mirrorRegistry:'https://registry.opendata.aws/noaa-cdr-oceanic/',reason:'G02135 connection resets and NCEI direct NetCDF timeout; use the official NOAA Open Data mirror of the NCEI archive, compare against cached G02135 and disclose differences.',failed,files:manifest},null,2));
console.log('complete',manifest.length,'failed',failed.length);
