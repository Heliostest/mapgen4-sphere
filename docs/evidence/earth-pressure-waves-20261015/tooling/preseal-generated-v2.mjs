import {readFile,writeFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {verifySource} from '../../docs/evidence/earth-pressure-waves-20261015/verify-source.mjs';
const folder='docs/evidence/earth-pressure-waves-20261015',out='build/earth-pressure-waves';
const hash=b=>createHash('sha256').update(b).digest('hex'),read=async p=>JSON.parse(await readFile(p,'utf8'));
try{await readFile(`${folder}/manifest.json`);throw new Error('C11 already sealed');}catch(e){if(e.code!=='ENOENT')throw e;}
async function walk(dir){const files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=`${dir}/${e.name}`;if(e.isDirectory())files.push(...await walk(p));else files.push(p);}return files;}
const previous={path:'docs/evidence/earth-metric-moments-20261014/manifest.json',sha256:'22c04edfa46f742bec47ada6eb1cdf70dc8cd9e839198238be1f7ca2f883de8f'};
let ancestor=previous;const preserved=[];
while(ancestor?.path){
 assert.equal(hash(await readFile(ancestor.path)),ancestor.sha256);const m=await read(ancestor.path);
 const directory=ancestor.path.slice(0,-14);
 assert.deepEqual((await walk(directory)).sort(),[ancestor.path,...m.bindings.filter(b=>b.path.startsWith(directory+'/')).map(b=>b.path)].sort());
 for(const b of m.bindings)assert.equal(hash(await readFile(b.path)),b.sha256,b.path);
 preserved.push(ancestor);ancestor=m.previous;
}
const preservation=JSON.parse(execFileSync(process.execPath,['docs/evidence/earth-native-graph-wind-20261014/check-frozen.mjs'],{encoding:'utf8'}));
assert(preservation.passed&&preservation.formalDefaultUnchanged);
assert(!(await walk(folder)).some(p=>p.includes('/__pycache__/')));
const selected=await read(`${folder}/selected-runs.json`),statuses=new Map(),attempts=[];
for(const file of (await readdir(out)).filter(n=>n.endsWith('-status.json')).sort()){
 const s=await read(`${out}/${file}`);assert(['passed','failed'].includes(s.state)&&s.completedUTC&&s.sourceUnchanged&&s.inputUnchanged,s.name);
 for(const [p,d] of Object.entries(s.sourceBefore))assert.equal(hash(await readFile(`${folder}/source-archives/${d}/${basename(p)}`)),d,p);
 for(const [p,d] of Object.entries(s.inputBefore))assert.equal(hash(await readFile(p)),d,p);
 for(const [p,d] of Object.entries(s.outputHashes))assert.equal(hash(await readFile(p)),d,p);
 statuses.set(s.name,s);attempts.push({name:s.name,state:s.state,code:s.code});
}
let juliaAssertions=0;
for(const name of Object.values(selected)){
 const s=statuses.get(name);assert(s);await verifySource(s);assert((await read(`${out}/${name}.json`)).passed);
 const matches=[...(await readFile(`${out}/${name}.log`,'utf8')).matchAll(/^C11 .*\|\s+(\d+)\s+(\d+)\s+.+$/gm)];
 assert.equal(matches.length,1);assert.equal(matches[0][1],matches[0][2]);juliaAssertions+=Number(matches[0][1]);
}
const waves=await read(`${out}/${selected.waves}.json`);assert(waves.passed&&waves.rows.length===216&&waves.periods===2&&waves.commonAreaNorm&&waves.diagnosticLinearization&&!waves.changesDynamics);
const cases=new Set();
for(const r of waves.rows){
 assert([24,48,96].includes(r.rings)&&['c9','c10'].includes(r.model)&&[1,3,5].includes(r.degree)&&[64,128,256].includes(r.nper)&&[1,2].includes(r.axis)&&['standing','traveling'].includes(r.kind));
 const key=JSON.stringify([r.rings,r.model,r.degree,r.nper,r.axis,r.kind]);assert(!cases.has(key));cases.add(key);
 assert.equal(r.trace.length,2*r.nper+1);assert.equal(r.dt,r.period/r.nper);assert(Math.abs(r.period-2*Math.PI/Math.sqrt(r.degree*(r.degree+1)))<1e-14);
 for(const [k,t] of r.trace.entries()){
  assert(Object.values(t).every(Number.isFinite));assert(t.step===k&&t.time===k*r.dt&&t.amplitude>=0&&t.leakage>=0&&t.pressureError>=0&&t.energyDrift>=0&&t.meanDrift>=0);
  assert(Math.abs(t.phaseError-(t.phase-Math.sqrt(r.degree*(r.degree+1))*t.time))<1e-12);
  if(k)assert(Math.abs(t.phase-r.trace[k-1].phase)<Math.PI);
 }
 for(const [key,get] of [['maxEnergyDrift',t=>t.energyDrift],['maxMeanDrift',t=>t.meanDrift],['maxPressureError',t=>t.pressureError],['maxLeakage',t=>t.leakage],['maxAmplitudeError',t=>Math.abs(t.amplitude-1)]])assert.equal(r[key],Math.max(...r.trace.map(get)));
 assert.equal(r.finalPhaseError,r.trace.at(-1).phaseError);assert.equal(r.endpointPressureError,r.trace.at(-1).pressureError);
 assert(r.maxEnergyDrift<1e-9&&r.maxMeanDrift<1e-10);
}
for(const nr of [24,48,96]){
 const rows=waves.rows.filter(r=>r.rings===nr&&r.nper===256);
 assert(Math.max(...rows.filter(r=>r.model==='c10').map(r=>r.maxPressureError))<=1.10*Math.max(...rows.filter(r=>r.model==='c9').map(r=>r.maxPressureError))+1e-7);
 for(const model of ['c9','c10']){const p=`${out}/${selected.waves}-${nr}-${model}-endpoints.bin`;assert.equal(statuses.get(selected.waves).outputHashes[p],hash(await readFile(p)));}
}
const reference=await read(`${out}/${selected.reference}.json`);assert.equal(reference.rows.length,12);
for(const model of ['c9','c10'])for(const variable of [false,true]){
 const rows=reference.rows.filter(r=>r.model===model&&r.variable===variable);assert.deepEqual(rows.map(r=>r.nper),[64,128,256]);
 for(const key of ['pressure','velocity']){const [a,b,c]=rows.map(r=>r.error[key]);assert(a>b&&b>c&&c>0&&b/c>3.7&&b/c<4.3);}
}
const nonlinear=await read(`${out}/${selected.nonlinear}.json`);assert(nonlinear.rows.length===10&&nonlinear.frozenC9Dynamics&&nonlinear.linearizedLimit&&!nonlinear.internalGravityWaves);
for(let i=0;i<10;i+=2){
 const [a,b]=nonlinear.rows.slice(i,i+2);assert(a.amplitude===.001&&b.amplitude===.0001);
 for(const key of ['nr','model','variable','nper','dt'])assert.equal(a[key],b[key]);
 assert(a.nr===(i===8?48:24)&&a.nper===(i===8?128:64));
 assert(a.model===(i<4?'c9':'c10')&&a.variable===([2,6].includes(i)));
 for(const key of ['pressure','velocity'])assert(b.error[key]>0&&b.error[key]<a.error[key]/5);
 for(const r of [a,b]){
  assert(r.rejections===0&&r.minimumPressure>0&&r.constantHumidityError<1e-11&&r.layerSpread<1e-12&&r.steps===r.nper&&r.trace.length===r.steps);
  for(const [k,t] of r.trace.entries()){
   assert(Object.values(t).every(Number.isFinite));assert(t.step===k+1&&t.dt===r.dt&&Math.abs(t.time-(k+1)*r.dt)<1e-12);
   for(const key of ['firstIterations','lastIterations','pressureIterations','pressureBacktracks'])assert(Number.isInteger(t[key])&&t[key]>=0);
   assert(t.firstIterations<=400&&t.lastIterations<=400&&t.pressureIterations<=30&&t.pressureResidual>=0&&t.pressureResidual<=2e-14);
   for(const key of ['firstEquation','lastEquation','pressureEquation','localAirRelativeResidual','localWaterRelativeResidual','localDryRelativeResidual'])assert(t[key]>=0&&t[key]<5e-12);
   assert(t.completeEnergyAbsolute>=0&&t.completeEnergyAbsolute<=t.completeEnergyAllowance&&Math.abs(t.qmin-.012)<1e-11&&Math.abs(t.qmax-.012)<1e-11);
  }
 }
}
const source=await read(`${out}/c11-source-v1.json`);assert(source.passed&&source.checks===14);
for(const [p,d] of Object.entries(source.sourceHashes))assert.equal(hash(await readFile(p)),d,p);
const project=await read(`${out}/project-checks.json`);assert(project.passed&&project.tests===278&&project.rows.every(r=>r.code===0));
for(const r of project.rows)assert.equal(hash(await readFile(r.log)),r.sha256,r.log);
for(const file of ['summary-provenance.json','plot-provenance.json']){
 const r=await read(`${out}/${file}`);assert(r.passed);
 for(const key of ['sourceHashes','inputHashes','outputHashes'])for(const [p,d] of Object.entries(r[key]))assert.equal(hash(await readFile(p)),d,p);
}

console.log(JSON.stringify({passed:true,juliaAssertions,preserved:preserved.length}));
