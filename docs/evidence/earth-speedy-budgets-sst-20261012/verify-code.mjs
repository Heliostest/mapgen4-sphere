import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-speedy-budgets-sst-20261012';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function run(name,args){
 let output='';const child=spawn(process.execPath,args,{windowsHide:true});
 child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
 await writeFile(`${folder}/${name}.log`,output);console.log(`${name}: exit ${code}\n${output.slice(-700)}`);
 assert.equal(code,0,name);return {name,code};
}
const results=await Promise.all([
 run('repo-test',['scripts/test.mjs']),run('repo-typecheck',['node_modules/typescript/bin/tsc','--noEmit']),
 run('moisture-test',['--test',`${folder}/moisture-diagnostic.test.mjs`]),
 run('remap-test',['--test','docs/evidence/earth-speedyweather-20261012/remap.test.mjs']),
 run('viewer-test',[`${folder}/build-viewer.mjs`,'--test']),
 run('viewer-typecheck',['node_modules/typescript/bin/tsc','--ignoreConfig','--noEmit','--strict','false','--target','es2022','--module','esnext','--moduleResolution','bundler','--allowImportingTsExtensions','--skipLibCheck','--lib','dom,webworker,es2022',`${folder}/preview.ts`,`${folder}/comparison-contract.ts`]),
]);
results.push(await run('viewer-build',[`${folder}/build-viewer.mjs`]));
results.push(await run('viewer-bundle',[`${folder}/verify-bundle.mjs`]));
const formalSha=hash(await readFile('scenes/earth-land-sea/earth-simulation.json'));
assert.equal(formalSha,'afb80a8ab730785eed0cb709a66d938ad20a9690b04ecfa1246d1deb393adca6');
const defaults=[];
for(const [file,name] of [['thermal.ts','THERMAL'],['water.ts','WATER'],['environment.ts','ENVIRONMENT']]){
 const current=await readFile(file,'utf8'),head=execFileSync('git',['show',`HEAD:${file}`],{encoding:'utf8'});
 const pattern=new RegExp(`export const DEFAULT_${name}[^=]*=Object\\.freeze\\(\\{[\\s\\S]*?\\}\\);`);
 const a=current.match(pattern)?.[0],b=head.match(pattern)?.[0];assert(a&&b);assert.equal(a,b);defaults.push({file,name,sha256:hash(a),unchanged:true});
}
const old=JSON.parse(await readFile('docs/evidence/earth-speedyweather-20261012/manifest.json','utf8'));
for(const b of old.bindings)assert.equal(hash(await readFile(b.path)),b.sha256,`Old evidence modified: ${b.path}`);
await writeFile(`${folder}/code-verification.json`,JSON.stringify({createdUTC:new Date().toISOString(),results,formalSha256:formalSha,defaults,oldEvidenceBindingsVerified:old.bindings.length},null,2));
