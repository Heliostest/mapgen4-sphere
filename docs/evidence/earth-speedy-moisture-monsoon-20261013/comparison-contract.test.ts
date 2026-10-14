import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CASE_IDENTITIES,INITIAL_ATM_LAND_SHA,decodeComparison,createReplaySelection,switchReplayCase,activeReplay,readReplayProbe,packedReplayKey} from './comparison-contract.ts';
const data=JSON.parse(readFileSync('build/earth-speedyweather/display.json','utf8'));
const fixture=()=>({format:'speedyweather-sst-comparison',version:1,initialAtmLandSHA:INITIAL_ATM_LAND_SHA,cases:CASE_IDENTITIES.map(identity=>({...identity,data:structuredClone(data)}))});
test('four-case replay preserves month/layer and probes selected raw data',()=>{
 const raw=fixture();raw.cases[1].data.frames[6].layers[3].temperatureK[10]=277.321;
 const doc=decodeComparison(raw),s={...createReplaySelection(),frameIndex:6,levelIndex:3};
 const switched=switchReplayCase(doc,s,'water-seasonal');
 assert.equal(switched.frameIndex,6);assert.equal(switched.levelIndex,3);
 assert.equal(readReplayProbe(doc,switched,10).temperatureK,277.321);
 assert.notEqual(packedReplayKey(s),packedReplayKey(switched));
 for(const c of CASE_IDENTITIES)assert.equal(activeReplay(doc,switchReplayCase(doc,s,c.id)).case.id,c.id);
});
test('reject missing/duplicate cases, wrong initial stock and invalid fields',()=>{
 const missing=fixture();missing.cases.pop();assert.throws(()=>decodeComparison(missing));
 const duplicate=fixture();duplicate.cases[2]=duplicate.cases[1];assert.throws(()=>decodeComparison(duplicate));
 const wrong=fixture();wrong.initialAtmLandSHA='wrong';assert.throws(()=>decodeComparison(wrong));
 const invalid=fixture();invalid.cases[3].data.frames[0].layers[0].temperatureK[0]=NaN;assert.throws(()=>decodeComparison(invalid));
});
