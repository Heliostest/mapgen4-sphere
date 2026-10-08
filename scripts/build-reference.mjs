// Compile an isolated, unmodified upstream fixture for visual comparison.
import {execFileSync} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {build} from 'esbuild';
const commit='c1d8cb018a11a8b9e17d59233c36c176429d37eb';
const directory=resolve('build/reference');
const files=execFileSync('git',['ls-tree','-r','--name-only',commit],{encoding:'utf8'}).trim().split('\n');
for (const file of files) {
    if (!/\.(ts|js|html)$/.test(file)) continue;
    const path=resolve(directory,file);
    await mkdir(dirname(path),{recursive:true});
    await writeFile(path,execFileSync('git',['show',`${commit}:${file}`]));
}
const options={absWorkingDir:directory,bundle:true};
await build({...options,entryPoints:['generate-points-file.ts'],platform:'node',format:'esm',outfile:'build/points.mjs'});
execFileSync(process.execPath,['build/points.mjs'],{cwd:directory,stdio:'inherit'});
await build({...options,entryPoints:['mapgen4.ts'],outfile:'build/_bundle.js'});
await build({...options,entryPoints:['worker.ts'],outfile:'build/_worker.js'});
console.log('Original reference: http://localhost:8000/build/reference/embed.html');
