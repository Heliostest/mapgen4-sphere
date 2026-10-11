import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
const label=process.argv[2]??'current';
await build({entryPoints:['docs/evidence/earth-moisture-structural-20261011/hypothesis-contracts.ts'],bundle:true,platform:'node',format:'esm',outfile:`build/earth-moisture-structural/${label}-contracts.test.mjs`,plugins:label==='current'?[]:[{name:label,setup(b){b.onLoad({filter:/[\\/]circulation\.ts$/},async()=>({contents:await readFile(`build/earth-moisture-structural/${label}-circulation.ts`,'utf8'),loader:'ts'}));}}]});
