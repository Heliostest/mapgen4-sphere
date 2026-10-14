import {spawn} from 'node:child_process';
import {open,writeFile} from 'node:fs/promises';
const out='build/earth-native-graph-wind';
const rows=[];
for(const task of ['test','typecheck','build']){
 const log=await open(`${out}/project-${task}.log`,'wx');const startedUTC=new Date().toISOString();
 const p=spawn('cmd.exe',['/d','/s','/c',`npm run ${task}`],{windowsHide:true});
 let writes=Promise.resolve();
 const append=b=>{writes=writes.then(()=>log.write(b));};
 p.stdout.on('data',append);p.stderr.on('data',append);
 const code=await new Promise((res,rej)=>{p.on('error',rej);p.on('close',res);});await writes;await log.close();
 rows.push({task,code,startedUTC,completedUTC:new Date().toISOString()});console.log(JSON.stringify(rows.at(-1)));
}
await writeFile(`${out}/project-checks.json`,JSON.stringify({passed:rows.every(r=>r.code===0),rows},null,2)+'\n',{flag:'wx'});
process.exitCode=rows.every(r=>r.code===0)?0:1;
