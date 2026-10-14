import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve,relative,dirname} from 'node:path';
const folder='build/c9-independent-review',sources=new Set([`${folder}/run-late.mjs`]);
const hash=b=>createHash('sha256').update(b).digest('hex');
async function visit(file){const p=relative(process.cwd(),resolve(file)).replaceAll('\\','/');if(sources.has(p))return;sources.add(p);const code=await readFile(p,'utf8');for(const m of code.matchAll(/^\s*include\("([^"]+)"\)/gm))await visit(resolve(dirname(p),m[1]));}
await visit(`${folder}/latefail.jl`);
const hashes=async paths=>Object.fromEntries(await Promise.all([...paths].sort().map(async p=>[p,hash(await readFile(p))])));
const r={startedUTC:new Date().toISOString(),sourceBefore:await hashes(sources),entry:`${folder}/latefail.jl`};
await writeFile(`${folder}/late-status.json`,JSON.stringify(r,null,2),{flag:'wx'});
const child=spawn('build/earth-speedyweather/runtime/julia-1.12.7/bin/julia.exe',['--startup-file=no','--project=docs/evidence/earth-speedyweather-20261012/julia-env',r.entry],{windowsHide:true,env:{...process.env,JULIA_DEPOT_PATH:resolve('build/earth-speedyweather/depot'),OPENBLAS_NUM_THREADS:'1',JULIA_NUM_THREADS:'1'}});
let log='';for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{log+=b;process.stdout.write(b)});
r.code=await new Promise((res,rej)=>{child.on('error',rej);child.on('close',res)});
r.sourceAfter=await hashes(sources);r.sourceUnchanged=JSON.stringify(r.sourceBefore)===JSON.stringify(r.sourceAfter);r.completedUTC=new Date().toISOString();
await writeFile(`${folder}/late.log`,log,{flag:'wx'});
r.outputHashes=await hashes([`${folder}/late.log`,`${folder}/late-results.json`]);
r.passed=r.code===0&&r.sourceUnchanged;await writeFile(`${folder}/late-status.json`,JSON.stringify(r,null,2)+'\n');process.exitCode=r.passed?0:1;
