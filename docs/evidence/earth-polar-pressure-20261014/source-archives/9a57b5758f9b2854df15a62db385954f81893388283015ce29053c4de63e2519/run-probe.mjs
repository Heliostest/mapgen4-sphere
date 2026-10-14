import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,open,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,basename,relative,extname} from 'node:path';
const folder='docs/evidence/earth-polar-pressure-20261014';
const output='build/earth-polar-pressure';
const [script,name,...extra]=process.argv.slice(2);
if(!script||!name||!/^[a-z0-9-]+$/.test(name))throw Error('Supply script and unique run name');
if(dirname(resolve(script))!==resolve(folder))throw Error('Script must belong to C3');
await mkdir(output,{recursive:true});
const statusPath=`${output}/${name}-status.json`;
const reservation=await open(statusPath,'wx');
const record={name,script,startedUTC:new Date().toISOString(),state:'preparing',configuration:Object.fromEntries(Object.entries(process.env).filter(([k])=>k.startsWith('POLAR_')))};
await reservation.writeFile(JSON.stringify(record,null,2)+'\n');await reservation.close();
const hash=b=>createHash('sha256').update(b).digest('hex');
const hashes=async paths=>Object.fromEntries(await Promise.all(paths.map(async p=>[p,hash(await readFile(p))])));
const sources=new Set();
async function visit(file){
 const p=relative(process.cwd(),resolve(file)).replaceAll('\\','/');
 if(sources.has(p))return;sources.add(p);
 const body=await readFile(p,'utf8');
 for(const m of body.matchAll(/include\("([^"]+)"\)/g))await visit(resolve(dirname(p),m[1]));
}
let logFile;
try{
 for(const ent of await readdir(folder,{withFileTypes:true}))if(ent.isFile()&&/\.(jl|py|mjs|md)$/.test(ent.name))await visit(`${folder}/${ent.name}`);
 const inputs=['build/earth-speedy-transport/split-reference-seasonal-geometry.json','docs/evidence/earth-speedyweather-20261012/julia-env/Project.toml','docs/evidence/earth-speedyweather-20261012/julia-env/Manifest.toml',...(process.env.POLAR_INPUT_FILES||'').split(';').filter(Boolean)];
 record.sourceBefore=await hashes([...sources].sort());record.inputBefore=await hashes(inputs);
 for(const p of sources){const dir=`${folder}/source-archives/${record.sourceBefore[p]}`;await mkdir(dir,{recursive:true});await writeFile(`${dir}/${basename(p)}`,await readFile(p));}
 logFile=await open(`${output}/${name}.log`,'wx');
 const env={...process.env,JULIA_DEPOT_PATH:resolve('build/earth-speedyweather/depot'),JULIA_NUM_THREADS:'2',OPENBLAS_NUM_THREADS:'1',POLAR_RUN_NAME:name};
 const python=extname(script)==='.py';
 record.executable=python?'C:/Users/helio/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe':resolve('build/earth-speedyweather/runtime/julia-1.12.7/bin/julia.exe');
 record.args=python?['-u',script,...extra]:['--startup-file=no','--project=docs/evidence/earth-speedyweather-20261012/julia-env',script,...extra];
 record.state='running';await writeFile(statusPath,JSON.stringify(record,null,2)+'\n');
 const child=spawn(record.executable,record.args,{env,windowsHide:true});
 let writes=Promise.resolve();
 const log=b=>{process.stdout.write(b);writes=writes.then(()=>logFile.write(b));};
 child.stdout.on('data',log);child.stderr.on('data',log);
 record.code=await new Promise((res,rej)=>{child.on('error',rej);child.on('close',res);});await writes;
 record.sourceAfter=await hashes([...sources].sort());record.inputAfter=await hashes(inputs);
 record.sourceUnchanged=JSON.stringify(record.sourceBefore)===JSON.stringify(record.sourceAfter);
 record.inputUnchanged=JSON.stringify(record.inputBefore)===JSON.stringify(record.inputAfter);
 record.state=record.code===0&&record.sourceUnchanged&&record.inputUnchanged?'passed':'failed';
 if(record.code===0)record.resultSha256=hash(await readFile(`${output}/${name}.json`));
}catch(e){record.state='failed';record.error=String(e);record.code=1;}
finally{await logFile?.close();record.completedUTC=new Date().toISOString();await writeFile(statusPath,JSON.stringify(record,null,2)+'\n');}
console.log(JSON.stringify({name,state:record.state,code:record.code,error:record.error}));
process.exitCode=record.state==='passed'?0:1;
