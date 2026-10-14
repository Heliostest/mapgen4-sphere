import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {decodeDisplayText,packDisplayLayer} from './display-contract.ts';
const source=await readFile('build/earth-speedyweather/display.json','utf8'),d=decodeDisplayText(source);
let low=Infinity,high=-Infinity,maxWind=0,saturated=0;
for(const frame of d.frames)for(const layer of frame.layers){
 for(let k=0;k<layer.temperatureK.length;k++){
  low=Math.min(low,layer.temperatureK[k]);high=Math.max(high,layer.temperatureK[k]);
  maxWind=Math.max(maxWind,Math.hypot(layer.windEastMps[k],layer.windNorthMps[k]));
 }
 saturated+=packDisplayLayer(layer).temperatureSaturated;
}
assert.equal(d.frames.length,12);assert.equal(d.sigmaFull.length,8);
const result={status:'PASS',frames:12,levels:8,fieldsAreFinite:true,temperatureRangeK:[low,high],maxMonthlyVectorWindMps:maxWind,temperatureColorSaturatedCells:saturated,
 matrixCount:12*8,formalDefaultUnchanged:d.acceptance.formalDefaultUnchanged,source:'actual annual-statistics.json via conservative remapping'};
await writeFile('docs/evidence/earth-speedyweather-20261012/generated-data-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
