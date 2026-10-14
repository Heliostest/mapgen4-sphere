import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const docs='docs/evidence/earth-speedy-transport-20261013',build='build/earth-speedy-transport';
const sha=b=>createHash('sha256').update(b).digest('hex');
const s=JSON.parse(await readFile(`${docs}/timestep-convergence-native-status.json`,'utf8'));
const mismatches=[];
for(const [path,expected] of Object.entries({...s.sourceAfter,...s.inputsAfter})){
 const actual=sha(await readFile(path));if(actual!==expected)mismatches.push({path,expected,actual});
}
const resultPath=`${docs}/timestep-convergence-bindings.json`,bindings=[];
for(const dir of [docs,build])for(const n of (await readdir(dir)).sort())if(n.startsWith('timestep-convergence')){
 const path=`${dir}/${n}`;if(path===resultPath)continue;const bytes=await readFile(path);
 bindings.push({path,bytes:bytes.length,sha256:sha(bytes)});
}
const result={createdUTC:new Date().toISOString(),passed:mismatches.length===0,dependencyCount:Object.keys(s.sourceAfter).length,
 inputCount:Object.keys(s.inputsAfter).length,mismatches,bindings};
await writeFile(resultPath,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
if(!result.passed)process.exitCode=1;
