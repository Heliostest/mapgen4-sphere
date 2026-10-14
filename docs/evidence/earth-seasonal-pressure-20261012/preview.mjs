import {readFile,writeFile} from 'node:fs/promises';
const folder='build/earth-seasonal-pressure',source=await readFile('scenes/earth-land-sea/index.html','utf8');
for(const [name,profile,day,label,note] of [
 ['before','control',365,'环流调整前 · 同库存一年','上轮冷锋档 · 原环流 · 正式默认未改'],
 ['balanced','balanced',365,'海陆热压对照 · 同库存一年','实际风受摩擦 · 西南澳季节排序改善 · 北澳湿偏与积雪退化'],
 ['boundary','boundaryMix1',365,'边界层热压对照 · 同库存一年','水汽混合 100 万 · 印度和山前年雨改善 · 北澳湿偏与温带退化'],
 ['initial','boundaryMix1',0,'季节环流实验 · 从同库存推进','边界层候选 · 正式默认未改 · 尚未通过区域气候验收'],
 ]){
 const file=`full-${profile}-day${day}.json`;
 const html=source.replace("from './sidebar.js'","from '../../scenes/earth-land-sea/sidebar.js'")
 .replaceAll('earth-simulation.json',file)
 .replace('href="drainage-source.json"','href="../../scenes/earth-land-sea/drainage-source.json"')
 .replace('<title>地球真实地形 · Mapgen4</title>',`<title>${label} · Mapgen4</title>`)
 .replace('<strong>地球真实地形</strong>',`<strong>${label}</strong>`)
 .replace('21.5 万地形单元 · 真实高程 · 气候与河流为模拟',note)
 .replace('<a href="https://www.ncei.noaa.gov/products/etopo-global-relief-model" target="_blank" rel="noopener">NOAA 高程来源</a>',
 '<a href="before-preview.html">调整前</a> <a href="balanced-preview.html">海陆热压</a> <a href="boundary-preview.html">边界层热压</a> <a href="initial-preview.html">从初值推进</a> <a href="../../docs/evidence/earth-seasonal-pressure-20261012/report.md">数值验收</a>')
 .replace('view.disabled=relief.disabled=false;status.textContent',"view.disabled=relief.disabled=false;view.dispatchEvent(new Event('change'));status.textContent");
 await writeFile(`${folder}/${name}-preview.html`,html);
}
console.log('Four independent experimental previews generated.');
