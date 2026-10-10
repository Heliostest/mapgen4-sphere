// Build a same-origin historical renderer and saved world for matched screenshots.
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {relative,resolve,extname} from 'node:path';
const baseline='fdf4b6bd95d578d481ef8152c2b03b064225c68c',root=resolve('.'),folder='build/endorheic-before';
const old=path=>execFileSync('git',['show',`${baseline}:${path}`],{maxBuffer:100*1024*1024});
const historical={name:'historical-source',setup(builder){builder.onLoad({filter:/\.(ts|js)$/},args=>{
    const path=relative(root,args.path).replaceAll('\\','/');
    if(path.startsWith('node_modules/'))return;
    return {contents:old(path).toString('utf8'),loader:extname(path)==='.ts'?'ts':'js'};
});}};
await mkdir(`${folder}/build`,{recursive:true});
await build({entryPoints:['mapgen4.ts'],bundle:true,plugins:[historical],outfile:`${folder}/build/_bundle.js`});
await build({entryPoints:['worker.ts'],bundle:true,plugins:[historical],outfile:`${folder}/build/_worker.js`});
await writeFile(`${folder}/embed.html`,old('embed.html'));
await writeFile(`${folder}/earth-simulation.json`,old('scenes/earth-land-sea/earth-simulation.json'));
const scene=(await readFile('scenes/earth-land-sea/index.html','utf8'))
    .replace("from './sidebar.js'","from '/scenes/earth-land-sea/sidebar.js'")
    .replace('../../embed.html?','/build/endorheic-before/embed.html?')
    .replace("fetch('./earth-simulation.json')","fetch('/build/endorheic-before/earth-simulation.json')");
await writeFile(`${folder}/index.html`,scene);
console.log(`Historical baseline ready at http://localhost:8002/${folder}/index.html`);
