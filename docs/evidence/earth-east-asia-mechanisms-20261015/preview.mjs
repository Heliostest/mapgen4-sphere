import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='build/earth-east-asia-mechanisms';
const doc=JSON.parse(await readFile('scenes/earth-land-sea/earth-simulation.json','utf8'));
const before=structuredClone(doc.runtime.state);
doc.runtime.config.airRadiationFraction=.5;
Object.assign(doc.runtime.waterConfig,{moistureScheme:'transport',buoyantConvection:true});
assert.deepEqual(doc.runtime.state,before);
await mkdir(out,{recursive:true});
await writeFile(`${out}/preview-simulation.json`,JSON.stringify(doc));
let html=await readFile('scenes/earth-land-sea/index.html','utf8');
html=html.replaceAll('./sidebar.js','../../scenes/earth-land-sea/sidebar.js')
 .replaceAll('earth-simulation.json','preview-simulation.json')
 .replaceAll('href="drainage-source.json"','href="../../scenes/earth-land-sea/drainage-source.json"')
 .replaceAll('地球真实地形','浮力对流实验')
 .replace('21.5 万地形单元 · 真实高程 · 气候与河流为模拟','共享水汽 + 浮力触发 · 同正式第零天库存 · 雨季偏差仍未通过');
await writeFile(`${out}/preview.html`,html);
