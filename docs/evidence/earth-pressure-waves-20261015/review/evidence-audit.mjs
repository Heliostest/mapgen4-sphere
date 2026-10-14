import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const out='build/earth-pressure-waves',dir='docs/evidence/earth-pressure-waves-20261015',audit='build/c11-independent-review';
const read=async p=>JSON.parse(await readFile(p,'utf8')),sha=b=>createHash('sha256').update(b).digest('hex');
let checks=0;const check=(x,msg)=>{checks++;assert(x,msg);},same=(a,b,msg)=>{checks++;assert.deepEqual(a,b,msg);},close=(a,b,tol=1e-12)=>check(Math.abs(a-b)<=tol,`${a} vs ${b}`);
const selection=await read(dir+'/selected-runs.json'),waves=await read(`${out}/${selection.waves}.json`),reference=await read(`${out}/${selection.reference}.json`),nonlinear=await read(`${out}/${selection.nonlinear}.json`),summary=await read(out+'/summary.json');
const names=['rings','degree','axis','kind','nper'],key=r=>names.map(n=>r[n]).join('|'),metrics=['finalPhaseError','maxAmplitudeError','maxPressureError','maxLeakage'];
const expected=new Set();for(const rings of [24,48,96])for(const model of ['c9','c10'])for(const degree of [1,3,5])for(const nper of [64,128,256])for(const axis of [1,2])for(const kind of ['standing','traveling'])expected.add(`${model}|${key({rings,degree,axis,kind,nper})}`);
const seen=new Set();let traceSamples=0;
for(const r of waves.rows){
 const k=`${r.model}|${key(r)}`;check(expected.has(k)&&!seen.has(k));seen.add(k);
 same(r.trace.length,2*r.nper+1);close(r.period,2*Math.PI/Math.sqrt(r.degree*(r.degree+1)));same(r.dt,r.period/r.nper);
 let last=0;
 for(const [i,t] of r.trace.entries()){
  check(Object.values(t).every(Number.isFinite));same(t.step,i);same(t.time,i*r.dt);
  close(t.phaseError,t.phase-Math.sqrt(r.degree*(r.degree+1))*t.time);
  check(Math.abs(t.phase-last)<Math.PI);last=t.phase;
  check(t.amplitude>=0&&t.leakage>=0&&t.pressureError>=0&&t.energyDrift>=0&&t.meanDrift>=0);
  traceSamples++;
 }
 close(r.trace[0].phase,0);close(r.trace[0].amplitude,1);close(r.trace[0].pressureError,0);close(r.trace[0].leakage,0);
 same(r.finalPhaseError,r.trace.at(-1).phaseError);same(r.relativeFrequencyBias,r.finalPhaseError/(4*Math.PI));same(r.endpointPressureError,r.trace.at(-1).pressureError);
 for(const [s,t,transform] of [['maxAmplitudeError','amplitude',v=>Math.abs(v-1)],['maxPressureError','pressureError',v=>v],['maxLeakage','leakage',v=>v],['maxEnergyDrift','energyDrift',v=>v],['maxMeanDrift','meanDrift',v=>v]])same(r[s],Math.max(...r.trace.map(row=>transform(row[t]))));
 check(r.maxEnergyDrift<1e-9&&r.maxMeanDrift<1e-10);
}
same(seen.size,216);same(summary.cases,216);
const pairs=[],regressions=[];
for(const a of waves.rows.filter(r=>r.model==='c9')){
 const b=waves.rows.find(r=>r.model==='c10'&&key(a)===key(r));check(b);
 const p=Object.fromEntries(names.map(n=>[n,a[n]]));
 for(const metric of metrics){p['c9_'+metric]=a[metric];p['c10_'+metric]=b[metric];if(Math.abs(b[metric])>Math.abs(a[metric]))regressions.push({...Object.fromEntries(names.map(n=>[n,a[n]])),metric,before:Math.abs(a[metric]),after:Math.abs(b[metric]),increase:Math.abs(b[metric])-Math.abs(a[metric]),ratio:Math.abs(a[metric])?Math.abs(b[metric])/Math.abs(a[metric]):null});}
 pairs.push(p);
}
for(const [file,rows] of [['wave-comparison.csv',pairs],['wave-regressions.csv',regressions]]){
 const csv=(await readFile(out+'/'+file,'utf8')).trim().split('\n'),headers=csv.shift().split(',');same(csv.length,rows.length);same(headers,Object.keys(rows[0]));
 for(let i=0;i<rows.length;i++)same(csv[i].split(','),headers.map(h=>rows[i][h]===null?'':String(rows[i][h])));
}
same(summary.pairs,pairs.length);
for(const entry of summary.regressions){const rows=regressions.filter(r=>r.metric===entry.metric);same(entry.count,rows.length);same(entry.fineCount,rows.filter(r=>r.nper===256).length);same(entry.materialCount,rows.filter(r=>r.increase>1e-10).length);same(entry.worst,rows.reduce((a,b)=>a.increase>b.increase?a:b));}
for(const entry of summary.grid){
 for(const model of ['c9','c10'])for(const metric of metrics)same(entry[`${model}_${metric}`],Math.max(...waves.rows.filter(r=>r.rings===entry.rings&&r.model===model&&r.nper===256).map(r=>Math.abs(r[metric]))));
 check(entry.c10_maxPressureError<=1.1*entry.c9_maxPressureError+1e-7);
}
for(const model of ['c9','c10'])for(const variable of [false,true]){
 const rows=reference.rows.filter(r=>r.model===model&&r.variable===variable).sort((a,b)=>a.nper-b.nper);same(rows.map(r=>r.nper),[64,128,256]);
 const sr=summary.refinement.find(r=>r.model===model&&r.variable===variable);
 for(const metric of ['pressure','velocity']){const values=rows.map(r=>r.error[metric]);check(values.every(Number.isFinite)&&values[0]>values[1]&&values[1]>values[2]&&values[2]>0);const ratio=values[1]/values[2];check(ratio>3.7&&ratio<4.3);same(sr[metric+'Ratio'],ratio);}
}
let nonlinearSteps=0,maxNormalizedPressureSolverFloor=0,minNonlinearDiscrepancy=Infinity;
for(const r of nonlinear.rows){
 same(r.trace.length,r.steps);same(r.nper,r.steps);same(r.rejections,0);check(r.minimumPressure>0&&r.constantHumidityError<1e-11&&r.layerSpread<1e-12);
 for(const [i,t] of r.trace.entries()){
  check(Object.values(t).every(Number.isFinite));same(t.step,i+1);close(t.time,(i+1)*r.dt);same(t.dt,r.dt);
  check(t.pressureResidual>=0&&t.pressureResidual<=2e-14&&t.completeEnergyAbsolute<=t.completeEnergyAllowance);
  for(const name of ['localAirRelativeResidual','localWaterRelativeResidual','localDryRelativeResidual','firstEquation','lastEquation','pressureEquation'])check(t[name]>=0&&t[name]<5e-12);
  for(const name of ['firstIterations','pressureIterations','lastIterations','pressureBacktracks'])check(Number.isInteger(t[name])&&t[name]>=0);
  check(t.firstIterations<=400&&t.lastIterations<=400&&t.pressureIterations<=30);check(Math.abs(t.qmin-.012)<1e-11&&Math.abs(t.qmax-.012)<1e-11);
  maxNormalizedPressureSolverFloor=Math.max(maxNormalizedPressureSolverFloor,t.pressureResidual/r.amplitude);nonlinearSteps++;
 }
 minNonlinearDiscrepancy=Math.min(minNonlinearDiscrepancy,r.error.pressure,r.error.velocity);
}
const nonlinearSettings=new Map();for(const r of nonlinear.rows){const k=[r.nr,r.model,r.variable,r.nper].join('|');if(!nonlinearSettings.has(k))nonlinearSettings.set(k,[]);nonlinearSettings.get(k).push(r);}
same(nonlinearSettings.size,5);for(const rows of nonlinearSettings.values()){rows.sort((a,b)=>b.amplitude-a.amplitude);same(rows.map(r=>r.amplitude),[.001,.0001]);const [a,b]=rows;const sr=summary.amplitude.find(r=>r.rings===a.nr&&r.model===a.model&&r.variable===a.variable);check(sr);for(const metric of ['pressure','velocity']){check(a.error[metric]/b.error[metric]>5);same(sr[metric+'Ratio'],a.error[metric]/b.error[metric]);}}
same(summary.maxLinearEnergyDrift,Math.max(...waves.rows.map(r=>r.maxEnergyDrift)));same(summary.maxLinearMeanDrift,Math.max(...waves.rows.map(r=>r.maxMeanDrift)));same(summary.maxNonlinearEnergyDrift,Math.max(...nonlinear.rows.map(r=>r.energyDrift)));
const attempts=[];for(const file of (await readdir(out)).filter(n=>n.endsWith('-status.json'))){
 const s=await read(out+'/'+file);check(s.completedUTC&&s.sourceUnchanged&&s.inputUnchanged);same(s.sourceBefore,s.sourceAfter);same(s.inputBefore,s.inputAfter);
 for(const [p,h] of Object.entries(s.sourceBefore)){const archived=`${dir}/source-archives/${h}/${p.split('/').at(-1)}`;same(sha(await readFile(archived)),h);if(s.state==='passed')same(sha(await readFile(p)),h);}
 for(const [p,h] of Object.entries(s.inputBefore))same(sha(await readFile(p)),h);
 for(const [p,h] of Object.entries(s.outputHashes))same(sha(await readFile(p)),h);
 attempts.push({name:s.name,state:s.state,code:s.code});
}
same(attempts.length,7);for(const name of Object.values(selection))check(attempts.some(a=>a.name===name&&a.state==='passed'&&a.code===0));
const preserved=[];let ancestor={path:'docs/evidence/earth-metric-moments-20261014/manifest.json',sha256:'22c04edfa46f742bec47ada6eb1cdf70dc8cd9e839198238be1f7ca2f883de8f'};
while(ancestor?.path){same(sha(await readFile(ancestor.path)),ancestor.sha256);const m=await read(ancestor.path);for(const b of m.bindings)same(sha(await readFile(b.path)),b.sha256);preserved.push({path:ancestor.path,bindings:m.bindings.length});ancestor=m.previous;}
for(const file of ['summary-provenance.json']){const p=await read(out+'/'+file);check(p.passed);for(const k of ['sourceHashes','inputHashes','outputHashes'])for(const [f,h] of Object.entries(p[k]))same(sha(await readFile(f)),h);}
const project=await read(out+'/project-checks.json');check(project.passed&&project.tests===278);for(const row of project.rows){same(row.code,0);same(sha(await readFile(row.log)),row.sha256);}
const frozen=JSON.parse(execFileSync(process.execPath,['docs/evidence/earth-native-graph-wind-20261014/check-frozen.mjs'],{encoding:'utf8'}));check(frozen.passed&&frozen.formalDefaultUnchanged);
const result={passed:true,checks,traceSamples,pairs:pairs.length,regressions:regressions.length,regressionCounts:Object.fromEntries(metrics.map(m=>[m,regressions.filter(r=>r.metric===m).length])),nonlinearSteps,maxNormalizedPressureSolverFloor,minNonlinearDiscrepancy,attempts,preserved,frozen};
await writeFile(`${audit}/${process.env.AUDIT_NAME}.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result,null,2));
