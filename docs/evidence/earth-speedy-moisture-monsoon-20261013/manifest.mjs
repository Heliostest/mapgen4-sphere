import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-speedy-moisture-monsoon-20261013',out='build/earth-speedy-moisture-monsoon';
const ids=['moisture-seasonal','coupled-slab','coupled-seasonal'];
const hash=b=>createHash('sha256').update(b).digest('hex');
const load=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
async function walk(dir){const rows=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=`${dir}/${e.name}`;rows.push(...e.isDirectory()?await walk(p):[p]);}return rows;}
const bind=async path=>{const bytes=await readFile(path);return {path,bytes:bytes.length,sha256:hash(bytes)};};
const launches=[];
for(const id of ids){
 const native=await load(`${folder}/${id}-native-status.json`),launch=await load(`${out}/${id}-launch.json`);
 assert.equal(native.code,0);assert(native.sourceUnchanged);assert.equal(native.configuration.MASS_IMPLEMENTATION,'fixed');assert.equal(native.configuration.SPEEDY_SMOKE,'0');
 for(const [path,sha]of Object.entries({...launch.files,...native.sourceBefore}))assert.equal(hash(await readFile(path)),sha,`Changed integration source: ${path}`);
 launches.push({id,launch,native});
}
// Preserve the precise green-test sources, even where later changes only added attribution comments.
const proofs=[];
for(const name of ['condensation-regression-native-status.json','mass-water-fixed-green-native-status.json','boundary-layer-fixed.json','vertical-diffusion-final-green-status.json','restart-test-native-status.json','audit-coupled-native-status.json']){
 const proof=await load(`${folder}/${name}`);assert.equal(proof.code??proof.exitCode,0);assert(proof.sourceUnchanged);
 const sources=[];
 for(const [path,digest]of Object.entries(proof.sourceBefore)){
  const sha=digest.toLowerCase(),dir=`${folder}/source-archives/${sha}`,archive=`${dir}/${basename(path)}`;
  let b;try{b=await readFile(archive);}catch{b=await readFile(path);assert.equal(hash(b),sha,`Missing original proof source: ${path}`);await mkdir(dir,{recursive:true});await writeFile(archive,b);}
  assert.equal(hash(b),sha);sources.push({original:path,archive,sha256:sha});
 }
 proofs.push({path:`${folder}/${name}`,sources});
}
const previous=await load('docs/evidence/earth-speedy-budgets-sst-20261012/manifest.json');
for(const b of [...previous.bindings,...previous.archives])assert.equal(hash(await readFile(b.path)),b.sha256,`Frozen previous evidence changed: ${b.path}`);
const preservation=await load(`${folder}/preservation-verification.json`);
const source=(await walk(folder)).filter(p=>!p.includes('/raw/')&&!p.endsWith('/manifest.json')&&!p.endsWith('/final-verification.json'));
const results=(await walk(out)).filter(p=>/\.(json|mjs|js|html|css|log)$/.test(p));
const renderer=Object.keys((await load(`${out}/preview-metafile.json`)).inputs);
const nativeSource=await walk('build/earth-speedyweather/depot/packages/SpeedyWeather/qRu16/src');
const extras=['thermal.ts','water.ts','environment.ts','climate-diagnostics.ts','docs/evidence/earth-speedyweather-20261012/remap.mjs','build/_worker.js','worker.ts','map.ts','docs/evidence/earth-speedy-budgets-sst-20261012/manifest.json','docs/evidence/earth-speedy-budgets-sst-20261012/acceptance.json','build/earth-speedy-budgets-sst/seasonal-statistics.json','build/earth-speedy-budgets-sst/seasonal-geometry.json','build/earth-speedyweather/display.json','docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json','build/earth-seasonal-pressure/full-control.json','build/earth-seasonal-pressure/full-control-day0.json'];
const bindings=await Promise.all([...new Set([...source,...results,...renderer,...nativeSource,...extras,...launches.flatMap(a=>Object.keys(a.launch.files))])].sort().map(bind));
const archivePaths=['comparison-display.json','restart-verification.json','audit-native.json','audit-fixed.json','audit-fixed-mass-fixed.json','audit-coupled-mass-fixed.json',...ids.flatMap(id=>[`${id}-statistics.json`,`${id}-geometry.json`,`${id}-initial.jld2`,`${id}-statistics-start.jld2`,`${id}-final.jld2`])];
const archives=[];await mkdir(`${folder}/raw`,{recursive:true});
for(const name of archivePaths){const raw=await readFile(`${out}/${name}`),compressed=gzipSync(raw),path=`${folder}/raw/${name}.gz`;await writeFile(path,compressed);assert.equal(hash(gunzipSync(compressed)),hash(raw));archives.push({path,bytes:compressed.length,sha256:hash(compressed),original:`${out}/${name}`,rawSha256:hash(raw)});}
const manifest={createdUTC:new Date().toISOString(),software:previous.software,initialAtmLandSHA:'4c665c83b08918fad6f8b67968fae472539c8796515afc93a22099d682b44a68',launches,proofs,formalDefaultBindings:preservation.defaults,formalSha256:preservation.formalSha256,oldEvidenceBindingsVerified:previous.bindings.length,oldArchivesVerified:previous.archives.length,bindings,archives,
 limits:['All integrations are continuous; no diagnostic-statistics restart is claimed.','Physical restart comparison is one step with the same model sources and parameters.','Three-day water closure is distinct from subdaily and long-term residuals.','Native diffusion K stability approximation is retained; this is not a full Frierson reproduction.','One statistics year versus GPCC climatology does not establish regional climate skill.','Full ocean/sea-ice water and latent-heat stocks remain unavailable.']};
await writeFile(`${folder}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({bindings:bindings.length,archives:archives.length,archiveBytes:archives.reduce((s,v)=>s+v.bytes,0),verifiedLongIntegrations:launches.length,verifiedGreenProofs:proofs.length}));
