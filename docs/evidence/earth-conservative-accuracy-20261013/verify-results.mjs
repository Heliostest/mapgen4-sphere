import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-conservative-accuracy-20261013',out='build/earth-conservative-accuracy';
const hash=b=>createHash('sha256').update(b).digest('hex');
const required=['c2-modal-green-01','c2-fct-krylov-green-01','c2-final-coupled','c2-final-sphere','c2-final-pressure-space','c2-final-1800','c2-final-900','c2-final-450','c2-final-upwind-1800','c2-final-analysis'];
const statuses=[];let archivedSourceBindings=0,inputBindings=0;
for(const name of (await readdir(out)).filter(p=>p.endsWith('-status.json')).sort()){
 const status=JSON.parse(await readFile(`${out}/${name}`,'utf8'));
 assert(!['running','preparing'].includes(status.state),`${name} still active`);
 for(const [p,h] of Object.entries(status.sourceBefore??{})){
  assert.equal(hash(await readFile(`${folder}/source-archives/${h}/${basename(p)}`)),h,`${name}: archived ${p}`);archivedSourceBindings++;
 }
 for(const [p,h] of Object.entries(status.inputBefore??{})){
  assert.equal(hash(await readFile(p)),h,`${name}: input ${p}`);inputBindings++;
 }
 if(required.includes(status.name)){
  assert.equal(status.state,'passed',status.name);assert.equal(status.code,0,status.name);
  assert(status.sourceUnchanged&&status.inputUnchanged,status.name);
  // Bind the numerical implementation currently present as well as its archive.
  for(const [p,h] of Object.entries(status.sourceBefore)){
   if(p.endsWith('/modal-core.jl')||p.endsWith('/fct-transport.jl')||p.endsWith('/fct-core.jl'))assert.equal(hash(await readFile(p)),h,p);
  }
 }
 statuses.push({name:status.name,state:status.state,code:status.code,sourceUnchanged:status.sourceUnchanged,inputUnchanged:status.inputUnchanged});
}
for(const name of required)assert(statuses.some(s=>s.name===name),name);
for(const name of ['c2-acoustic-red','c2-transport-red'])assert(statuses.some(s=>s.name===name&&s.code===1),name);
const a=JSON.parse(await readFile(`${out}/c2-final-analysis.json`,'utf8'));
assert(a.humidityAdjacentDifferenceDecreases&&a.samePressureAcrossTransportAlgorithms&&a.allTracersSamePressure);
assert(!a.strongPolarAccuracy&&!a.fullPhysicalCoupling&&!a.climateAcceptance);
for(const [p,h] of Object.entries(a.inputs))assert.equal(hash(await readFile(p)),h,p);
const result={verifiedUTC:new Date().toISOString(),passed:true,requiredRuns:required,archivedSourceBindings,inputBindings,statuses,acceptance:{fixedLinearPressureTimeAccuracy:true,sharedMassWaterConservation:true,globalTracerBounds:true,ownStateRestart:true,smoothRingSecondOrderEvidence:true,sphericalRotationAccuracyImproved:true,nativeHumidityAdjacentDifferenceDecreases:true,strongPolarPressureAccuracy:false,fullPhysicalCoupling:false,climate:false,formalDefaultPromoted:false},note:'Development native runs with approximate c2 and interrupted FCT runs are preserved but excluded from final acceptance.'};
await writeFile(`${folder}/verification.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,archivedSourceBindings,inputBindings,runs:statuses.length,acceptance:result.acceptance}));
