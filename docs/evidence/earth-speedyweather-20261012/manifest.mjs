import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {resolve,relative} from 'node:path';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-speedyweather-20261012',out='build/earth-speedyweather';
const hash=b=>createHash('sha256').update(b).digest('hex');
const bind=async path=>{const b=await readFile(path);return {path,bytes:b.length,sha256:hash(b)};};
const launch=JSON.parse(await readFile(`${out}/annual-launch.json`,'utf8'));
for(const [path,sha] of Object.entries(launch.files))assert.equal(hash(await readFile(path)),sha,`Producer changed: ${path}`);
const defaultBindings=[];
for(const [file,name] of [['thermal.ts','THERMAL'],['water.ts','WATER'],['environment.ts','ENVIRONMENT']]) {
 const current=await readFile(file,'utf8'),head=execFileSync('git',['show',`HEAD:${file}`],{encoding:'utf8'});
 const pattern=new RegExp(`export const DEFAULT_${name}[^=]*=Object\\.freeze\\(\\{[\\s\\S]*?\\}\\);`);
 const a=current.match(pattern)?.[0],b=head.match(pattern)?.[0];assert(a&&b);assert.equal(a,b);
 defaultBindings.push({file,name:`DEFAULT_${name}`,sha256:hash(a),exactlyMatchesHEAD:true});
}
const inputs=['scenes/earth-land-sea/earth-simulation.json','build/earth-seasonal-pressure/full-control.json','build/earth-seasonal-pressure/full-control-day0.json','docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json','docs/evidence/earth-seaice-causal-20261011/nsidc-same-grid.json','docs/evidence/earth-seaice-causal-20261011/nsidc-inputs.json'];
const assets=[];
for(const dir of await readdir(`${out}/depot/artifacts`,{withFileTypes:true})) {
 if(!dir.isDirectory())continue;
 for(const file of await readdir(`${out}/depot/artifacts/${dir.name}`))if(file.endsWith('.nc'))assets.push(`${out}/depot/artifacts/${dir.name}/${file}`);
}
assert.equal(assets.length,6);
const packagesrc=`${out}/depot/packages/SpeedyWeather/qRu16`;
const nativeSources=['Project.toml','src/models/primitive_wet.jl','src/time_stepping/time_integration.jl','src/time_stepping/transform.jl','src/time_stepping/steppers/leapfrog.jl','src/dynamics/hole_filling.jl','src/dynamics/horizontal_diffusion.jl','src/parameterizations/ocean.jl','src/parameterizations/sea_ice.jl','src/parameterizations/land/soil_moisture.jl'].map(p=>`${packagesrc}/${p}`);
nativeSources.push(`${out}/depot/packages/RingGrids/UqS6H/Artifacts.toml`);
const sources=(await readdir(folder)).filter(p=>/\.(jl|mjs|ts|css|html|py|md)$/.test(p)).map(p=>`${folder}/${p}`);
const evidence=(await readdir(folder)).filter(p=>/\.(json|png|jpg|svg)$/.test(p)&&p!=='manifest.json'&&p!=='final-verification.json').map(p=>`${folder}/${p}`);
const viewer=JSON.parse(await readFile(`${out}/preview-metafile.json`,'utf8'));
const rendererSources=Object.keys(viewer.inputs);
rendererSources.push('worker.ts','map.ts','build/_worker.js');
const software=['runtime/runtime-source.json','annual-launch.json'].map(p=>`${out}/${p}`).concat([`${folder}/julia-env/Project.toml`,`${folder}/julia-env/Manifest.toml`]);
const results=['annual-geometry.json','annual-initial-inventory.json','annual-statistics-start-inventory.json','annual-statistics.json','restart-verification.json','display.json','zonal-circulation.json','preview.js','index.html'].map(p=>`${out}/${p}`);
const bindings=await Promise.all([...new Set([...inputs,...assets,...nativeSources,...sources,...evidence,...rendererSources,...software,...results])].map(bind));
const archives=[];await mkdir(`${folder}/raw`,{recursive:true});
for(const path of [`${out}/annual-statistics.json`,`${out}/annual-geometry.json`,`${out}/annual-initial.jld2`,`${out}/annual-statistics-start.jld2`,`${out}/annual-final.jld2`,`${out}/display.json`]) {
 const b=await readFile(path),name=path.split('/').at(-1)+'.gz',compressed=gzipSync(b);await writeFile(`${folder}/raw/${name}`,compressed);
 archives.push({file:`raw/${name}`,bytes:compressed.length,sha256:hash(compressed),rawSha256:hash(b)});
}
await writeFile(`${folder}/manifest.json`,JSON.stringify({createdUTC:new Date().toISOString(),launch,software:{julia:'1.12.7',SpeedyWeather:'0.23.0',registeredGitTreeSha1:'a310694f09c0fcca98c67671b5fce53c621c72bd',T32Api:'truncation=32; includes degree zero; maximum degree 31'},formalDefaultBindings:defaultBindings,bindings,archives,
 limits:['Independent native inventories; no old/new same-stock causal claim.','Atmospheric mass/water, land water and slab surface heat are scoped diagnostics; full Earth finite water and ice latent energy unavailable.','Replay terrain detail is independent of T32 resolution.'],cwd:resolve('.'),pathsAreWorkspaceRelative:true},null,2)+'\n');
console.log(JSON.stringify({bindings:bindings.length,assets:assets.length,archives:archives.length,defaultsUnchanged:true}));
