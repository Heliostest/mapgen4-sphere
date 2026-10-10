// Apply the reviewed display profile to existing saves, preserving physics.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const folder='scenes/earth-land-sea';
const {render}=JSON.parse(await readFile(`${folder}/scene-config.json`,'utf8'));
for(const filename of ['earth-terrain.json','earth-simulation.json']){
 const doc=JSON.parse(await readFile(`${folder}/${filename}`,'utf8')),before=structuredClone(doc);
 const terrain=doc.terrain??doc,planet=terrain.settings.planet,p=terrain.parameters.render;
 p.mountain_height=Number((render.exaggeration*p.sphere_radius*planet.reliefM/planet.radiusM).toFixed(3));
 for(const key of ['overhead','outline_strength','outline_water'])p[key]=render[key];
 assert.deepEqual(terrain.offsets,(before.terrain??before).offsets);
 assert.deepEqual(terrain.constraints,(before.terrain??before).constraints);
 if(doc.runtime)assert.deepEqual(doc.runtime,before.runtime);
 await writeFile(`${folder}/${filename}`,JSON.stringify(doc));
 console.log(`${filename}: applied display profile; physical state preserved`);
}
