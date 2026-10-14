import fs from 'node:fs/promises';
import {build} from 'esbuild';
const folder='docs/evidence/earth-uplift-closure-20261012',out='build/earth-uplift-closure';
await fs.mkdir(out,{recursive:true});
const profiles=JSON.parse(await fs.readFile(folder+'/profiles.json','utf8'));
for(const kind of ['screen','full','causes','restore'])await build({entryPoints:[folder+'/'+kind+'.ts'],outfile:out+'/'+kind+'.mjs',bundle:true,platform:'node',format:'esm',target:'node24'});
console.log(JSON.stringify({profiles:Object.keys(profiles)}));
