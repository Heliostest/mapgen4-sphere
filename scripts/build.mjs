import {build} from 'esbuild';
import {mkdir, writeFile} from 'node:fs/promises';
await mkdir('build', {recursive:true});
// Always overwrite both runtime entry points. No precomputed planar points
// or assets from the rejected implementation are loaded by this build.
await Promise.all([
    build({entryPoints:['mapgen4.ts'],bundle:true,minify:true,sourcemap:true,outfile:'build/_bundle.js'}),
    build({entryPoints:['worker.ts'],bundle:true,minify:true,sourcemap:true,outfile:'build/_worker.js'}),
]);
await writeFile('build/version.json',JSON.stringify({implementation:'sphere-original-renderer',builtAt:new Date().toISOString()}));
console.log('Built spherical Mapgen4 with the original WebGL renderer.');
