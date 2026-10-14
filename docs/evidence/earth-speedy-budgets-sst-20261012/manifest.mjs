import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-speedy-budgets-sst-20261012',out='build/earth-speedy-budgets-sst';
const hash=b=>createHash('sha256').update(b).digest('hex');
const bind=async path=>{const b=await readFile(path);return {path,bytes:b.length,sha256:hash(b)};};
const code=JSON.parse(await readFile(`${folder}/code-verification.json`,'utf8'));
const launches=[];
for(const id of ['slab','seasonal']){
 const launch=JSON.parse(await readFile(`${out}/${id}-launch.json`,'utf8')),native=JSON.parse(await readFile(`${folder}/${id}-native-status.json`,'utf8'));
 assert.equal(native.code,0);assert.equal(native.sourceUnchanged,true);
 for(const [path,sha]of Object.entries(launch.files))assert.equal(hash(await readFile(path)),sha,`Changed producer: ${path}`);
 launches.push({id,launch,native});
}
const old=JSON.parse(await readFile('docs/evidence/earth-speedyweather-20261012/manifest.json','utf8'));
for(const b of old.bindings)assert.equal(hash(await readFile(b.path)),b.sha256,`Changed prior experiment: ${b.path}`);
const source=(await readdir(folder)).filter(p=>/\.(jl|mjs|ts|css|html|py|md|log|json|jpg|png|svg)$/.test(p)&&!['manifest.json','final-verification.json'].includes(p)).map(p=>`${folder}/${p}`);
const results=(await readdir(out)).filter(p=>/\.(json|mjs|js|html|css)$/.test(p)).map(p=>`${out}/${p}`);
const renderer=Object.keys(JSON.parse(await readFile(`${out}/preview-metafile.json`,'utf8')).inputs);
const extras=['build/_worker.js','worker.ts','map.ts','build/earth-speedyweather/annual-statistics.json','build/earth-speedyweather/annual-geometry.json','build/earth-speedyweather/display.json','build/earth-speedyweather/smoke-statistics.json','build/earth-speedyweather/annual-initial.jld2','docs/evidence/earth-speedyweather-20261012/manifest.json','docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json','build/earth-seasonal-pressure/full-control.json','build/earth-seasonal-pressure/full-control-day0.json','build/earth-speedyweather/depot/packages/SpeedyWeather/qRu16/src/parameterizations/land/snow.jl'];
const bindings=await Promise.all([...new Set([...source,...results,...renderer,...extras,...old.bindings.filter(b=>b.path.includes('/depot/')||b.path.includes('/julia-env/')).map(b=>b.path),...Object.keys(launches[0].launch.files)])].map(bind));
const archivePaths=['comparison-display.json',...['slab','seasonal'].flatMap(id=>[`${id}-statistics.json`,`${id}-geometry.json`,`${id}-initial.jld2`,`${id}-statistics-start.jld2`,`${id}-final.jld2`])];
const archives=[];await mkdir(`${folder}/raw`,{recursive:true});
for(const name of archivePaths){
 const raw=await readFile(`${out}/${name}`),compressed=gzipSync(raw),path=`${folder}/raw/${name}.gz`;
 await writeFile(path,compressed);assert.equal(hash(gunzipSync(compressed)),hash(raw));
 archives.push({path,bytes:compressed.length,sha256:hash(compressed),rawSha256:hash(raw)});
}
const manifest={createdUTC:new Date().toISOString(),software:old.software,launches,formalDefaultBindings:code.defaults,formalSha256:code.formalSha256,oldEvidenceBindingsVerified:old.bindings.length,bindings,archives,initialAtmLandSHA:'4c665c83b08918fad6f8b67968fae472539c8796515afc93a22099d682b44a68',limits:['Same 2001 initial atmosphere/land and physical ocean; 2006 states differ through actual integration.','Global pressure-mode dry-air constraint is explicit numerical correction; remaining atmospheric water residual is retained.','SST boundary includes external heat and native ice feedback; finite ocean water/ice latent inventory is unavailable.','Monthly T32 output is a single-year sensitivity comparison with GPCC climatology; regional climate acceptance remains false.','Display mesh detail is geography only; dynamical grid remains T32, eight layers.']};
await writeFile(`${folder}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({bindings:bindings.length,archives:archives.length,archiveBytes:archives.reduce((s,v)=>s+v.bytes,0),oldEvidenceVerified:old.bindings.length,defaultsUnchanged:true}));
