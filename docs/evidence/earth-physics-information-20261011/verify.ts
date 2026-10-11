import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ThermalRuntime} from '../../../thermal-runtime.ts';
const dir='docs/evidence/earth-physics-information-20261011',sha=(x:any)=>createHash('sha256').update(x).digest('hex');
const source=JSON.parse(await readFile('scenes/earth-land-sea/earth-simulation.json','utf8')),planet=source.terrain.settings.planet,orbit=source.terrain.settings.orbit;
// Evidence snapshots use JSON.stringify on typed arrays. Convert only dense
// numeric-key objects into arrays before exercising the strict file decoder.
function arrays(v:any):any {
 if(v===null||typeof v!=='object')return v;
 if(Array.isArray(v))return v.map(arrays);
 const keys=Object.keys(v);if(keys.length&&keys.every((k,i)=>k===String(i)))return keys.map(k=>arrays(v[k]));
 return Object.fromEntries(keys.map(k=>[k,arrays(v[k])]));
}
const records=[];
for(const label of ['flat','relief']){
 const text=await readFile(`build/earth-physics-information/${label}-final.json`,'utf8'),parsed=arrays(JSON.parse(text)),rt=ThermalRuntime.fromSnapshot(parsed,planet,orbit);
 const result=JSON.parse(await readFile(`${dir}/${label}.json`,'utf8'));assert.equal(result.finalSnapshotSha,sha(text));
 assert.ok(rt.model!.timeS>=result.yearS);assert.ok(Math.abs(rt.water!.diagnostics().residualMm)<5e-6);assert.ok(Math.abs(rt.environment!.diagnostics().energyResidualJm2)<.005);
 for(const key of ['snow','ice','grounded','shelfLand','shelfSea','soil','surface'] as const)assert.ok(rt.refinedSurface![key].every(v=>Number.isFinite(v)&&v>=-1e-10),`${label} local ${key}`);
 for(const key of ['landK','seaK'] as const)assert.ok(rt.refinedSurface![key].every(v=>Number.isFinite(v)&&v>0));
 // Metadata, arrays, topology, albedo, circulation and both independent
 // ledgers were validated by the production decoder/constructor.
 const file=`build/earth-physics-information/${label}-canonical-runtime.json`,canonical=JSON.stringify(parsed);await writeFile(file,canonical);
 const again=ThermalRuntime.fromSnapshot(JSON.parse(await readFile(file,'utf8')),planet,orbit);assert.deepEqual(again.snapshot(),rt.snapshot());
 records.push({label,originalSnapshotSha256:sha(text),canonicalFile:file,canonicalSha256:sha(canonical),strictRuntimeFileDecode:true,fullTerrainContinuation:result.fullTerrainRestoreChecked,waterResidualMm:rt.water!.diagnostics().residualMm,enthalpyResidualJm2:rt.environment!.diagnostics().energyResidualJm2});
}
const tests=await readFile('build/earth-physics-information/focused-tests.log','utf16le');assert.ok(tests.includes('tests 116')&&tests.includes('pass 116')&&tests.includes('fail 0'));
const result={records,focusedTests:116,formalSha256:sha(await readFile('scenes/earth-land-sea/earth-simulation.json')),bundleSha256:sha(await readFile(process.argv[1]))};
await writeFile(dir+'/verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
