import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const docs='docs/evidence/earth-speedy-transport-20261013',build='build/earth-speedy-transport';
const sha=b=>createHash('sha256').update(b).digest('hex');
const json=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
const expected=new Map(),runs=[];
for(const [name,code]of [['native-red',1],['projected-native-red',1],['prototype-green',1],['prototype-green-v2',0],['fields-verify',0]]){
 const path=`${docs}/wet-carrier-${name}-native-status.json`,s=await json(path);
 if(s.code!==code||!s.sourceUnchanged||!s.inputsUnchanged)throw Error(`Invalid run evidence ${path}`);
 runs.push({path,code:s.code,sourceUnchanged:s.sourceUnchanged,inputsUnchanged:s.inputsUnchanged});
 for(const [p,h]of Object.entries({...s.sourceAfter,...s.inputsAfter})){
  if(expected.has(p)&&expected.get(p)!==h)throw Error(`Conflicting source snapshots ${p}`);
  expected.set(p,h);
 }
}
for(const name of ['implicit-split','implicit-instability','timestep-convergence']){
 const path=`${docs}/${name}-bindings.json`,old=await json(path);expected.set(path,sha(await readFile(path)));
 for(const b of old.bindings)expected.set(b.path,b.sha256);
}
let nativeSourceCount=0;
const reviewPath=`${docs}/physics-moisture-carrier-review-bindings.json`;
const review=await json(reviewPath);expected.set(reviewPath,sha(await readFile(reviewPath)));
for(const [path,hash]of Object.entries(review.files))expected.set(path,hash);
const frozen=await json('docs/evidence/earth-speedy-moisture-monsoon-20261013/manifest.json');
for(const b of frozen.bindings)if(b.path.replaceAll('\\','/').includes('build/earth-speedyweather/depot/packages/SpeedyWeather/qRu16/src/')){
 expected.set(b.path,b.sha256);nativeSourceCount++;
}
const mismatches=[];
for(const [path,hash]of expected){const actual=sha(await readFile(path));if(actual!==hash)mismatches.push({path,expected:hash,actual});}
const target=`${docs}/wet-carrier-bindings.json`,bindings=[];
for(const dir of [docs,build])for(const name of (await readdir(dir)).sort())if(name.startsWith('wet-carrier-')){
 const path=`${dir}/${name}`;if(path===target)continue;const bytes=await readFile(path);
 bindings.push({path,bytes:bytes.length,sha256:sha(bytes)});
}
const result={createdUTC:new Date().toISOString(),passed:mismatches.length===0,nativeSourceCount,
 verifiedDependencies:expected.size,runs,mismatches,bindings,
 note:'Uncoupled source-free mechanism only. Native RED and nine coupling RED gates intentionally remain failures. First mechanism fixture 71/3 is retained; v2 92/92 uses the same inverse-pressure path without changing the helper or tolerances. No frozen climate run includes this prototype.'};
await writeFile(target,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:result.passed,nativeSourceCount,verifiedDependencies:expected.size,newBindings:bindings.length,mismatches}));
if(!result.passed)process.exitCode=1;
