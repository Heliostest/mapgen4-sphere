import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
await mkdir('build/tests', {recursive: true});
await build({entryPoints: ['tests/sphere.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'build/tests/sphere.test.mjs'});
await build({entryPoints: ['tests/gpu-radial.ts'], bundle: true, format: 'esm', outfile: 'build/tests/gpu-radial.js'});
const run = spawnSync(process.execPath, ['--test', 'build/tests/sphere.test.mjs'], {stdio: 'inherit'});
process.exitCode = run.status ?? 1;
