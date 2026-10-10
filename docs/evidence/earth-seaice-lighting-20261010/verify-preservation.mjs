import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const baseline='a4ec11e3ed1c8df5b7a1bfe0e75cc4bfc4d34b41';
const report={baseline,saves:[],sameDay0Controls:false};
for(const filename of ['earth-terrain.json','earth-simulation.json']){
    const path=`scenes/earth-land-sea/${filename}`,bytes=await readFile(path);
    const source=spawnSync('git',['show',`${baseline}:${path}`],{encoding:'utf8',maxBuffer:64*1024*1024});
    assert.equal(source.status,0,source.stderr);
    const before=JSON.parse(source.stdout),after=JSON.parse(bytes.toString('utf8'));
    const originalTerrain=before.terrain??before,terrain=after.terrain??after;
    assert.equal(originalTerrain.parameters.render.overhead,30);
    assert.equal(terrain.parameters.render.overhead,60);
    originalTerrain.parameters.render.overhead=60;
    assert.deepEqual(after,before,'Only the accepted overhead change is allowed in the formal saves');
    assert.equal(terrain.settings.timeS,0);
    if(after.runtime)assert.equal(after.runtime.state.lastTarget,0);
    report.saves.push({path,sha256:createHash('sha256').update(bytes).digest('hex'),onlyChange:'render.overhead: 30 -> 60',allOtherFieldsIdentical:true});
}
const folder='docs/evidence/earth-seaice-lighting-20261010';
const beforeControls=JSON.parse(await readFile(`${folder}/before-controls.json`,'utf8'));
const afterControls=JSON.parse(await readFile(`${folder}/after-controls.json`,'utf8'));
assert.deepEqual(afterControls,beforeControls);
assert.equal(afterControls.day,'0.000000');assert.equal(afterControls.playing,'false');
report.sameDay0Controls=true;report.controls=afterControls;
await writeFile(`${folder}/preservation.json`,JSON.stringify(report,null,2)+'\n');
console.log('Formal saves preserve every physical field; day-zero comparison controls match.');
