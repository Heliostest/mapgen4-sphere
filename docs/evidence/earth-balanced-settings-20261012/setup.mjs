import fs from 'node:fs/promises';
import {build} from 'esbuild';
const folder='docs/evidence/earth-balanced-settings-20261012',out='build/earth-balanced-settings';
await fs.mkdir(folder,{recursive:true});await fs.mkdir(out,{recursive:true});
const base={thermal:{diffusion:.8,emissivity:.575}};
const profiles={
  direct:base,
  mild:{thermal:{diffusion:.8,emissivity:.595}},
  mix3:{...base,water:{moistureDiffusivityM2s:3e6}},
  evap045:{...base,water:{evaporationFraction:.45}},
  ocean10:{...base,environment:{oceanStrengthMps:1}},
};
try{await fs.access(`${folder}/profiles.json`);}catch{await fs.writeFile(`${folder}/profiles.json`,JSON.stringify(profiles,null,2)+'\n');}
for(const name of ['screen','full']){
  const source=await fs.readFile(`docs/evidence/earth-direct-settings-20261011/${name}.ts`,'utf8');
  try{await fs.access(`${folder}/${name}.ts`);}catch{await fs.writeFile(`${folder}/${name}.ts`,source.replaceAll('docs/evidence/earth-direct-settings-20261011',folder).replaceAll('build/earth-direct-settings',out));}
  await build({entryPoints:[`${folder}/${name}.ts`],outfile:`${out}/${name}.mjs`,bundle:true,platform:'node',format:'esm',target:'node24'});
}
for(const [label,old] of [['direct','direct0575'],['mild','current']]){
 const coarse=JSON.parse(await fs.readFile(`docs/evidence/earth-direct-settings-20261011/screen-${old}.json`,'utf8'));
 coarse.reusedFrom=`docs/evidence/earth-direct-settings-20261011/screen-${old}.json`;coarse.label=label;coarse.parameters=profiles[label];
 await fs.writeFile(`${out}/screen-${label}.json`,JSON.stringify(coarse,null,2)+'\n');
 const full=JSON.parse(await fs.readFile(`docs/evidence/earth-direct-settings-20261011/full-${label==='direct'?'direct0575':'current'}.json`,'utf8'));
 full.reusedFrom=`docs/evidence/earth-direct-settings-20261011/full-${label==='direct'?'direct0575':'current'}.json`;full.label=label;full.parameters=profiles[label];
 await fs.writeFile(`${out}/full-${label}.json`,JSON.stringify(full,null,2)+'\n');
}
console.log(JSON.stringify({profiles:Object.keys(profiles),baseline:'same-stock completed annual integrations reused; formal default unchanged'}));
