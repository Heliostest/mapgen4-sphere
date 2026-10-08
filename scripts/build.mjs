import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

export const options={
    entryPoints:{globe:'planet/main.ts','planet-worker':'planet/worker.ts',_bundle:'mapgen4.ts',_worker:'worker.ts'},
    bundle:true,outdir:'build',format:'iife',sourcemap:true,logLevel:'info',target:'es2022',
    tsconfig:'tsconfig.planet.json',
};
export async function prepare(){
    await mkdir('build',{recursive:true});
    await build({entryPoints:['generate-points-file.ts'],bundle:true,platform:'node',format:'esm',outfile:'build/_generate-points-file.js',tsconfig:'tsconfig.planet.json'});
    await import(pathToFileURL(resolve('build/_generate-points-file.js')).href);
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
    await prepare();await build({...options,minify:true});
}
