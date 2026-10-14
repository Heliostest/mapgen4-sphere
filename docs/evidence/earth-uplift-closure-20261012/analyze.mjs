import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='build/earth-uplift-closure',folder='docs/evidence/earth-uplift-closure-20261012';
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length,season=(a,months)=>months.reduce((s,m)=>s+a[m],0);
const full=[];
for(const label of ['control','coldFront','eddyCold']){
 const j=JSON.parse(await fs.readFile(`${out}/full-${label}.json`,'utf8'));
 assert(j.strictContinuation&&j.budgetAudit.auditCount>=366);
 if(full.length)assert.equal(j.initialStockSha,full[0].initialStockSha);
 const gpcc=j.gpcc.map(r=>({...r,annualBiasMm:r.modelAnnualMm-r.observedAnnualMm,monthlyMAEMm:mean(r.monthlyMm.map((v,k)=>Math.abs(v-r.observedMonthlyMm[k]))),DJFMm:season(r.monthlyMm,[11,0,1]),JJAMm:season(r.monthlyMm,[5,6,7]),observedDJFMm:season(r.observedMonthlyMm,[11,0,1]),observedJJAMm:season(r.observedMonthlyMm,[5,6,7])}));
 const snowLedger=Object.fromEntries(Object.entries(j.causal.snowLedger).map(([k,a])=>[k,mean(a)]));
 full.push({label,initialStockSha:j.initialStockSha,formalSha256:j.formalSha256,inputSha256:j.inputSha256,bundleSha256:j.bundleSha256,budget:j.budgetMax,snowLedger,snowResidualMax:j.causal.snowResidualMax,strictContinuation:j.strictContinuation,auditCount:j.budgetAudit.auditCount,lakeVolumeM3:j.lakeVolumeM3,temperateAnnualMAEMm:mean(gpcc.filter(r=>r.fit).map(r=>Math.abs(r.annualBiasMm))),ice:j.hemispheres,gpcc});
 await fs.copyFile(`${out}/full-${label}.json`,`${folder}/full-${label}.json`);
}
const screening=[];
for(const file of (await fs.readdir(out)).filter(f=>f.startsWith('screen-')&&f.endsWith('.json'))){
 const j=JSON.parse(await fs.readFile(`${out}/${file}`,'utf8'));
 screening.push({label:j.label,initialStockSha:j.initialStockSha,bundleSha256:j.bundleSha256,dt:j.dt,budget:j.budgetMax,snowLedger:Object.fromEntries(Object.entries(j.causal.snowLedger).map(([k,a])=>[k,mean(a)])),temperateAnnualMAEMm:mean(j.gpcc.filter(r=>r.fit).map(r=>Math.abs(r.modelAnnualMm-r.observedAnnualMm))),ice:{north:j.hemispheres.north.extentMAE,south:j.hemispheres.south.extentMAE},gpcc:j.gpcc});
 await fs.copyFile(`${out}/${file}`,`${folder}/${file}`);
}
assert(screening.every(j=>j.initialStockSha===screening[0].initialStockSha));
const stepComparison=['coldFront','eddyCold'].map(label=>{
 const a=screening.find(j=>j.label===label),b=screening.find(j=>j.label===label+'900');
 return {label,stage:'coarse-only',annualMaxDifferenceMm:Math.max(...a.gpcc.map((r,k)=>Math.abs(r.modelAnnualMm-b.gpcc[k].modelAnnualMm))),monthlyMaxDifferenceMm:Math.max(...a.gpcc.flatMap((r,k)=>r.monthlyMm.map((v,m)=>Math.abs(v-b.gpcc[k].monthlyMm[m])))),sameInitialStocks:a.initialStockSha===b.initialStockSha};
});
const comparison={full,screening,stepComparison,acceptance:{formalDefaultUnchanged:true,regionalClimateAccepted:false,selection:'Keep coldFront as the minimal structural repair preview; eddyCold is a diagnostic ablation, not an accepted climate preset.'}};
await fs.writeFile(`${folder}/comparison.json`,JSON.stringify(comparison,null,2)+'\n');
console.log(JSON.stringify({full:full.map(j=>({label:j.label,snow:j.snowLedger,temperateAnnualMAEMm:j.temperateAnnualMAEMm,ice:[j.ice.north.extentMAE,j.ice.south.extentMAE],budget:j.budget,gpcc:j.gpcc.map(r=>({name:r.name,annual:r.modelAnnualMm,DJF:r.DJFMm,JJA:r.JJAMm,mechanisms:r.annualMechanismsMm}))})),stepComparison}));
