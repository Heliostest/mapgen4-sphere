import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,basename,dirname,relative} from 'node:path';
const folder='docs/evidence/earth-speedy-transport-20261013',runtime='build/earth-speedyweather';
const script=process.argv[2];if(!script)throw Error('Supply Julia script');
const env={...process.env,JULIA_DEPOT_PATH:resolve(`${runtime}/depot`),JULIA_NUM_THREADS:'2',OPENBLAS_NUM_THREADS:'1'};
const args=['--startup-file=no','--project=docs/evidence/earth-speedyweather-20261012/julia-env',script];
const startedUTC=new Date().toISOString();
const hash=b=>createHash('sha256').update(b).digest('hex');
const dependencies=new Set([`${folder}/protocol.md`,`${folder}/v2-protocol.md`,`${folder}/run-v2-julia.mjs`]);
async function visit(p){
 p=relative(process.cwd(),resolve(p)).replaceAll('\\','/');if(dependencies.has(p))return;dependencies.add(p);
 const source=await readFile(p,'utf8');
 for(const [,inc]of source.matchAll(/include\("([^"]+)"\)/g)){
  if(p===`${folder}/transport-model.jl`){
   const fix=process.env.PHYSICS_FIX??'baseline';
   if(inc==='convection-corrected.jl'&&!['parcel','combined'].includes(fix))continue;
   if(inc==='cloud-correction.jl'&&!['clouds-precip','clouds-full','combined'].includes(fix))continue;
  }
  await visit(resolve(dirname(p),inc));
 }
}
await visit(script);const files=[...dependencies];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async p=>[p,hash(await readFile(p))])));
const sourceBefore=await hashes();
const inputs=[process.env.SPEEDY_SENSITIVITY==='1'?'build/earth-speedy-moisture-monsoon/coupled-seasonal-statistics-start.jld2':'build/earth-speedyweather/annual-initial.jld2',
 'build/earth-speedyweather/depot/artifacts/ad8ffe0ca625b95d5b20ffab31dbdd3ae4734530/sea_surface_temperature.nc',
 'docs/evidence/earth-speedyweather-20261012/julia-env/Project.toml','docs/evidence/earth-speedyweather-20261012/julia-env/Manifest.toml'];
const inputHashes=async()=>Object.fromEntries(await Promise.all(inputs.map(async p=>[p,hash(await readFile(p))])));
const inputsBefore=await inputHashes();
for(const p of files){const dir=`${folder}/source-archives/${sourceBefore[p]}`;await mkdir(dir,{recursive:true});await writeFile(`${dir}/${basename(p)}`,await readFile(p));}
const child=spawn(resolve(`${runtime}/runtime/julia-1.12.7/bin/julia.exe`),args,{env,windowsHide:true});
let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
const code=await new Promise((res,rej)=>{child.on('error',rej);child.on('close',res);});
const name=(process.env.SPEEDY_CASE??basename(script,'.jl'))+(process.env.SPEEDY_SMOKE==='1'?'-smoke':'');await writeFile(`${folder}/${name}-native.log`,output);
const sourceAfter=await hashes();
const inputsAfter=await inputHashes();
const configuration=Object.fromEntries(['SPEEDY_CASE','SPEEDY_MODE','SPEEDY_SMOKE','MOISTURE_IMPLEMENTATION','MASS_IMPLEMENTATION','MIXING_IMPLEMENTATION','AUDIT_STAGES','DIAG_DAYS','PHYSICS_FIX','SPEEDY_SENSITIVITY'].map(k=>[k,process.env[k]??null]));
const result={startedUTC,completedUTC:new Date().toISOString(),script,configuration,sourceBefore,sourceAfter,sourceUnchanged:JSON.stringify(sourceBefore)===JSON.stringify(sourceAfter),inputsBefore,inputsAfter,inputsUnchanged:JSON.stringify(inputsBefore)===JSON.stringify(inputsAfter),args,code};
await writeFile(`${folder}/${name}-native-status.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({name,code,sourceUnchanged:result.sourceUnchanged}));console.log(output.slice(-9000));process.exitCode=code;
