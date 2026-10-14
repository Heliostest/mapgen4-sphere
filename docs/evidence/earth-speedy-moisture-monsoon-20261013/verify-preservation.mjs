import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-speedy-moisture-monsoon-20261013';
const hash=b=>createHash('sha256').update(b).digest('hex');
const defaults=[];
for(const [file,name]of [['thermal.ts','THERMAL'],['water.ts','WATER'],['environment.ts','ENVIRONMENT']]){
 const text=await readFile(file,'utf8'),head=execFileSync('git',['show',`HEAD:${file}`],{encoding:'utf8'});
 const pattern=new RegExp(`export const DEFAULT_${name}[^=]*=Object\\.freeze\\(\\{[\\s\\S]*?\\}\\);`);
 const a=text.match(pattern)?.[0],b=head.match(pattern)?.[0];assert(a&&b);assert.equal(a,b);
 defaults.push({file,name,sha256:hash(a),unchanged:true});
}
const formalSha256=hash(await readFile('scenes/earth-land-sea/earth-simulation.json'));
assert.equal(formalSha256,'afb80a8ab730785eed0cb709a66d938ad20a9690b04ecfa1246d1deb393adca6');
const old=JSON.parse(await readFile('docs/evidence/earth-speedy-budgets-sst-20261012/manifest.json','utf8'));
for(const b of old.bindings)assert.equal(hash(await readFile(b.path)),b.sha256,`Frozen previous evidence changed: ${b.path}`);
for(const b of old.archives)assert.equal(hash(await readFile(b.path)),b.sha256,`Frozen previous archive changed: ${b.path}`);
const results=[];
for(const [name,args]of [
 ['viewer-typecheck',['node_modules/typescript/bin/tsc','--ignoreConfig','--noEmit','--strict','false','--target','es2022','--module','esnext','--moduleResolution','bundler','--allowImportingTsExtensions','--skipLibCheck','--lib','dom,webworker,es2022',`${folder}/preview.ts`,`${folder}/comparison-contract.ts`]],
 ['repository-typecheck',['node_modules/typescript/bin/tsc','--noEmit']],
]){
 const output=execFileSync(process.execPath,args,{encoding:'utf8',windowsHide:true});
 await writeFile(`${folder}/${name}.log`,output);results.push({name,exitCode:0});
}
const result={createdUTC:new Date().toISOString(),formalSha256,defaults,oldEvidenceBindingsVerified:old.bindings.length,oldArchivesVerified:old.archives.length,results,
 repositoryTests:{passed:278,failed:0,source:'Observed completed scripts/test.mjs execution earlier in this session (exit 0); not re-run by this script.'}};
await writeFile(`${folder}/preservation-verification.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
