// Read-only foreground monitor for explicitly started local native experiments.
import {readFile} from 'node:fs/promises';
const names=process.argv.slice(2);
if(!names.length)throw Error('Supply experiment labels');
const finished=new Set(),last=new Map();
async function read(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT'||e instanceof SyntaxError)return null;throw e;}}
while(finished.size<names.length){
 for(const name of names){
  if(finished.has(name))continue;
  const status=await read(`docs/evidence/earth-speedy-transport-20261013/${name}-native-status.json`);
  const p=await read(`build/earth-speedy-transport/${name}-progress.json`);
  if(p&&p.time!==last.get(name)){
   console.log(JSON.stringify({name,...p}));last.set(name,p.time);
  }
  if(status){console.log(JSON.stringify({name,completed:true,code:status.code,sourceUnchanged:status.sourceUnchanged,inputsUnchanged:status.inputsUnchanged}));finished.add(name);}
 }
 if(finished.size<names.length)await new Promise(resolve=>setTimeout(resolve,15000));
}
