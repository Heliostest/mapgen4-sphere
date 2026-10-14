import {spawn} from 'node:child_process';
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const folder='docs/evidence/earth-speedy-transport-20261013';
const old='docs/evidence/earth-speedy-moisture-monsoon-20261013';
const script=process.argv[2]??`${folder}/startup-trace.jl`;
const label=process.env.STARTUP_LABEL??'trace-slab';
const paths=[...new Set([script,...(await readdir(folder)).filter(x=>x.startsWith('startup-')&&x.endsWith('.jl')).map(x=>`${folder}/${x}`),
  ...(await readdir(old)).filter(x=>x.endsWith('.jl')).map(x=>`${old}/${x}`),
  'build/earth-speedyweather/depot/packages/SpeedyWeather/qRu16/src/time_stepping/time_integration.jl',
  'build/earth-speedyweather/depot/packages/SpeedyWeather/qRu16/src/time_stepping/steppers/leapfrog.jl'])];
const hashes=async()=>Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
const before=await hashes(),startedUTC=new Date().toISOString();
const env={...process.env,JULIA_DEPOT_PATH:resolve('build/earth-speedyweather/depot'),JULIA_NUM_THREADS:'2',OPENBLAS_NUM_THREADS:'1',MASS_IMPLEMENTATION:'fixed'};
const args=['--startup-file=no','--project=docs/evidence/earth-speedyweather-20261012/julia-env',script];
const child=spawn(resolve('build/earth-speedyweather/runtime/julia-1.12.7/bin/julia.exe'),args,{env,windowsHide:true});
let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
const code=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject);});
const after=await hashes();await mkdir(folder,{recursive:true});
await writeFile(`${folder}/startup-${label}.log`,output);
await writeFile(`${folder}/startup-${label}-status.json`,JSON.stringify({startedUTC,completedUTC:new Date().toISOString(),script,args,code,before,after,sourceUnchanged:JSON.stringify(before)===JSON.stringify(after)},null,2)+'\n');
console.log(JSON.stringify({label,code,sourceUnchanged:JSON.stringify(before)===JSON.stringify(after)}));console.log(output.slice(-12000));process.exitCode=code;
