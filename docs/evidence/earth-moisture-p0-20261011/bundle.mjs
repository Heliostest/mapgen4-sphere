import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
const label=process.argv[2]??'after';
await build({entryPoints:['docs/evidence/earth-moisture-p0-20261011/integrate.ts'],bundle:true,platform:'node',format:'esm',outfile:`build/earth-moisture-p0/integrate-${label}.mjs`,plugins:label==='before'?[{name:'pinned-before-physics',setup(b){b.onLoad({filter:/(circulation|water|reference-moisture)\.ts$/},args=>{const path=args.path.replaceAll('\\','/').split('/mapgen4-sphere/')[1];return {contents:execFileSync('git',['show',`e3222280a0ceddd597245f3c45d75f75d2def9f5:${path}`],{encoding:'utf8'}),loader:'ts'};});}}]:[]});
