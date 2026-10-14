import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const docs='docs/evidence/earth-speedy-transport-20261013',build='build/earth-speedy-transport';
const sha=b=>createHash('sha256').update(b).digest('hex');
const json=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
const expected=new Map(),runs=[];
for(const label of ['green','thermal-window','all-window','startup-probe','v2-green','v2-startup-probe']){
 const path=`${docs}/implicit-split-${label}-native-status.json`,s=await json(path);
 if(s.code!==0||!s.sourceUnchanged||!s.inputsUnchanged)throw Error(`Unsuccessful run ${path}`);
 runs.push({path,code:s.code,sourceUnchanged:s.sourceUnchanged,inputsUnchanged:s.inputsUnchanged});
 for(const [p,h]of Object.entries({...s.sourceAfter,...s.inputsAfter}))expected.set(p,h);
}
for(const name of ['thermal','all']){
 const d=await json(`${build}/implicit-split-${name}-window.json`);expected.set(d.input,d.inputSHA);
}
const old=await json(`${docs}/implicit-instability-bindings.json`);
for(const b of old.bindings)expected.set(b.path,b.sha256);
const draft=await json(`${docs}/implicit-split-startup-red-status.json`);
const draftHash=draft.before[`${docs}/implicit-split-v2-test.jl`];
expected.set(`${docs}/source-archives/${draftHash}/implicit-split-v2-test.jl`,draftHash);
let nativeSourceCount=0;
const frozen=await json('docs/evidence/earth-speedy-moisture-monsoon-20261013/manifest.json');
for(const b of frozen.bindings)if(b.path.replaceAll('\\','/').includes('build/earth-speedyweather/depot/packages/SpeedyWeather/qRu16/src/')){
 expected.set(b.path,b.sha256);nativeSourceCount++;
}
const mismatches=[];
for(const [path,hash]of expected){const actual=sha(await readFile(path));if(actual!==hash)mismatches.push({path,expected:hash,actual});}
const target=`${docs}/implicit-split-bindings.json`,bindings=[];
for(const dir of [docs,build])for(const name of (await readdir(dir)).sort())if(name.startsWith('implicit-split-')){
 const path=`${dir}/${name}`;if(path===target)continue;const bytes=await readFile(path);
 bindings.push({path,bytes:bytes.length,sha256:sha(bytes)});
}
const result={createdUTC:new Date().toISOString(),passed:mismatches.length===0,nativeSourceCount,
 verifiedDependencies:expected.size,runs,mismatches,bindings,
 note:'Earlier test draft named startup-red passed and is not acceptance/RED evidence. Its source hash is archived. Real startup RED is the unchanged-V2 shadow mismatch assertion. All independent reviewer evidence is separately owned and bound by that reviewer.'};
await writeFile(target,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:result.passed,nativeSourceCount,verifiedDependencies:expected.size,newBindings:bindings.length,mismatches}));
if(!result.passed)process.exitCode=1;
