import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-pressure-waves-20261015',out='build/earth-pressure-waves';
const read=async p=>JSON.parse(await readFile(p,'utf8')),hash=b=>createHash('sha256').update(b).digest('hex');
const selected=await read(`${folder}/selected-runs.json`),paths=['waves','reference','nonlinear'].map(k=>`${out}/${selected[k]}.json`);
const [waves,reference,nonlinear]=await Promise.all(paths.map(read));
assert(waves.passed&&reference.passed&&nonlinear.passed);
const metrics=['finalPhaseError','maxAmplitudeError','maxPressureError','maxLeakage'],pairs=[],regressions=[];
for(const old of waves.rows.filter(r=>r.model==='c9')){
 const r=waves.rows.find(r=>r.model==='c10'&&['rings','degree','axis','kind','nper'].every(k=>r[k]===old[k]));assert(r);
 const pair=Object.fromEntries(['rings','degree','axis','kind','nper'].map(k=>[k,r[k]]));
 for(const metric of metrics){pair[`c9_${metric}`]=old[metric];pair[`c10_${metric}`]=r[metric];const before=Math.abs(old[metric]),after=Math.abs(r[metric]);if(after>before)regressions.push({...Object.fromEntries(['rings','degree','axis','kind','nper'].map(k=>[k,r[k]])),metric,before,after,increase:after-before,ratio:before?after/before:null});}
 pairs.push(pair);
}
const max=(rows,f)=>Math.max(...rows.map(f));
const grid=[24,48,96].map(rings=>{const rows=waves.rows.filter(r=>r.rings===rings&&r.nper===256);return {rings,...Object.fromEntries(['c9','c10'].flatMap(m=>metrics.map(k=>[`${m}_${k}`,max(rows.filter(r=>r.model===m),r=>Math.abs(r[k]))])))};});
const refinement=[];for(const model of ['c9','c10'])for(const variable of [false,true]){const rows=reference.rows.filter(r=>r.model===model&&r.variable===variable);refinement.push({model,variable,pressureRatio:rows[1].error.pressure/rows[2].error.pressure,velocityRatio:rows[1].error.velocity/rows[2].error.velocity});}
const amplitude=[];for(let i=0;i<nonlinear.rows.length;i+=2){const a=nonlinear.rows[i],b=nonlinear.rows[i+1];amplitude.push({rings:a.nr,model:a.model,variable:a.variable,pressureRatio:a.error.pressure/b.error.pressure,velocityRatio:a.error.velocity/b.error.velocity});}
const summary={passed:true,cases:waves.rows.length,pairs:pairs.length,grid,refinement,amplitude,
 maxLinearEnergyDrift:max(waves.rows,r=>r.maxEnergyDrift),maxLinearMeanDrift:max(waves.rows,r=>r.maxMeanDrift),maxNonlinearEnergyDrift:max(nonlinear.rows,r=>r.energyDrift),
 regressions:metrics.map(metric=>{const rows=regressions.filter(r=>r.metric===metric),fine=rows.filter(r=>r.nper===256);return {metric,count:rows.length,fineCount:fine.length,materialCount:rows.filter(r=>r.increase>1e-10).length,worst:rows.toSorted((a,b)=>b.increase-a.increase)[0]??null};})};
const outputs={};
async function output(name,bytes){const p=`${out}/${name}`;await writeFile(p,bytes,{flag:'wx'});outputs[p]=hash(bytes);}
await output('summary.json',JSON.stringify(summary,null,2)+'\n');
for(const [name,rows] of [['wave-comparison.csv',pairs],['wave-regressions.csv',regressions]]){const keys=Object.keys(rows[0]??{});await output(name,keys.join(',')+'\n'+rows.map(r=>keys.map(k=>r[k]??'').join(',')).join('\n')+'\n');}
const sourcePath=`${folder}/summarize.mjs`,inputs=[`${folder}/selected-runs.json`,...paths];
await writeFile(`${out}/summary-provenance.json`,JSON.stringify({passed:true,sourceHashes:{[sourcePath]:hash(await readFile(sourcePath))},inputHashes:Object.fromEntries(await Promise.all(inputs.map(async p=>[p,hash(await readFile(p))]))),outputHashes:outputs},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(summary,null,2));
