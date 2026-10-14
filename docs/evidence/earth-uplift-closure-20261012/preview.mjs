import {readFile,writeFile} from 'node:fs/promises';
const folder='build/earth-uplift-closure',source=await readFile('scenes/earth-land-sea/index.html','utf8');
for(const [name,profile,day,label,note] of [
 ['before','control',365,'闭合修复前 · 同库存一年','上轮控制组 · 发射率 0.58 · 热输送 0.80 · 水汽混合 400 万'],
 ['cold-front','coldFront',365,'冷锋抬升补齐 · 同库存一年','仅补冷空气推进抬升 · 保留原地形雨 · 尚未通过季节验收'],
 ['closure','eddyCold',365,'输送与抬升分离 · 同库存一年','扩散不再直接制造地形雨 · 冷锋补齐 · 山地偏干与冬雨缺失仍在'],
 ['initial','eddyCold',0,'闭合实验 · 从同库存初值推进','独立实验 · 正式默认未改 · 当前显示同库存日零初值'],
 ]){
 const file=`full-${profile}-day${day}.json`;
 const html=source.replace("from './sidebar.js'","from '../../scenes/earth-land-sea/sidebar.js'")
 .replaceAll('earth-simulation.json',file)
 .replace('href="drainage-source.json"','href="../../scenes/earth-land-sea/drainage-source.json"')
 .replace('<title>地球真实地形 · Mapgen4</title>',`<title>${label} · Mapgen4</title>`)
 .replace('<strong>地球真实地形</strong>',`<strong>${label}</strong>`)
 .replace('21.5 万地形单元 · 真实高程 · 气候与河流为模拟',note)
 .replace('<a href="https://www.ncei.noaa.gov/products/etopo-global-relief-model" target="_blank" rel="noopener">NOAA 高程来源</a>',
 '<a href="before-preview.html">修复前</a> <a href="cold-front-preview.html">仅补冷锋</a> <a href="closure-preview.html">分离抬升</a> <a href="initial-preview.html">从初值推进</a> <a href="../../docs/evidence/earth-uplift-closure-20261012/report.md">数值验收</a>')
 .replace('view.disabled=relief.disabled=false;status.textContent',"view.disabled=relief.disabled=false;view.dispatchEvent(new Event('change'));status.textContent");
 await writeFile(`${folder}/${name}-preview.html`,html);
 }
console.log('Independent experiment previews generated; formal scene untouched.');
