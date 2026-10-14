import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='docs/evidence/earth-pressure-waves-20261015',out='build/earth-pressure-waves',audit='build/c11-independent-review';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function files(d){const ans=[];for(const e of await readdir(d,{withFileTypes:true})){const p=d+'/'+e.name;if(e.isDirectory())ans.push(...await files(p));else ans.push(p);}return ans;}
async function hashes(paths){return Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async p=>[p,sha(await readFile(p))])));}
await mkdir(audit,{recursive:true});
const outputs=await files(out), sources=await files(root), inputs=[];
for(const p of outputs.filter(p=>p.endsWith('-status.json'))){const s=JSON.parse(await readFile(p,'utf8'));sources.push(...Object.keys(s.sourceBefore||{}));inputs.push(...Object.keys(s.inputBefore||{}));}
const record={time:new Date().toISOString(),sourceHashes:await hashes(sources),inputHashes:await hashes(inputs),outputHashes:await hashes(outputs)};
await writeFile(`${audit}/${process.argv[2]||'before'}.json`,JSON.stringify(record,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({sourceCount:Object.keys(record.sourceHashes).length,inputCount:Object.keys(record.inputHashes).length,outputCount:Object.keys(record.outputHashes).length}));
