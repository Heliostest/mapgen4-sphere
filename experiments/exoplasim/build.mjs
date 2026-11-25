import {build} from 'esbuild';
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
const root=process.cwd(),out=resolve('build/exoplasim'),upstream=resolve(process.env.EXOPLASIM_SOURCE||join(tmpdir(),'mapgen4-exoplasim-daface8'));
const commit='daface8c0846dfa2beeda9c98756b2cfc4350937';
if(execFileSync('git',['-C',upstream,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==commit)throw new Error('ExoPlaSim checkout must match the pinned commit');
await mkdir(out,{recursive:true});
const src=join(upstream,'src/model/climate/gcm'),alias={'@':join(upstream,'src'),'@exoplasim/config':join(src,'index.ts'),'@exoplasim/wasm':join(src,'runner/wasm/index.ts'),'@exoplasim/grid':join(src,'grid/index.ts'),'@exoplasim/fields':join(src,'fields/index.ts'),'@exoplasim/namelist':join(src,'namelist/index.ts')};
const workers={name:'worker-urls',setup(b){b.onLoad({filter:/[\\/]runner[\\/]wasm[\\/]index\.ts$/},async({path})=>({contents:(await readFile(path,'utf8')).replace('./gcm.worker.ts','./wasm-worker.js'),loader:'ts'}));b.onLoad({filter:/[\\/]preparation[\\/]index\.ts$/},async({path})=>({contents:(await readFile(path,'utf8')).replace('./preparation.worker.ts','./prepare-worker.js'),loader:'ts'}));}};
const browser={bundle:true,format:'esm',alias,plugins:[workers],loader:{'.wgsl':'text'},define:{'import.meta.env.BASE_URL':'"/build/exoplasim/"'},logLevel:'warning'};
await Promise.all([
 build({...browser,entryPoints:['experiments/exoplasim/runner.ts'],outfile:join(out,'runner.js')}),
 build({...browser,entryPoints:['experiments/exoplasim/audit.ts'],outfile:join(out,'audit.js')}),
 build({...browser,entryPoints:[join(src,'runner/wasm/gcm.worker.ts')],outfile:join(out,'wasm-worker.js')}),
 build({...browser,entryPoints:[join(src,'preparation/preparation.worker.ts')],outfile:join(out,'prepare-worker.js')}),
 ...['prepare','baseline'].map(name=>build({entryPoints:[`experiments/exoplasim/${name}.ts`],bundle:true,platform:'node',format:'esm',outfile:join(out,`${name}.mjs`)})),
]);
// Only the CPU resolution used by this experiment is needed. Never copy the
// upstream bundled Earth DEM; our model boundary comes from the authored world.
await mkdir(join(out,'gcm/t21'),{recursive:true});
await cp(join(upstream,'public/gcm/t21/layers-10'),join(out,'gcm/t21/layers-10'),{recursive:true});
await cp(join(upstream,'public/gcm/t21/exoplasim.data'),join(out,'gcm/t21/exoplasim.data'));
await cp(join(upstream,'public/gcm/manifest.json'),join(out,'gcm/manifest.json'));
await cp(join(upstream,'LICENSE.TXT'),join(out,'EXOPLASIM-LICENSE.TXT'));
await writeFile(join(out,'runner.html'),'<!doctype html><title>ExoPlaSim CPU reference</title><script type="module" src="./runner.js"></script>');
await writeFile(join(out,'audit.html'),'<!doctype html><title>ExoPlaSim input audit</title><script type="module" src="./audit.js"></script>');
await writeFile(join(out,'upstream.json'),JSON.stringify({repository:'https://github.com/Astervolans/web-exoplasim-qol',commit,sourceCheckout:upstream,license:'GPL-2.0',modelSource:'https://github.com/alphaparrot/ExoPlaSim/tree/5f8dff4',patches:'scripts/exoplasim-wasm/'}));
console.log(`Built separate ExoPlaSim reference in ${out}`);
