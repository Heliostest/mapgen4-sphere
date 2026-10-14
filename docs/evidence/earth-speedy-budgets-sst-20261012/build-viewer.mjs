import {build} from 'esbuild';
import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const source=fileURLToPath(new URL('.',import.meta.url)),root=resolve(source,'../../..'),out=resolve(root,'build/earth-speedy-budgets-sst');
await mkdir(out,{recursive:true});
if(process.argv.includes('--test')){
    await build({entryPoints:[resolve(source,'comparison-contract.test.ts')],bundle:true,platform:'node',format:'esm',outfile:resolve(out,'comparison-contract.test.mjs')});
    const result=spawnSync(process.execPath,['--test',resolve(out,'comparison-contract.test.mjs')],{encoding:'utf8'});
    process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');
    await writeFile(resolve(out,'viewer-contract-test.log'),`${result.stdout??''}${result.stderr??''}`);
    process.exitCode=result.status??1;
}else{
    const result=await build({entryPoints:[resolve(source,'preview.ts')],bundle:true,format:'esm',sourcemap:true,minify:false,outfile:resolve(out,'preview.js'),metafile:true});
    await writeFile(resolve(out,'preview-metafile.json'),JSON.stringify(result.metafile,null,2)+'\n');
    // The same tested decoder can inspect delivered data without loading a browser.
    await build({entryPoints:[resolve(source,'comparison-contract.ts')],bundle:true,platform:'node',format:'esm',outfile:resolve(out,'comparison-contract.mjs')});
    const html=await readFile(resolve(source,'viewer.html'),'utf8'),css=await readFile(resolve(source,'viewer.css'),'utf8');
    // The existing server omits the CSS MIME type. The generated page inlines it.
    await writeFile(resolve(out,'index.html'),html.replace('<link rel="stylesheet" href="build/earth-speedy-budgets-sst/viewer.css">',`<style>\n${css}\n</style>`));
    await copyFile(resolve(source,'viewer.css'),resolve(out,'viewer.css'));
    console.log('Built read-only SST comparison viewer at build/earth-speedy-budgets-sst/index.html. Requires existing terrain worker and real comparison-display.json.');
}
