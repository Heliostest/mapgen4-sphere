import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const folder='docs/evidence/earth-speedy-transport-20261013';
const old='docs/evidence/earth-speedy-moisture-monsoon-20261013';
const oldBuild='build/earth-speedy-moisture-monsoon';
const native='build/earth-speedyweather/depot/packages/SpeedyWeather/qRu16/src';
const result=`${folder}/startup-preservation-verification.json`;
const load=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest=await load(`${old}/manifest.json`);
const under=(path,prefix)=>path.replaceAll('\\','/').toLowerCase().includes(prefix.toLowerCase()+'/');
const entries=new Map();
for(const b of manifest.bindings)if([old,oldBuild,native].some(p=>under(b.path,p)))entries.set(b.path,b.sha256);
for(const a of manifest.archives){entries.set(a.path,a.sha256);entries.set(a.original,a.rawSha256);}
const mismatches=[];
for(const [path,expected] of entries){
  try{const actual=sha(await readFile(path));if(actual!==expected)mismatches.push({path,expected,actual});}
  catch(e){mismatches.push({path,error:String(e)});}
}
const runs=[];
for(const label of ['trace-split-slab','trace-split-seasonal','ledger-final-green','analysis-verification']){
  const path=`${folder}/startup-${label}-status.json`,s=await load(path);
  runs.push({path,code:s.code,sourceUnchanged:s.sourceUnchanged});
  if(s.code!==0||!s.sourceUnchanged)mismatches.push({path,error:'run did not pass source-preserving verification'});
}
const bindings=[];
for(const dir of [folder,'build/earth-speedy-transport']){
  for(const name of (await readdir(dir)).sort())if(name.startsWith('startup-')){
    const path=`${dir}/${name}`;if(path===result)continue;
    const bytes=await readFile(path);bindings.push({path,bytes:bytes.length,sha256:sha(bytes)});
  }
}
const output={createdUTC:new Date().toISOString(),passed:mismatches.length===0,
  frozenManifestPath:`${old}/manifest.json`,frozenManifestSHA256:sha(await readFile(`${old}/manifest.json`)),
  frozenBindingsVerified:entries.size,nativeSourceBindings:[...entries.keys()].filter(p=>under(p,native)).length,
  runs,mismatches,bindings};
await writeFile(result,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({passed:output.passed,frozenBindingsVerified:entries.size,nativeSourceBindings:output.nativeSourceBindings,mismatches,newBindings:bindings.length}));
if(!output.passed)process.exitCode=1;
