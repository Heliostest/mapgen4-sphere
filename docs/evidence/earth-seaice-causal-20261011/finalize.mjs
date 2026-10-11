import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const folder='docs/evidence/earth-seaice-causal-20261011',build='build/earth-seaice-causal';
const sha=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await readFile(`${folder}/manifest.json`,'utf8'));
for(const b of manifest.bindings)assert.equal(sha(await readFile(b.path)),b.sha256,b.path);
const bundles=['integrate-factorial.mjs','integrate-factorial.mjs','integrate-factorial-sharedmask.mjs','integrate-factorial-sharedmask.mjs','integrate-shortwave-sharedmask.mjs','integrate-shortwave-sharedmask.mjs'];
for(let i=0;i<manifest.runs.length;i++) {
 const r=manifest.runs[i];assert.equal(sha(await readFile(`${build}/${bundles[i]}`)),r.bundleSha256);
 for(const c of r.records)assert.equal(sha(await readFile(c.path)),c.sha256,c.path);
}
const source=JSON.parse(await readFile('scenes/earth-land-sea/earth-simulation.json','utf8'));
const formalSha=sha(await readFile('scenes/earth-land-sea/earth-simulation.json'));
assert.equal(formalSha,'afb80a8ab730785eed0cb709a66d938ad20a9690b04ecfa1246d1deb393adca6');
assert.equal(source.runtime.refinement,undefined);
assert.notEqual(source.runtime.waterConfig.moistureScheme,'transport');
assert.equal(source.runtime.config.airRadiationFraction,undefined);
const defaults=s=>s.match(/export const DEFAULT_ENVIRONMENT[^\n]+/)[0].trim();
assert.equal(defaults(await readFile('environment.ts','utf8')),defaults(execFileSync('git',['show','HEAD:environment.ts'],{encoding:'utf8'})));
const logs=['tests-final.log','typecheck-final.log','build-final.log','verify-final.log'];
const bindings=await Promise.all(logs.map(async name=>({path:`${build}/${name}`,sha256:sha(await readFile(`${build}/${name}`))})));
// PowerShell redirects to UTF16; inspect content as well as binding bytes.
const test=(await readFile(`${build}/tests-final.log`)).toString('utf16le');
assert.match(test,/tests 251/);assert.match(test,/pass 251/);assert.match(test,/fail 0/);
execFileSync('git',['diff','--check'],{stdio:'pipe'});
const verification={generatedAtUtc:new Date().toISOString(),tests:{passed:251,total:251,failed:0},typecheck:'passed',build:'passed',formalEarthVerify:'passed',diffCheck:'passed',defaults:'DEFAULT_ENVIRONMENT text exactly matches HEAD; formal JSON SHA unchanged; classic/legacy/formal radiation unchanged',formalSha256:formalSha,bindings,bundleAndSnapshotSha:'verified every primary run bundle and checkpoint against manifest',observation:'720 NSIDC source SHA plus remapped arrays independently verified; seasonal coverage acceptance still failed',remaining:'Independent concentration/ice thickness and multiple-year convergence remain open. WebGL screenshots pending prior recovery.'};
await writeFile(`${folder}/verification.json`,JSON.stringify(verification,null,2));
for(const path of [`${folder}/REPORT.md`,`${folder}/REVIEW.md`,`${folder}/verification.json`,`${folder}/same-grid-seasonality.png`,`${folder}/south-winter-cause.png`,`${folder}/finalize.mjs`])manifest.bindings.push({path,sha256:sha(await readFile(path))});
await writeFile(`${folder}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({tests:verification.tests,formalSha256:formalSha,bundlesAndCheckpoints:'SHA matched',defaults:'unchanged',nsidcAcceptance:'failed'},null,2));
