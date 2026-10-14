import {readFile,writeFile} from 'node:fs/promises';
const folder='build/earth-balanced-settings',selected=process.argv[2]??'mix4',source=await readFile('scenes/earth-land-sea/index.html','utf8');
const epsilon=selected==='mix4'?.575:.58,alternate=selected==='mix4'?'mix4cool':'mix4';
for(const [name,file,label,note] of [
 ['balanced',`full-${selected}-day365.json`,'水汽混合对照 · 一年真实积分后',`发射率 ${epsilon} · 热输送 0.80 · 水汽混合 400万 · 独立实验`],
 ['before','full-direct-day365.json','上轮融冰档 · 一年真实积分后','发射率 0.575 · 热输送 0.80 · 水汽混合 100万 · 相同初始库存'],
 ['alternate',`full-${alternate}-day365.json`,'发射率对照 · 一年真实积分后',`发射率 ${selected==='mix4'?.58:.575} · 水汽混合 400万 · 独立实验`],
 ['initial',`full-${selected}-day0.json`,'水汽混合对照 · 同库存初值',`发射率 ${epsilon} · 水汽混合 400万 · 从同库存初值推进`],
]){
 const html=source.replace("from './sidebar.js'","from '../../scenes/earth-land-sea/sidebar.js'")
 .replaceAll('earth-simulation.json',file)
 .replace('href="drainage-source.json"','href="../../scenes/earth-land-sea/drainage-source.json"')
 .replace('<title>地球真实地形 · Mapgen4</title>',`<title>${label} · Mapgen4</title>`)
 .replace('<strong>地球真实地形</strong>',`<strong>${label}</strong>`)
 .replace('21.5 万地形单元 · 真实高程 · 气候与河流为模拟',note)
 .replace('<a href="https://www.ncei.noaa.gov/products/etopo-global-relief-model" target="_blank" rel="noopener">NOAA 高程来源</a>',
 '<a href="before-preview.html">上轮档</a> <a href="balanced-preview.html">混合对照</a> <a href="alternate-preview.html">辐射对照</a> <a href="initial-preview.html">从初值推进</a> <a href="../../docs/evidence/earth-balanced-settings-20261012/report.md">验收及区域退化</a>')
 .replace('value="820,420" selected','value="820,420"').replace('value="270,440"','value="270,440" selected')
 .replace("view.disabled=relief.disabled=false;status.textContent","view.disabled=relief.disabled=false;view.dispatchEvent(new Event('change'));status.textContent");
 await writeFile(`${folder}/${name}-preview.html`,html);
}
console.log(JSON.stringify({selected,epsilon,formalSourceUntouched:true}));
