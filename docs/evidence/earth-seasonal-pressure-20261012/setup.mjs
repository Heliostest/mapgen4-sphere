import fs from 'node:fs/promises';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
const folder='docs/evidence/earth-seasonal-pressure-20261012',out='build/earth-seasonal-pressure';
await fs.mkdir(out,{recursive:true});
await fs.mkdir(out+'/bundles',{recursive:true});
for(const kind of ['screen','full','causes','restore']){await build({entryPoints:[folder+'/'+kind+'.ts'],outfile:out+'/'+kind+'.mjs',bundle:true,platform:'node',format:'esm',target:'node24'});const bytes=await fs.readFile(out+'/'+kind+'.mjs'),sha=createHash('sha256').update(bytes).digest('hex');await fs.writeFile(out+'/bundles/'+sha+'.mjs',bytes);}
