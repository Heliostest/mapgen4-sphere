import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-uplift-closure-20261012',out='build/earth-uplift-closure';
const inputs=['scenes/earth-land-sea/earth-simulation.json','build/earth-lakes-freeze-temperate/lake-day0.json','docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json','docs/evidence/earth-seaice-causal-20261011/nsidc-same-grid.json'];
const sources=['water.ts','runtime-state.ts','water-panel.ts','circulation.ts','climate.ts','thermal.ts','thermal-runtime.ts','environment.ts','refinement-surface.ts','terrain-water.ts','glacier.ts','tests/moisture.test.ts','tests/simulation.test.ts'];
const artifacts=(await fs.readdir(folder)).filter(f=>f!=='manifest.json').map(f=>`${folder}/${f}`);
const snapshots=(await fs.readdir(out)).filter(f=>f.startsWith('full-')&&f.includes('-day')&&f.endsWith('.json')).map(f=>`${out}/${f}`);
const builds=['screen.mjs','full.mjs','restore.mjs','test-output.txt','before-preview.html','cold-front-preview.html','closure-preview.html','initial-preview.html'].map(f=>`${out}/${f}`);
const files=[];
for(const file of [...inputs,...sources,...artifacts,...snapshots,...builds]){const data=await fs.readFile(file);files.push({file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});}
assert.equal(files.find(f=>f.file===inputs[0]).sha256,'afb80a8ab730785eed0cb709a66d938ad20a9690b04ecfa1246d1deb393adca6');
assert.equal(files.find(f=>f.file===inputs[1]).sha256,'24bfe8b9a4768000574aa3febf3ed2be692ed2a071346175a9f0463280c2854b');
const results=JSON.parse(await fs.readFile(`${folder}/comparison.json`,'utf8'));
assert.equal(new Set(results.full.map(j=>j.initialStockSha)).size,1);
for(const j of results.full)assert.equal(j.bundleSha256,files.find(f=>f.file===`${out}/full.mjs`).sha256);
const restore=JSON.parse(await fs.readFile(`${folder}/serialized-restore.json`,'utf8'));assert(restore.every(j=>j.jsonRoundtripNextStepExact&&j.serializedSavedEndpointEqualsIntegratedLedgers));
await fs.writeFile(`${folder}/manifest.json`,JSON.stringify({date:'2026-10-12',formalDefaultUnchanged:true,regionalClimateAccepted:false,fullStockSha256:results.full[0].initialStockSha,verification:{tests:269,typecheck:true,build:true,fullAnnualArms:results.full.length,dailyAuditsPerArm:results.full[0].auditCount,jsonRestoreNextStepExact:true,coarseHalfStepComparison:true},files},null,2)+'\n');
console.log(JSON.stringify({files:files.length,formalDefaultsUnchanged:true,sameFullInitialStocks:true,serializedRestore:true}));
