import {readFile,writeFile,mkdir,open,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,dirname,basename} from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-compatible-momentum-20261014',out='build/earth-compatible-momentum';
const [script,name,...extra]=process.argv.slice(2);
assert(script?.endsWith('.jl')&&/^c7-[a-z0-9-]+$/.test(name),'Julia entry and unique c6 run name required');
try{await readFile(`${folder}/manifest.json`);throw new Error('C7 is sealed; create a new experiment');}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(out,{recursive:true});
const statusPath=`${out}/${name}-status.json`;await writeFile(statusPath,'{}\n',{flag:'wx'});
const hash=b=>createHash('sha256').update(b).digest('hex');
const hashes=async paths=>Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async p=>[p,hash(await readFile(p))])));
const sources=new Set([`${folder}/run.mjs`,`${folder}/protocol.md`]);
async function visit(file){
 const p=relative(process.cwd(),resolve(file)).replaceAll('\\','/');if(sources.has(p))return;sources.add(p);
 const code=await readFile(p,'utf8');
 for(const m of code.matchAll(/^\s*include\("([^"]+)"\)/gm))await visit(resolve(dirname(p),m[1]));
}
const record={name,script,extra,startedUTC:new Date().toISOString(),parameters:Object.fromEntries(Object.entries(process.env).filter(([k])=>k.startsWith('CMP_')))};
let log;
try{
 await visit(script);
 const c4='docs/evidence/earth-native-graph-wind-20261014';
 const manifest=JSON.parse(await readFile(`${c4}/manifest.json`,'utf8'));
 assert.equal(hash(await readFile(`${c4}/manifest.json`)),'8c9869d799dc7b7da8bd955de8a9cacd1c843722de8926bb10ddc1bc94cd6536');
 for(const b of manifest.bindings)assert.equal(hash(await readFile(b.path)),b.sha256,b.path);
 const c5='docs/evidence/earth-rotating-graph-20261014';
 assert.equal(hash(await readFile(`${c5}/manifest.json`)),'bccc6cf74351355e7c3c799c4767684b2fa06a2de73b0a2d67ca057ed5e376e8');
 for(const b of JSON.parse(await readFile(`${c5}/manifest.json`,'utf8')).bindings)assert.equal(hash(await readFile(b.path)),b.sha256,b.path);
 const c6='docs/evidence/earth-covariant-momentum-20261014';
 assert.equal(hash(await readFile(`${c6}/manifest.json`)),'fa83192f5dd1dd2627734a6eaff9a6a2d546181ae24ac5d07fe45d93f834633c');
 for(const b of JSON.parse(await readFile(`${c6}/manifest.json`,'utf8')).bindings)assert.equal(hash(await readFile(b.path)),b.sha256,b.path);
 const inputs=[`${c6}/manifest.json`,`${c5}/manifest.json`,`${c4}/manifest.json`,`${c4}/raw/inputs/candidate-c1-native-1800-import.bin`,`${c4}/raw/inputs/split-reference-seasonal-geometry.json`,
  ...[24,48,96].map(n=>`${c4}/raw/c4-graphs-v1-${n}-graph.json`),
  'docs/evidence/earth-polar-pressure-20261014/manifest.json','docs/evidence/earth-polar-pressure-20261014/raw/c3-spatial-near-audit-v1-native-graph.json',
  'docs/evidence/earth-speedyweather-20261012/julia-env/Project.toml','docs/evidence/earth-speedyweather-20261012/julia-env/Manifest.toml',
  ...(process.env.CMP_INPUT_FILES||'').split(';').filter(Boolean)];
 record.sourceBefore=await hashes([...sources]);record.inputBefore=await hashes(inputs);
 for(const [p,d] of Object.entries(record.sourceBefore)){
  const dir=`${folder}/source-archives/${d}`;await mkdir(dir,{recursive:true});await writeFile(`${dir}/${basename(p)}`,await readFile(p));
 }
 log=await open(`${out}/${name}.log`,'wx');
 record.executable=resolve('build/earth-speedyweather/runtime/julia-1.12.7/bin/julia.exe');
 record.args=['--startup-file=no','--project=docs/evidence/earth-speedyweather-20261012/julia-env',script,...extra];
 record.state='running';await writeFile(statusPath,JSON.stringify(record,null,2)+'\n');
 const child=spawn(record.executable,record.args,{env:{...process.env,JULIA_DEPOT_PATH:resolve('build/earth-speedyweather/depot'),JULIA_NUM_THREADS:'2',OPENBLAS_NUM_THREADS:'1',CMP_RUN_NAME:name},windowsHide:true});
 let writes=Promise.resolve();const output=b=>{process.stdout.write(b);writes=writes.then(()=>log.write(b));};
 child.stdout.on('data',output);child.stderr.on('data',output);
 record.code=await new Promise((res,rej)=>{child.on('error',rej);child.on('close',res);});await writes;
 record.sourceAfter=await hashes([...sources]);record.inputAfter=await hashes(inputs);
 record.sourceUnchanged=JSON.stringify(record.sourceBefore)===JSON.stringify(record.sourceAfter);
 record.inputUnchanged=JSON.stringify(record.inputBefore)===JSON.stringify(record.inputAfter);
 record.outputHashes=await hashes((await readdir(out)).filter(p=>(p===`${name}.json`||p.startsWith(`${name}-`))&&!p.endsWith('-status.json')).map(p=>`${out}/${p}`));
 record.state=record.code===0&&record.sourceUnchanged&&record.inputUnchanged?'passed':'failed';
 if(record.state==='passed')assert(JSON.parse(await readFile(`${out}/${name}.json`,'utf8')).passed===true);
}catch(e){record.state='failed';record.code=1;record.error=String(e);}
finally{await log?.close();record.completedUTC=new Date().toISOString();await writeFile(statusPath,JSON.stringify(record,null,2)+'\n');}
console.log(JSON.stringify({name,state:record.state,code:record.code,error:record.error}));process.exitCode=record.state==='passed'?0:1;
