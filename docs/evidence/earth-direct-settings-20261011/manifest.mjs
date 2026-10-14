import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const folder = 'docs/evidence/earth-direct-settings-20261011';
const load = async path => JSON.parse(await fs.readFile(path, 'utf8'));
const fingerprint = async path => {
  const data = await fs.readFile(path);
  return {path, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex')};
};
const acceptance = await load(`${folder}/acceptance.json`);
const current = (await load('build/earth-parameter-tuning/full-tuned-day0.json')).runtime;
const direct = (await load('build/earth-direct-settings/full-direct0575-day0.json')).runtime;
assert.equal(current.config.emissivity, .595);
assert.equal(direct.config.emissivity, .575);
const withoutEmissivity = ({emissivity, ...rest}) => rest;
assert.deepEqual(withoutEmissivity(current.config), withoutEmissivity(direct.config));
assert.deepEqual(current.waterConfig, direct.waterConfig);
assert.deepEqual(current.environmentConfig, direct.environmentConfig);
const browser = await load(`${folder}/browser-checks.json`);
assert(browser.comparisons.every(r => r.errors.length === 0));
const viewConditions = ({emissivity, ...rest}) => rest;
assert.deepEqual(viewConditions(browser.comparisons[0].values), viewConditions(browser.comparisons[1].values));
const inputs = await Promise.all([
  'scenes/earth-land-sea/earth-simulation.json',
  'build/earth-lakes-freeze-temperate/lake-day0.json',
  'docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json',
  'docs/evidence/earth-seaice-causal-20261011/nsidc-same-grid.json',
].map(fingerprint));
assert.equal(inputs[0].sha256, acceptance.formalSha256);
assert.equal(inputs[1].sha256, acceptance.inputSha256);
const artifacts = await Promise.all([
  'build/earth-parameter-tuning/full-tuning.mjs',
  'build/earth-parameter-tuning/full-tuned.json',
  'build/earth-parameter-tuning/full-tuned-day0.json',
  'build/earth-parameter-tuning/full-tuned-day365.json',
  'build/earth-direct-settings/full.mjs',
  'build/earth-direct-settings/full-direct0575-day0.json',
  'build/earth-direct-settings/full-direct0575-day365.json',
  'build/earth-direct-settings/current-preview.html',
  'build/earth-direct-settings/direct-preview.html',
  'build/earth-direct-settings/initial-preview.html',
].map(fingerprint));
const evidence = await Promise.all((await fs.readdir(folder)).filter(name => name !== 'manifest.json').sort().map(name => fingerprint(`${folder}/${name}`)));
const manifest = {
  generatedAt: new Date().toISOString(),
  baseline: 'Previous completed same-stock full-tuned annual integration; reused with recorded provenance.',
  selectedChange: {emissivity: [.595, .575]},
  otherThermalWaterEnvironmentConfigsIdentical: true,
  pairedScreenshotConditionsIdentical: true,
  initialStockSha256: acceptance.initialStockSha256,
  inputs, artifacts, evidence,
};
await fs.writeFile(`${folder}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({configsMatch: true, browserMatch: true, formalDefaultsUnchanged: true, evidenceFiles: evidence.length}));
