import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {decodeSimulationDocument} from '../../../simulation-document.ts';
import {ThermalRuntime} from '../../../thermal-runtime.ts';
const folder='docs/evidence/earth-endorheic-rivers-20261011',first='build/endorheic/browser-play-save.json',second='build/endorheic/browser-restored-save.json';
const aText=await readFile(first,'utf8'),bText=await readFile(second,'utf8'),raw=JSON.parse(aText);
const a=decodeSimulationDocument(aText,raw.terrain.mesh,128),b=decodeSimulationDocument(bText,raw.terrain.mesh,128);
const rawRestored=JSON.parse(bText),rawDifferentFields=Object.keys({...raw,...rawRestored}).filter(k=>!isDeepStrictEqual(raw[k],rawRestored[k]));
assert.deepEqual(b.runtime,a.runtime);
assert.deepEqual(b.terrain,a.terrain);assert.deepEqual(b.view,a.view);
assert(a.terrain.settings.timeS>0);assert(a.runtime.state!.thermal.steps>0);
assert.equal(a.terrain.parameters.render.fused_river_max_width,.01);
const rt=ThermalRuntime.fromSnapshot(a.runtime,a.terrain.settings.planet,a.terrain.settings.orbit);
const water=rt.water!.diagnostics(),energy=rt.environment!.diagnostics();
assert(Math.abs(water.residualMm)<1e-6);assert(Math.abs(energy.energyResidualJm2)<1e-3);
const result={status:'PASS',sameRuntime:true,sameTerrainAndDrainage:true,sameView:true,
    clockDays:a.terrain.settings.timeS/86400,modelDays:rt.model!.timeS/86400,steps:rt.model!.steps,
    sha256:[aText,bText].map(t=>createHash('sha256').update(t).digest('hex')),
    rawDifferentFields,
    display:a.terrain.parameters.render,water,energy,
    note:'Real Chrome Play/Pause and simulation-save downloads; same-origin scene loader restored the first file, then simulation-save downloaded the second. No file-URL permission was enabled.'};
await writeFile(`${folder}/browser-roundtrip.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
