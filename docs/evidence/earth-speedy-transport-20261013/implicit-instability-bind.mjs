import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const docs='docs/evidence/earth-speedy-transport-20261013',build='build/earth-speedy-transport';
const sha=b=>createHash('sha256').update(b).digest('hex');
const load=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
const expected=new Map(),runs=[];
for(const label of ['thermal-v2','all-v2','thermal-window','all-window']){
 const path=`${docs}/implicit-instability-${label}-native-status.json`,s=await load(path);
 runs.push({path,code:s.code,sourceUnchanged:s.sourceUnchanged,inputsUnchanged:s.inputsUnchanged});
 if(s.code!==0||!s.sourceUnchanged||!s.inputsUnchanged)throw Error(`Unsuccessful diagnostic ${path}`);
 for(const [p,h] of Object.entries({...s.sourceAfter,...s.inputsAfter}))expected.set(p,h);
}
for(const label of ['thermal','all']){
 const r=await load(`${build}/implicit-instability-${label}-v2.json`);
 expected.set(r.initial.path,r.initial.inputSHA);
 const w=await load(`${build}/implicit-instability-${label}-window.json`);
 expected.set(w.source,w.sourceSHA);expected.set(w.baseline,w.baselineSHA);
 if(w.exactExtremaComparisons!==194)throw Error('Incomplete native-only window validation');
}
const frozen=await load('docs/evidence/earth-speedy-moisture-monsoon-20261013/manifest.json');
const native='build/earth-speedyweather/depot/packages/SpeedyWeather/qRu16/src/';
let nativeSourceCount=0;
for(const b of frozen.bindings)if(b.path.replaceAll('\\','/').includes(native)){expected.set(b.path,b.sha256);nativeSourceCount++;}
const mismatches=[];
for(const [path,hash] of expected){const actual=sha(await readFile(path));if(hash!==actual)mismatches.push({path,expected:hash,actual});}
const resultPath=`${docs}/implicit-instability-bindings.json`,bindings=[];
for(const dir of [docs,build])for(const n of (await readdir(dir)).sort())if(n.startsWith('implicit-instability-')){
 const path=`${dir}/${n}`;if(path===resultPath)continue;const bytes=await readFile(path);
 bindings.push({path,bytes:bytes.length,sha256:sha(bytes)});
}
const result={createdUTC:new Date().toISOString(),passed:mismatches.length===0,
 note:'Code 0 means a source-preserving diagnostic reproduced the instability; it does not mean model stability acceptance.',
 verifiedDependencies:expected.size,nativeSourceCount,runs,mismatches,bindings};
await writeFile(resultPath,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:result.passed,verifiedDependencies:expected.size,nativeSourceCount,newBindings:bindings.length,mismatches}));
if(!result.passed)process.exitCode=1;
