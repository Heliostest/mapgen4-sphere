import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {verifySelectedSources} from './source-bindings.mjs';
const name=process.argv[2];assert(/^[a-z0-9-]+$/.test(name));
const folder='docs/evidence/earth-native-graph-wind-20261014';
const base=`build/earth-native-graph-wind-tests/${name}`;
const hash=b=>createHash('sha256').update(b).digest('hex');
await mkdir(base,{recursive:true});
const sourceHashes={};
for(const file of ['source-bindings.mjs','test-source-bindings.mjs']){
 const body=await readFile(`${folder}/${file}`),digest=hash(body);sourceHashes[`${folder}/${file}`]=digest;
 await mkdir(`${folder}/source-archives/${digest}`,{recursive:true});await writeFile(`${folder}/source-archives/${digest}/${file}`,body);
}
const script=`${base}/probe.jl`,dependency=`${base}/included.jl`,runner=`${base}/runner.mjs`;
await writeFile(script,'include("included.jl")\n',{flag:'wx'});
await writeFile(dependency,'value = 1\n',{flag:'wx'});await writeFile(runner,'// fixed runner\n',{flag:'wx'});
const record={script,sourceBefore:Object.fromEntries(await Promise.all([script,dependency,runner].map(async p=>[p,hash(await readFile(p))])))};
let checks=0,result;
try{
 await verifySelectedSources(record,runner);checks++;
 await writeFile(dependency,'value = 2\n');
 await assert.rejects(()=>verifySelectedSources(record,runner),/source differs/);checks++;
 await writeFile(dependency,'value = 1\n');
 const missing={...record,sourceBefore:{...record.sourceBefore}};delete missing.sourceBefore[dependency];
 await assert.rejects(()=>verifySelectedSources(missing,runner),/unbound source/);checks++;
 await writeFile(script,'include("included.jl")\nvalue = 3\n');
 await assert.rejects(()=>verifySelectedSources(record,runner),/source differs/);checks++;
 await writeFile(script,'include("included.jl")\n');await writeFile(runner,'// changed runner\n');
 await assert.rejects(()=>verifySelectedSources(record,runner),/source differs/);checks++;
 result={passed:true,checks,sourceHashes};
}catch(e){result={passed:false,checks,error:String(e),sourceHashes};process.exitCode=1;}
await writeFile(`build/earth-native-graph-wind/${name}.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result));
