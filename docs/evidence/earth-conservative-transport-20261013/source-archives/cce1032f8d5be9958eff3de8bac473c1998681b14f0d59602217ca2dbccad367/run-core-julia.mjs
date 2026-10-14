import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,basename,dirname,relative} from 'node:path';
const folder='docs/evidence/earth-conservative-transport-20261013';
const output='build/earth-conservative-transport';
const script=process.argv[2], name=process.argv[3];
if(!script||!name||!/^[a-z0-9-]+$/.test(name))throw Error('Supply Julia script and unique run name');
await mkdir(output,{recursive:true});
const statusPath=`${output}/${name}-status.json`;
try {await access(statusPath);throw Error(`Refusing to overwrite ${statusPath}`);} catch(e) {if(e.code!=='ENOENT')throw e;}
const hash=b=>createHash('sha256').update(b).digest('hex');
const sources=new Set();
async function visit(file){
 const p=relative(process.cwd(),resolve(file)).replaceAll('\\','/');
 if(sources.has(p))return;sources.add(p);
 const body=await readFile(p,'utf8');
 for(const match of body.matchAll(/include\("([^"]+)"\)/g))await visit(resolve(dirname(p),match[1]));
 for(const match of body.matchAll(/include\(joinpath\(@__DIR__,\s*"([^"]+)"\)\)/g))await visit(resolve(dirname(p),match[1]));
}
await visit(script);
for(const p of [`${folder}/protocol.md`,`${folder}/design.md`,`${folder}/run-core-julia.mjs`])sources.add(p);
const files=[...sources].sort();
const inputs=['build/earth-speedyweather/annual-initial.jld2','build/earth-speedy-transport/split-reference-seasonal-geometry.json','docs/evidence/earth-speedyweather-20261012/julia-env/Project.toml','docs/evidence/earth-speedyweather-20261012/julia-env/Manifest.toml'];
const hashes=async paths=>Object.fromEntries(await Promise.all(paths.map(async p=>[p,hash(await readFile(p))])));
const sourceBefore=await hashes(files),inputBefore=await hashes(inputs);
for(const p of files){const dir=`${folder}/source-archives/${sourceBefore[p]}`;await mkdir(dir,{recursive:true});await writeFile(`${dir}/${basename(p)}`,await readFile(p));}
const env={...process.env,JULIA_DEPOT_PATH:resolve('build/earth-speedyweather/depot'),JULIA_NUM_THREADS:'2',OPENBLAS_NUM_THREADS:'1',CORE_RUN_NAME:name};
const args=['--startup-file=no','--project=docs/evidence/earth-speedyweather-20261012/julia-env',script];
const startedUTC=new Date().toISOString();
const child=spawn(resolve('build/earth-speedyweather/runtime/julia-1.12.7/bin/julia.exe'),args,{env,windowsHide:true});
let log='';child.stdout.on('data',b=>{log+=b;process.stdout.write(b);});child.stderr.on('data',b=>{log+=b;process.stderr.write(b);});
const code=await new Promise((res,rej)=>{child.on('error',rej);child.on('close',res);});
await writeFile(`${output}/${name}.log`,log);
const sourceAfter=await hashes(files),inputAfter=await hashes(inputs);
const record={name,script,args,startedUTC,completedUTC:new Date().toISOString(),code,sourceBefore,sourceAfter,sourceUnchanged:JSON.stringify(sourceBefore)===JSON.stringify(sourceAfter),inputBefore,inputAfter,inputUnchanged:JSON.stringify(inputBefore)===JSON.stringify(inputAfter)};
await writeFile(statusPath,JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({name,code,sourceUnchanged:record.sourceUnchanged,inputUnchanged:record.inputUnchanged}));
process.exitCode=code;
