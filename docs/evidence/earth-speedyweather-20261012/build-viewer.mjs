import {build} from 'esbuild';
import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const source=fileURLToPath(new URL('.',import.meta.url)),root=resolve(source,'../../..'),out=resolve(root,'build/earth-speedyweather');
await mkdir(out,{recursive:true});
if(process.argv.includes('--test')) {
    await build({entryPoints:[resolve(source,'display-contract.test.ts')],bundle:true,platform:'node',format:'esm',outfile:resolve(out,'display-contract.test.mjs')});
    const result=spawnSync(process.execPath,['--test',resolve(out,'display-contract.test.mjs')],{encoding:'utf8'});
    process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');
    await writeFile(resolve(out,'viewer-contract-test.log'),`${result.stdout??''}${result.stderr??''}`);
    process.exitCode=result.status??1;
} else {
    await build({entryPoints:[resolve(source,'preview.ts')],bundle:true,format:'esm',sourcemap:true,minify:false,outfile:resolve(out,'preview.js'),metafile:true}).then(result=>writeFile(resolve(out,'preview-metafile.json'),JSON.stringify(result.metafile,null,2)));
    const html=await readFile(resolve(source,'viewer.html'),'utf8'),css=await readFile(resolve(source,'viewer.css'),'utf8');
    // The existing tiny server does not assign a CSS MIME type. Inline the
    // standalone style so this preview works without changing that server.
    await writeFile(resolve(out,'index.html'),html.replace('<link rel="stylesheet" href="build/earth-speedyweather/viewer.css">',`<style>\n${css}\n</style>`));
    await copyFile(resolve(source,'viewer.css'),resolve(out,'viewer.css'));
    console.log('Built read-only SpeedyWeather viewer at build/earth-speedyweather/index.html. Existing worker and real display.json are required.');
}
