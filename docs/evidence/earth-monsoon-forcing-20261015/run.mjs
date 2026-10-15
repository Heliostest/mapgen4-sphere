/** Independent CPU processes, all outputs remain in ignored build/. */
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const folder='docs/evidence/earth-monsoon-forcing-20261015',out='build/earth-monsoon-forcing';
await mkdir(out,{recursive:true});
const archived=process.argv.includes('--archived');
const entry=out+(archived?'/archived-audit.mjs':'/audit.mjs');
if(archived){const b=gunzipSync(await readFile(`${folder}/audit.mjs.gz`));await writeFile(entry,b);}
const jobs=process.argv.slice(2).filter(s=>s!=='--archived');
if(!jobs.length)jobs.push('native','wind10','thermal','both10','windColumn','bothColumn');
console.log('bundle sha256',createHash('sha256').update(await readFile(entry)).digest('hex'));
let next=0,failed=false;
await Promise.all(Array.from({length:Math.min(6,jobs.length)},async()=>{
 while(next<jobs.length){const label=jobs[next++];
  const status=await new Promise(resolve=>{const p=spawn(process.execPath,[entry],{env:{...process.env,PARAM_PROFILE:label},stdio:'inherit',windowsHide:true});p.on('error',e=>{console.error(e);resolve(-1)});p.on('exit',resolve);});
  if(status!==0){failed=true;console.error('FAILED',label,status);}
 }
}));
process.exitCode=failed?1:0;
