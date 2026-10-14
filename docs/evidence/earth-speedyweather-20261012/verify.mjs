import {spawn} from 'node:child_process';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-speedyweather-20261012';
async function run(name,args){
 let output='';const child=spawn(process.execPath,args,{windowsHide:true});
 child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
 await writeFile(`${folder}/${name}.log`,output);console.log(`${name}: exit ${code}\n${output.slice(-800)}`);
 assert.equal(code,0,name);return {name,code};
}
const results=await Promise.all([
 run('repo-test',['scripts/test.mjs']),
 run('repo-typecheck',['node_modules/typescript/bin/tsc','--noEmit']),
 run('remap-test',['--test',`${folder}/remap.test.mjs`]),
 run('viewer-test',[`${folder}/build-viewer.mjs`,'--test']),
 run('viewer-typecheck',['node_modules/typescript/bin/tsc','--ignoreConfig','--noEmit','--strict','false','--target','es2022','--module','esnext','--moduleResolution','bundler','--allowImportingTsExtensions','--skipLibCheck','--lib','dom,webworker,es2022',`${folder}/preview.ts`,`${folder}/display-contract.ts`]),
]);
results.push(await run('repo-build',['scripts/build.mjs']));
results.push(await run('viewer-build',[`${folder}/build-viewer.mjs`]));
results.push(await run('viewer-bundle',[`${folder}/verify-bundle.mjs`]));
const sha=createHash('sha256').update(await readFile('scenes/earth-land-sea/earth-simulation.json')).digest('hex');
assert.equal(sha,'afb80a8ab730785eed0cb709a66d938ad20a9690b04ecfa1246d1deb393adca6');
await writeFile(`${folder}/code-verification.json`,JSON.stringify({createdUTC:new Date().toISOString(),results,formalSha256:sha},null,2));
