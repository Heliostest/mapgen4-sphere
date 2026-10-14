import {readFile,writeFile} from 'node:fs/promises';
const folder='build/earth-direct-settings',source=await readFile('scenes/earth-land-sea/index.html','utf8');
for(const [name,file,label,note] of [
  ['direct','full-direct0575-day365.json','进一步融冰 · 一年真实积分后','有效发射率 0.575 · 热输送 0.80 · 独立实验'],
  ['current','../earth-parameter-tuning/full-tuned-day365.json','温和档对照 · 一年真实积分后','有效发射率 0.595 · 热输送 0.80 · 相同初始库存'],
  ['initial','full-direct0575-day0.json','进一步融冰 · 同库存初值','有效发射率 0.575 · 热输送 0.80 · 从初值推进']
]){
  const html=source.replace("from './sidebar.js'","from '../../scenes/earth-land-sea/sidebar.js'")
    .replaceAll('earth-simulation.json',file)
    .replace('href="drainage-source.json"','href="../../scenes/earth-land-sea/drainage-source.json"')
    .replace('<title>地球真实地形 · Mapgen4</title>',`<title>${label} · Mapgen4</title>`)
    .replace('<strong>地球真实地形</strong>',`<strong>${label}</strong>`)
    .replace('21.5 万地形单元 · 真实高程 · 气候与河流为模拟',note)
    .replace('<a href="https://www.ncei.noaa.gov/products/etopo-global-relief-model" target="_blank" rel="noopener">NOAA 高程来源</a>',
      '<a href="current-preview.html">温和档</a> <a href="direct-preview.html">进一步融冰</a> <a href="initial-preview.html">从初值推进</a>')
    .replace('value="820,420" selected','value="820,420"').replace('value="270,440"','value="270,440" selected')
    .replace("view.disabled=relief.disabled=false;status.textContent", "view.disabled=relief.disabled=false;view.dispatchEvent(new Event('change'));status.textContent");
  await writeFile(`${folder}/${name}-preview.html`,html);
}
