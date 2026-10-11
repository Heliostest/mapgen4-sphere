import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const base='e3222280a0ceddd597245f3c45d75f75d2def9f5',folder='docs/evidence/earth-moisture-p0-20261011';
const sha=b=>createHash('sha256').update(b).digest('hex');
const unchanged=['scenes/earth-land-sea/earth-simulation.json','scenes/earth-land-sea/scene-config.json','config.js','environment.ts','surface-grid.ts'];
const defaults=[];
for(const path of unchanged){const a=await readFile(path),b=execFileSync('git',['show',`${base}:${path}`],{maxBuffer:30e6});assert.equal(sha(a),sha(b),path+' changed');defaults.push({path,sha256:sha(a),unchangedAgainstBase:true});}
const d=JSON.parse(await readFile(unchanged[0],'utf8'));
assert.equal(d.runtime.waterConfig.moistureScheme,undefined);assert.equal(d.runtime.config.airRadiationFraction,undefined);assert.equal(d.runtime.surfaceConfig?.refinement,undefined);
const product=['climate-diagnostics.ts','circulation.ts','water.ts','reference-moisture.ts','planet-controls.ts','scenes/earth-land-sea/sidebar-zh.js','tests/climate-diagnostics.test.ts','tests/circulation.test.ts','tests/moisture.test.ts','scripts/test.mjs'];
const productHashes=await Promise.all(product.map(async path=>({path,sha256:sha(await readFile(path))})));
const artifacts=[];
for(const name of (await readdir(folder)).sort()){if(!/\.(json|png|svg|py|mjs|html|log|md)$/.test(name)||name==='bindings.json')continue;artifacts.push({path:`${folder}/${name}`,sha256:sha(await readFile(`${folder}/${name}`))});}
const bundles=[];
for(const path of ['build/earth-moisture-p0/integrate-before.mjs','build/earth-moisture-p0/integrate-after.mjs','build/_bundle.js','build/_worker.js'])bundles.push({path,sha256:sha(await readFile(path))});
const before=JSON.parse(await readFile(`${folder}/before-1800-continuous.json`,'utf8'));
const after=JSON.parse(await readFile(`${folder}/continuous-front-1800-continuous.json`,'utf8'));
for(const [run,bundle] of [[before,bundles[0]],[after,bundles[1]]]){assert.equal(run.bundleSha256,bundle.sha256);for(const record of run.records){assert.equal(record.sha256,sha(await readFile(record.file)));}}
// Equal initial physical stocks across every actual run; step size and copied
// clock metadata are intentionally different, all saved reservoir values match.
const initialBefore=JSON.parse(await readFile(before.records[0].file,'utf8')).runtime.state;
const ignore=new Set(['stepS']);
for(const dt of [1800,900,450]){
 const run=JSON.parse(await readFile(`${folder}/continuous-front-${dt}-continuous.json`,'utf8'));
 assert.equal(run.inputSha256,defaults[0].sha256);assert.equal(run.bundleSha256,bundles[1].sha256);
 const init=JSON.parse(await readFile(run.records[0].file,'utf8')).runtime.state;
 for(const key of Object.keys(initialBefore))if(!ignore.has(key))assert.deepEqual(init[key],initialBefore[key],`Initial ${key} at ${dt}s`);
 for(const record of run.records)assert.equal(record.sha256,sha(await readFile(record.file)));
}
await writeFile(`${folder}/bindings.json`,JSON.stringify({base,branch:execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),defaults,productHashes,bundles,artifacts,initialStocksEqualAcrossRuns:true,formalDefaults:{moistureScheme:'legacy (absent)',airRadiationFraction:'0 (absent)',refinement:'classic (absent)'},screenshots:{diagnostic:'Two dimensional actual-data plots visually checked; diagnostic-before.png and diagnostic-after.png',earthRenderer:'BLOCKED: Chrome WebGL context loss; fresh tabs require WebGL2. invalid-captures excluded.'}},null,2)+'\n');
console.log('Formal files unchanged; identical initial physical stocks; all actual snapshot and bundle hashes verified.');
