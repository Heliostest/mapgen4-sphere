import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
const label=process.argv[2]??'candidate';
const names=['circulation','water','reference-moisture'];
await build({entryPoints:['docs/evidence/earth-moisture-structural-20261011/integrate.ts'],bundle:true,platform:'node',format:'esm',outfile:`build/earth-moisture-structural/integrate-${label}.mjs`,plugins:label==='baseline'?[{name:'frozen-prior-p0',setup(b){b.onLoad({filter:/[\\/](circulation|water|reference-moisture)\.ts$/},async a=>{
 const name=names.find(n=>a.path.endsWith(`${n}.ts`));
 return {contents:await readFile(`docs/evidence/earth-moisture-structural-20261011/frozen-baseline-${name}.ts`,'utf8'),loader:'ts'};
});}}]:[]});
