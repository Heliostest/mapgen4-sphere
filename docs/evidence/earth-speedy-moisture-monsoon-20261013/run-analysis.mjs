import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
const output='build/earth-speedy-moisture-monsoon/analyze.mjs';
await build({entryPoints:['docs/evidence/earth-speedy-moisture-monsoon-20261013/analyze.mjs'],bundle:true,platform:'node',format:'esm',outfile:output});
const r=spawnSync(process.execPath,[output,...process.argv.slice(2)],{encoding:'utf8',maxBuffer:8e6});process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'');process.exitCode=r.status??1;
