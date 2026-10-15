import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
const profile=process.argv[2];
const folder='docs/evidence/earth-east-asia-mechanisms-20261015';
const profiles=JSON.parse(await readFile(`${folder}/profiles.json`,'utf8'));
if(!Object.hasOwn(profiles,profile))throw new Error(`Specify one of: ${Object.keys(profiles).join(', ')}`);
// Identical parameter objects are intentional: this isolates the source fix.
const kind=profile==='buoyancy'?'buoyancy':'baseline';
await mkdir('build/earth-east-asia-mechanisms',{recursive:true});
const entry=`build/earth-east-asia-mechanisms/reproduce-${kind}.mjs`;
await writeFile(entry,gunzipSync(await readFile(`${folder}/bundles/${kind}.mjs.gz`)));
const result=spawnSync(process.execPath,[entry],{stdio:'inherit',env:{...process.env,PARAM_PROFILE:profile}});
process.exitCode=result.status??1;
