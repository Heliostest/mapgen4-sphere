import {readFile,writeFile} from 'node:fs/promises';
const folder='build/earth-parameter-tuning',source=await readFile('scenes/earth-land-sea/index.html','utf8');
for(const [name,file,label] of [
  ['tuned','full-tuned-day365.json','温和调参 · 一年真实积分后'],
  ['control','full-control-day365.json','相同初值对照 · 一年真实积分后'],
  ['initial','full-tuned-day0.json','温和调参 · 同库存初值']
]){
  let html=source.replace("from './sidebar.js'","from '../../scenes/earth-land-sea/sidebar.js'")
    .replaceAll('earth-simulation.json',file)
    .replace('href="drainage-source.json"','href="../../scenes/earth-land-sea/drainage-source.json"')
    .replace('<title>地球真实地形 · Mapgen4</title>',`<title>${label} · Mapgen4</title>`)
    .replace('<strong>地球真实地形</strong>',`<strong>${label}</strong>`)
    .replace('21.5 万地形单元 · 真实高程 · 气候与河流为模拟',name==='control'?'热输送 0.55 · 有效发射率 0.61 · 保留里海库存':'热输送 0.80 · 有效发射率 0.595 · 正式默认不变')
    .replace('<a href="https://www.ncei.noaa.gov/products/etopo-global-relief-model" target="_blank" rel="noopener">NOAA 高程来源</a>',
      '<a href="control-preview.html">一年对照</a> <a href="tuned-preview.html">一年候选</a> <a href="initial-preview.html">从初值推进</a>')
    .replace('value="820,420" selected','value="820,420"').replace('value="585,410"','value="585,410" selected')
    .replace("view.disabled=relief.disabled=false;status.textContent", "view.disabled=relief.disabled=false;view.dispatchEvent(new Event('change'));status.textContent");
  await writeFile(`${folder}/${name}-preview.html`,html);
}
