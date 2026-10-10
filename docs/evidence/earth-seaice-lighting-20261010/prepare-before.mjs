// Run from the repository root. Test today's behavior fixtures against the
// exact reviewed baseline renderer, without changing tracked source or saves.
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const baseline='a4ec11e3ed1c8df5b7a1bfe0e75cc4bfc4d34b41';
const source=spawnSync('git',['show',`${baseline}:render.ts`],{encoding:'utf8'});
if(source.status!==0)throw new Error(source.stderr);
const folder='build/earth-seaice';
await mkdir(folder,{recursive:true});
await build({entryPoints:['tests/gpu-surface-lighting.ts'],bundle:true,format:'esm',outfile:`${folder}/gpu-before.js`,plugins:[{
    name:'baseline-renderer',setup(build){
        build.onLoad({filter:/[\\/]render\.ts$/},()=>({contents:source.stdout,loader:'ts',resolveDir:resolve('.')}));
    },
}]});
await writeFile(`${folder}/gpu-before.html`,'<!doctype html><meta charset="utf-8"><title>Baseline sea surface lighting regression</title><h1>Baseline sea surface lighting regression</h1><pre>Running WebGL2 checks…</pre><canvas id="mapgen4" hidden></canvas><script type="module" src="./gpu-before.js"></script>');
console.log(`Built baseline renderer ${baseline} with current GPU fixtures.`);
