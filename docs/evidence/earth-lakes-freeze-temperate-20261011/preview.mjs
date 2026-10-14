import {readFile,writeFile} from 'node:fs/promises';
const folder='build/earth-lakes-freeze-temperate';
const source=await readFile('scenes/earth-land-sea/index.html','utf8');
for(const [name,file,label] of [['formal','../../scenes/earth-land-sea/earth-simulation.json','正式初值对照'],['lake','lake-day0.json','湖泊初值实验'],['after','after-day365.json','陆海闭合对照：年末状态'],['transport','transport-day365.json','既有共享水汽对照：年末状态']]){
 const html=source.replace("from './sidebar.js'","from '../../scenes/earth-land-sea/sidebar.js'")
  .replaceAll('earth-simulation.json',file).replace('href="drainage-source.json"','href="../../scenes/earth-land-sea/drainage-source.json"')
  .replace('<strong>地球真实地形</strong>',`<strong>${label}</strong>`);
 await writeFile(`${folder}/${name}-preview.html`,html);
}
