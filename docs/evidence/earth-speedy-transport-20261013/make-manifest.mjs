import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-speedy-transport-20261013',out='build/earth-speedy-transport';
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
assert(process.argv.includes('--finalize'),'Only finalize after all intended runs and reviews have stopped.');
const comparison=await read(`${folder}/sensitivity-comparison.json`);
const startupAudits=[];
for(const physicsFix of ['combined','all-corrections','all-corrections-split-reference']){
 const path=`${out}/audit-${physicsFix}.json`;
 try{
  const cases=await read(path);
  startupAudits.push({path,physicsFix,thresholdMm:.05,modes:cases.map(c=>({mode:c.mode,initialSHA:c.initialSHA,
   calls:c.steps.length,maxDiscreteResidualMm:c.maxDiscreteResidualMm,
   stepsOverOriginalPointZeroFive:c.stepsOverOriginalPointZeroFive,
   pointwiseWaterPassed:c.stepsOverOriginalPointZeroFive===0&&c.maxDiscreteResidualMm<=.05}))});
 }catch(e){if(e.code!=='ENOENT')throw e;}
}
const statuses=[];
for(const file of (await readdir(folder)).filter(f=>f.endsWith('-native-status.json'))){
 const s=await read(`${folder}/${file}`);
 statuses.push({file:`${folder}/${file}`,code:s.code,script:s.script,configuration:s.configuration,sourceUnchanged:s.sourceUnchanged,inputsUnchanged:s.inputsUnchanged});
}
for(const c of comparison.cases){
 const status=statuses.find(s=>s.file.endsWith(`/${c.prefix}-native-status.json`));
 assert(status&&status.code===0&&status.sourceUnchanged&&status.inputsUnchanged,c.prefix);
}
async function walk(p){let files=[];for(const d of await readdir(p,{withFileTypes:true})){const path=`${p}/${d.name}`;if(d.isDirectory())files.push(...await walk(path));else files.push(path);}return files;}
const excluded=new Set([`${folder}/manifest.json`,`${folder}/verification.json`]);
const paths=[...await walk(folder),...await walk(out)].filter(p=>!excluded.has(p)).sort();
const bindings=[];
for(const path of paths){const bytes=await readFile(path);bindings.push({path,bytes:bytes.length,sha256:hash(bytes)});}
const formal='scenes/earth-land-sea/earth-simulation.json',old='docs/evidence/earth-speedy-moisture-monsoon-20261013/manifest.json';
const defaults=[];
for(const [path,name] of [['thermal.ts','DEFAULT_THERMAL'],['water.ts','DEFAULT_WATER'],['environment.ts','DEFAULT_ENVIRONMENT']]){
 const extract=source=>{const match=source.match(new RegExp('export const '+name+'[^=]*=Object\\.freeze\\(\\{[\\s\\S]*?\\}\\);'));assert(match,name);return match[0].replaceAll('\r\n','\n');};
 const current=extract(await readFile(path,'utf8')),head=extract(execFileSync('git',['show',`HEAD:${path}`],{encoding:'utf8',windowsHide:true}));
 assert.equal(current,head,name);defaults.push({path,name,sha256:hash(current)});
}
const manifest={createdUTC:new Date().toISOString(),head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),
 software:{julia:'1.12.7',SpeedyWeather:'0.23.0',node:process.version},
 formalPath:formal,formalSHA256:hash(await readFile(formal)),formalDefaultPromoted:false,defaultDeclarations:defaults,
 previousManifest:{path:old,sha256:hash(await readFile(old))},
 experimentNotes:['Native red tests and candidate failures are retained; evidence integrity is distinct from physics or climate acceptance.',
 'All build artifacts are retained and bound, including failed-run initial checkpoints and progress. Only completed candidates appear in the comparison.',
 'Seven-and-a-half-minute startup sensitivity does not replace the thirty-minute climate protocol.'],
 completedCandidates:comparison.cases.map(c=>({prefix:c.prefix,physicsFix:c.physicsFix,stage:c.stage,calls:c.calls,monsoonPassed:c.monsoonPassed,waterPassed:c.waterPassed,landWaterPassed:c.landWaterPassed,dryAirMassPassed:c.dryAirMassPassed,fullBudgetChecks:c.fullBudgetChecks})),
 startupAudits,
 nativeExecutions:statuses,bindings};
await writeFile(`${folder}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
console.log({bindings:bindings.length,completedCandidates:comparison.cases.length,manifestSHA256:hash(await readFile(`${folder}/manifest.json`))});
