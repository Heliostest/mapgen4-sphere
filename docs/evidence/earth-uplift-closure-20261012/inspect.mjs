import fs from 'node:fs/promises';
const folder='build/earth-uplift-closure',stage=process.argv[2]??'screen',mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
for(const file of (await fs.readdir(folder)).filter(n=>n.startsWith(`${stage}-`)&&n.endsWith('.json')&&!n.includes('day'))){
 const j=JSON.parse(await fs.readFile(`${folder}/${file}`,'utf8'));
 const season=(a,indices)=>indices.reduce((s,k)=>s+a[k],0);
 console.log(JSON.stringify({label:j.label,ice:[j.hemispheres.north.extentMAE,j.hemispheres.south.extentMAE],temperateMae:mean(j.gpcc.filter(r=>r.fit).map(r=>Math.abs(r.modelAnnualMm-r.observedAnnualMm))),snow:j.causal?Object.fromEntries(['initial','final','snowfall','melt','compaction'].map(k=>[k,mean(j.causal.snowLedger[k])])):null,snowResidual:j.causal?.snowResidualMax,regions:j.gpcc.map(r=>({name:r.name,annual:r.modelAnnualMm,DJF:season(r.monthlyMm,[11,0,1]),JJA:season(r.monthlyMm,[5,6,7]),observedDJF:season(r.observedMonthlyMm,[11,0,1]),observedJJA:season(r.observedMonthlyMm,[5,6,7]),mechanisms:r.annualMechanismsMm})),budget:j.budgetMax}));
}
