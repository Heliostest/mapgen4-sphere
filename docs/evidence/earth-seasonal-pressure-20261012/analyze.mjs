import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const out='build/earth-seasonal-pressure',folder='docs/evidence/earth-seasonal-pressure-20261012';
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length,season=(a,months)=>months.reduce((s,m)=>s+a[m],0);
const summarize=j=>({label:j.label,initialStockSha:j.initialStockSha,formalSha256:j.formalSha256,inputSha256:j.inputSha256,bundleSha256:j.bundleSha256,dt:j.dt,parameters:j.parameters,budget:j.budgetMax,snowLedger:Object.fromEntries(Object.entries(j.causal.snowLedger).map(([k,a])=>[k,mean(a)])),snowResidualMax:j.causal.snowResidualMax,strictContinuation:j.strictContinuation,auditCount:j.budgetAudit?.auditCount,lakeVolumeM3:j.lakeVolumeM3,temperateAnnualMAEMm:mean(j.gpcc.filter(r=>r.fit).map(r=>Math.abs(r.modelAnnualMm-r.observedAnnualMm))),ice:j.hemispheres,gpcc:j.gpcc.map(r=>({...r,annualBiasMm:r.modelAnnualMm-r.observedAnnualMm,monthlyMAEMm:mean(r.monthlyMm.map((v,k)=>Math.abs(v-r.observedMonthlyMm[k]))),DJFMm:season(r.monthlyMm,[11,0,1]),JJAMm:season(r.monthlyMm,[5,6,7]),observedDJFMm:season(r.observedMonthlyMm,[11,0,1]),observedJJAMm:season(r.observedMonthlyMm,[5,6,7])}))});
const full=[],screening=[],archives=[];
await fs.mkdir(folder+'/raw',{recursive:true});await fs.mkdir(folder+'/bundles',{recursive:true});
for(const file of (await fs.readdir(out)).filter(f=>/^(full|screen)-[^.]+\.json$/.test(f)&&!f.includes('-day'))){
 const bytes=await fs.readFile(out+'/'+file),j=JSON.parse(bytes),x=summarize(j);
 assert(j.strictContinuation);assert(j.budgetMax.waterMax<5e-6&&j.budgetMax.heatMax<.005&&j.budgetMax.vaporMax<1e-7);
 (file.startsWith('full-')?full:screening).push(x);
 const compressed=gzipSync(bytes);await fs.writeFile(folder+'/raw/'+file+'.gz',compressed);
 archives.push({file:'raw/'+file+'.gz',rawSha256:createHash('sha256').update(bytes).digest('hex'),bundleSha256:j.bundleSha256});
 const bundle=await fs.readFile(out+'/bundles/'+j.bundleSha256+'.mjs');assert.equal(createHash('sha256').update(bundle).digest('hex'),j.bundleSha256);
 await fs.writeFile(folder+'/bundles/'+j.bundleSha256+'.mjs.gz',gzipSync(bundle));
}
for(const group of [full,screening])assert.equal(new Set(group.map(j=>j.initialStockSha)).size,1);
assert(full.every(j=>j.auditCount>=366));
const stepComparison=['balanced','boundaryMix1'].map(label=>{
 const a=screening.find(j=>j.label===label),b=screening.find(j=>j.label===label+'900');
 assert(a.initialStockSha===b.initialStockSha&&a.dt===1800&&b.dt===900);
 const regionDifferences=a.gpcc.map((r,k)=>({name:r.name,annualMm:b.gpcc[k].modelAnnualMm-r.modelAnnualMm,DJFMm:b.gpcc[k].DJFMm-r.DJFMm,JJAMm:b.gpcc[k].JJAMm-r.JJAMm}));
 return {label,stage:'coarse-only',annualMaxDifferenceMm:Math.max(...regionDifferences.map(r=>Math.abs(r.annualMm))),monthlyMaxDifferenceMm:Math.max(...a.gpcc.flatMap((r,k)=>r.monthlyMm.map((v,m)=>Math.abs(v-b.gpcc[k].monthlyMm[m])))),sameInitialStocks:true,regionDifferences};
});
const comparison={full,screening,stepComparison,archives,acceptance:{formalDefaultUnchanged:true,regionalClimateAccepted:false,selection:'Retain the previous coldFront preview. New pressure schemes are experimental comparisons; both fail the Australian and temperate regional acceptance.'}};
await fs.writeFile(folder+'/comparison.json',JSON.stringify(comparison,null,2)+'\n');
console.log(JSON.stringify({full:full.map(j=>({label:j.label,temperateMAE:j.temperateAnnualMAEMm,snowFinal:j.snowLedger.final,budget:j.budget})),stepComparison}));
