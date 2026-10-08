import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
await build({entryPoints:['tests/planet.test.ts'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:'build/planet.test.mjs',tsconfig:'tsconfig.planet.json'});
const result=spawnSync(process.execPath,['--test','build/planet.test.mjs'],{stdio:'inherit'});
process.exit(result.status??1);
