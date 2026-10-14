import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const folder='build/earth-balanced-settings',stage=process.argv[2]??'screen';
const load=async label=>JSON.parse(await fs.readFile(`${folder}/${stage}-${label}.json`,'utf8'));
const direct=await load('direct'),mild=await load('mild');
const meanBias=j=>j.gpcc.filter(r=>r.fit).reduce((s,r)=>s+Math.abs(r.modelAnnualMm-r.observedAnnualMm),0)/4;
const byName=(j,name)=>j.gpcc.find(r=>r.name===name);
for(const file of (await fs.readdir(folder)).filter(n=>n.startsWith(`${stage}-`)&&n.endsWith('.json')&&!n.includes('day'))){
 const j=JSON.parse(await fs.readFile(`${folder}/${file}`,'utf8'));
 assert.equal(j.initialStockSha,direct.initialStockSha);assert(j.strictContinuation);
 const australia=['Australia southwest','Australia north'].map(name=>({name,observed:byName(j,name).observedAnnualMm,rain:byName(j,name).modelAnnualMm,passes:Math.abs(byName(j,name).modelAnnualMm-byName(j,name).observedAnnualMm)<=Math.abs(byName(mild,name).modelAnnualMm-byName(mild,name).observedAnnualMm)}));
 const ice=['north','south'].map(h=>({hemisphere:h,mae:j.hemispheres[h].extentMAE,passes:j.hemispheres[h].extentMAE<direct.hemispheres[h].extentMAE}));
 const dry=['Europe','East North America','West Siberia'].map(name=>({name,rain:byName(j,name).modelAnnualMm,passes:Math.abs(byName(j,name).modelAnnualMm-byName(j,name).observedAnnualMm)<Math.abs(byName(mild,name).modelAnnualMm-byName(mild,name).observedAnnualMm)}));
 console.log(JSON.stringify({label:j.label,parameters:j.parameters,seconds:j.records.at(-1).seconds,temp:j.annualSurfaceMeanC,ice,temperateMeanBias:meanBias(j),temperatePass:meanBias(j)<Math.min(meanBias(direct),meanBias(mild)),dry,australia,other:j.gpcc.filter(r=>!r.fit&&!r.name.startsWith('Australia')).map(r=>[r.name,Math.round(r.modelAnnualMm)]),budget:j.budgetMax}));
}
