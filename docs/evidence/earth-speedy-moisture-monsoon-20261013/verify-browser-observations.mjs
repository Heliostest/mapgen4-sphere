import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const folder='docs/evidence/earth-speedy-moisture-monsoon-20261013',out='build/earth-speedy-moisture-monsoon';
const bytes=await readFile(`${folder}/browser-observations.json`),o=JSON.parse(bytes);
const display=JSON.parse(await readFile(`${out}/comparison-display.json`,'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');let valuesChecked=0;
const displaySHA256=hash(await readFile(`${out}/comparison-display.json`)),bundleSHA256=hash(await readFile(`${out}/preview.js`));
assert.equal(o.artifacts.before.displaySHA256,displaySHA256);assert.equal(o.artifacts.after.displaySHA256,displaySHA256);
assert.equal(o.artifacts.before.bundleSHA256,bundleSHA256);assert.equal(o.artifacts.after.bundleSHA256,bundleSHA256);
for(const r of o.records){
 assert(r.ready);assert.equal(r.initialAtmLandSHA,display.initialAtmLandSHA);
 assert.equal(r.inputSHA256,displaySHA256);
 const c=display.cases.find(c=>c.id===r.caseId),f=c.data.frames[r.frameIndex],l=f.layers[r.levelIndex],p=r.probe;
 assert.equal(r.month,f.month);assert.equal(r.sigma,c.data.sigmaFull[r.levelIndex]);
 assert.deepEqual(r.orientation,o.records[0].orientation);assert(p);assert.equal(p.caseId,r.caseId);assert.equal(p.cell,r.probeCell);
 for(const [key,expected]of Object.entries({temperatureK:l.temperatureK[p.cell],windEastMps:l.windEastMps[p.cell],windNorthMps:l.windNorthMps[p.cell],surfacePressurePa:f.surface.pressurePa[p.cell],pressurePa:f.surface.pressurePa[p.cell]*r.sigma,rainMmDay:f.surface.rainMmDay[p.cell],seaIceConcentration:f.surface.seaIceConcentration[p.cell]})){
  assert.equal(p[key],expected,`${r.caseId}/${r.month}/${r.levelIndex}/${key}`);valuesChecked++;
 }
}
assert.equal(new Set(o.records.map(r=>r.caseId)).size,4);assert.equal(new Set(o.records.map(r=>r.levelIndex)).size,8);assert.equal(new Set(o.records.map(r=>r.layer)).size,2);
for(const c of display.cases)for(const month of [1,7])assert(o.records.some(r=>r.caseId===c.id&&r.month===month&&r.levelIndex===7));
const {playStarted:s,playSwitched:c,playEnded:e,restartPlay:r,manualPaused:p}=o.playback;
assert(s.playing&&c.playing);assert.equal(s.month,c.month);assert.notEqual(s.caseId,c.caseId);assert.equal(e.month,12);assert(!e.playing);assert(r.playing&&r.month===1);assert(!p.playing);
assert.equal(o.consoleErrors.length,0);
const screenshots=[];for(const path of o.screenshots){const b=await readFile(path);assert(b.length>10000);screenshots.push({path,bytes:b.length,sha256:hash(b)});}
const result={createdUTC:new Date().toISOString(),passed:true,url:o.url,displaySHA256,bundleSHA256,observationSHA256:hash(bytes),records:o.records.length,exactProbeValuesChecked:valuesChecked,cases:4,levels:8,fields:2,allCasesJanuaryJulyChecked:true,orientationPreserved:true,playbackSwitchPreserved:true,automaticDecemberPause:true,manualPause:true,consoleErrors:0,screenshots,limits:['Monthly means only; no solver or formal scene state changes.','Loaded display SHA is computed in the browser; bundle SHA is checked on the server filesystem before and after the session.','Probe fidelity and interaction verified; no browser FPS claim.']};
await writeFile(`${folder}/browser-verification.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
