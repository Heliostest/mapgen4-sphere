/** Restore strict simulation snapshots through the existing scene import UI.
 * Run at the repository root after the evidence integrations. This generates
 * local build pages only and leaves the published Earth wrapper unchanged. */
import {readFile,writeFile} from 'node:fs/promises';
const original=await readFile('scenes/earth-land-sea/index.html','utf8');
for(const label of ['before','after'])for(const day of [0,90,180,270,365]){
 const html=original.replace('<title>','<base href="/scenes/earth-land-sea/"><title>').replace("fetch('./earth-simulation.json')",`fetch('/build/earth-moisture-climate/${label}-day${day}.json')`);
 await writeFile(`build/earth-moisture-climate/${label}-day${day}.html`,html);
}
