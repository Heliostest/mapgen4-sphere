/** Reproduce continuous Earth evidence from the repository root:
 *
 * node docs/evidence/earth-moisture-climate-20261010/bundle-integrate.mjs --baseline --run
 * node docs/evidence/earth-moisture-climate-20261010/bundle-integrate.mjs --run
 *
 * Without --run, only build the evidence entry. --initial-only limits a run to
 * day zero. Baseline physics imports and its scene are read from the fixed Git
 * commit below; the statistical entry remains the current integrate.ts.
 * The after run uses the current source and the experimental build snapshot.
 * Run rebuild-moisture.ts first; it does not replace the published Earth scene.
 * MOISTURE_EVIDENCE_INPUT and MOISTURE_EVIDENCE_SOURCE may identify a fixed scene and its
 * source. Neither mode changes physical parameters or disables any subsystem.
 */
import {build} from 'esbuild';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../../',import.meta.url));
process.chdir(root);
const before=process.argv.includes('--baseline'),label=before?'before':'after';
const commit='c84e7253ceb5de3fd2ba4301246427e385ddcb2d';
const entry=resolve('docs/evidence/earth-moisture-climate-20261010/integrate.ts');
const folder='build/earth-moisture-climate',outfile=`${folder}/${label}-integrate.mjs`;
await mkdir(folder,{recursive:true});
const plugins=[];
if(before){
    await writeFile(`${folder}/before-day0.json`,execFileSync('git',['show',`${commit}:scenes/earth-land-sea/earth-simulation.json`],{maxBuffer:128*1024*1024}));
    plugins.push({name:'fixed-baseline-source',setup(b){b.onLoad({filter:/\.(?:ts|js)$/},args=>{
        if(args.path===entry||args.path.includes(`${sep}node_modules${sep}`))return;
        const path=relative(root,args.path).split(sep).join('/');
        if(path.startsWith('../'))return;
        return {contents:execFileSync('git',['show',`${commit}:${path}`],{encoding:'utf8',maxBuffer:128*1024*1024}),loader:path.endsWith('.ts')?'ts':'js',resolveDir:dirname(args.path)};
    });}});
}
await build({entryPoints:[entry],bundle:true,platform:'node',format:'esm',outfile,plugins});
console.log(before?`Bundled baseline physics exclusively from ${commit}`:`Bundled current implementation into ${outfile}`);
if(process.argv.includes('--run')){
    const env={...process.env,MOISTURE_EVIDENCE_LABEL:label,
        MOISTURE_EVIDENCE_INPUT:process.env.MOISTURE_EVIDENCE_INPUT??`${folder}/${before?'before-day0':'experimental-input'}.json`,
        MOISTURE_EVIDENCE_SOURCE:process.env.MOISTURE_EVIDENCE_SOURCE??(before?commit:'current implementation; exact bundle identified by bundledCodeSha256')};
    const result=spawnSync(process.execPath,[outfile,...(process.argv.includes('--initial-only')?['--initial-only']:[])],{cwd:root,env,stdio:'inherit'});
    if(result.error)throw result.error;
    if(result.status!==0)process.exit(result.status??1);
}
