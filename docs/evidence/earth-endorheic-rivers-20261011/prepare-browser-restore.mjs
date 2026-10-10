// Use the scene's normal same-origin restore flow when Chrome's upload helper
// has no file-URL permission. Pass a downloaded simulation file as argument.
import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
const folder='build/endorheic';await mkdir(folder,{recursive:true});
if(process.argv[2])await copyFile(process.argv[2],`${folder}/browser-play-save.json`);
const page=(await readFile('scenes/earth-land-sea/index.html','utf8'))
    .replace("from './sidebar.js'","from '/scenes/earth-land-sea/sidebar.js'")
    .replace("fetch('./earth-simulation.json')","fetch('/build/endorheic/browser-play-save.json')");
await writeFile(`${folder}/reload.html`,page);
await writeFile(`${folder}/day24.html`,page.replace('/build/endorheic/browser-play-save.json','/build/endorheic/day24.json'));
console.log(`Ready: http://localhost:8002/${folder}/reload.html`);
