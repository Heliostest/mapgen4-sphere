// Integrate independently sampled classification; never seed a lake inventory.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const folder='scenes/earth-land-sea';
const bytes=await readFile(`${folder}/drainage-samples.json`),samples=JSON.parse(bytes),source=JSON.parse(await readFile(`${folder}/drainage-source.json`,'utf8'));
assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sampleSha256);
for(const name of ['earth-terrain.json','earth-simulation.json']) {
    const d=JSON.parse(await readFile(`${folder}/${name}`,'utf8')),before=structuredClone(d),terrain=d.terrain??d;
    assert.deepEqual(samples.mesh,terrain.mesh);
    assert.equal(samples.basinId.length,terrain.mesh.triangles);assert.equal(samples.terminal.length,terrain.mesh.triangles);assert.equal(samples.inlandLakeId.length,terrain.mesh.triangles);
    terrain.drainage={source:'HydroBASINS v1.c level 4 + Natural Earth closed inland water, integrated classification',basinId:samples.basinId,terminal:samples.terminal,inlandLakeId:samples.inlandLakeId};
    const previous=before.terrain??before;
    assert.deepEqual(terrain.offsets,previous.offsets);assert.deepEqual(terrain.constraints,previous.constraints);
    if(d.runtime)assert.deepEqual(d.runtime,before.runtime);
    await writeFile(`${folder}/${name}`,JSON.stringify(d));
    console.log(`${name}: classification integrated; DEM and every initial store preserved`);
}
