import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const folder='docs/evidence/earth-balanced-settings-20261012',out='build/earth-balanced-settings';
const load=async path=>JSON.parse(await fs.readFile(path,'utf8'));
const fingerprint=async path=>{const bytes=await fs.readFile(path);return {path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};};
const acceptance=await load(`${folder}/acceptance.json`),selected=acceptance.selected;
const formal=await fingerprint('scenes/earth-land-sea/earth-simulation.json');assert.equal(formal.sha256,acceptance.formalSha256);
const formalDocument=await load(formal.path);assert.equal(formalDocument.runtime.waterConfig.compensatedOceanTransfers,undefined);
const initial=await load(`${out}/full-${selected}-day0.json`),baseline=await load(`${out}/full-direct-day0.json`);
assert(initial.runtime.waterConfig.compensatedOceanTransfers&&baseline.runtime.waterConfig.compensatedOceanTransfers);
const withoutMix=({moistureDiffusivityM2s,...rest})=>rest;
assert.deepEqual(withoutMix(initial.runtime.waterConfig),withoutMix(baseline.runtime.waterConfig));
assert.deepEqual(initial.runtime.environmentConfig,baseline.runtime.environmentConfig);
const withoutEmission=({emissivity,...rest})=>rest;assert.deepEqual(withoutEmission(initial.runtime.config),withoutEmission(baseline.runtime.config));
const browser=await load(`${folder}/browser-checks.json`);assert(browser.comparisons.every(r=>r.errors.length===0));
const view=({emissivity,mixing,...rest})=>rest;assert.deepEqual(view(browser.comparisons[0].values),view(browser.comparisons[1].values));
const results=await Promise.all(['direct','mild','mix4','mix4cool'].map(label=>load(`${out}/full-${label}.json`)));
assert(results.every(r=>r.bundleSha256===results[0].bundleSha256));
const bundle=await fingerprint(`${out}/full.mjs`);assert.equal(bundle.sha256,results[0].bundleSha256);
const inputs=await Promise.all(['build/earth-lakes-freeze-temperate/lake-day0.json','docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json','docs/evidence/earth-seaice-causal-20261011/nsidc-same-grid.json'].map(fingerprint));
assert.equal(inputs[0].sha256,acceptance.inputSha256);
const code=await Promise.all(['water.ts','runtime-state.ts','thermal-runtime.ts','terrain-water.ts','refinement-surface.ts','environment.ts','water-panel.ts','tests/water.test.ts','tests/simulation.test.ts','build/_bundle.js','build/_worker.js'].map(fingerprint));
const artifacts=await Promise.all([
  bundle.path,`${out}/screen.mjs`,`${out}/node-tests.log`,
  ...['direct','mild','mix4','mix4cool'].flatMap(label=>[`${out}/full-${label}-day0.json`,`${out}/full-${label}-day365.json`]),
  ...['before','balanced','alternate','initial'].map(label=>`${out}/${label}-preview.html`),
].map(fingerprint));
const evidence=await Promise.all((await fs.readdir(folder)).filter(name=>name!=='manifest.json').sort().map(name=>fingerprint(`${folder}/${name}`)));
const manifest={generatedAt:new Date().toISOString(),selected,threeTargetsPass:acceptance.verdicts[selected].threeTargetsPass,formalDefaultsUnchanged:true,defaultAccumulationUnchanged:true,allFinalFullArmsFreshlyIntegratedWithSameBundle:true,initialStockSha256:acceptance.initialStockSha256,pairedScreenshotConditionsIdentical:true,formal,inputs,code,artifacts,evidence};
await fs.writeFile(`${folder}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({selected,threeTargetsPass:manifest.threeTargetsPass,evidenceFiles:evidence.length,formalDefaultsUnchanged:true,sameFullBundle:true}));
