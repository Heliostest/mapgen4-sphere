/** Compare the complete initial state, allowing only the shared solver's added diagnostic. */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {ThermalRuntime} from '../../../thermal-runtime.ts';
const base=JSON.parse(await readFile('scenes/earth-land-sea/earth-simulation.json','utf8'));
const folder='docs/evidence/earth-east-asia-mechanisms-20261015';
const profiles=JSON.parse(await readFile(`${folder}/profiles.json`,'utf8'));
let reference;
for(const [label,profile] of Object.entries(profiles) as [string,any][]){
 const d=structuredClone(base);
 Object.assign(d.runtime.config,profile.thermal);Object.assign(d.runtime.waterConfig,profile.water);Object.assign(d.runtime.environmentConfig,profile.environment);
 const state=ThermalRuntime.fromSnapshot(d.runtime,d.terrain.settings.planet,d.terrain.settings.orbit).snapshot().state!;
 const hash=createHash('sha256').update(JSON.stringify(state)).digest('hex');
 const run=JSON.parse(await readFile(`${folder}/${label}.json`,'utf8'));
 assert.equal(hash,run.initialStockSha);
 delete state.water!.landPrecipitationKgM2S;
 if(reference)assert.deepEqual(state,reference);else reference=state;
 console.log(label,hash,'equal after omitting optional land precipitation diagnostic');
}
