import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
await build({entryPoints:['tests/terrain-water-benchmark.ts'],bundle:true,platform:'node',format:'esm',outfile:'build/tests/terrain-water-benchmark.mjs'});
process.exitCode=spawnSync(process.execPath,['build/tests/terrain-water-benchmark.mjs'],{stdio:'inherit'}).status??1;
