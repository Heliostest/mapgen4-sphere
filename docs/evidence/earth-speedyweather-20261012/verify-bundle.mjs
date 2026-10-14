import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

const source=fileURLToPath(new URL('.',import.meta.url)),root=resolve(source,'../../..'),out=resolve(root,'build/earth-speedyweather');
const metadata=JSON.parse(await readFile(resolve(out,'preview-metafile.json'),'utf8'));
const inputs=Object.keys(metadata.inputs);
const forbiddenInputs=inputs.filter(name=>/(^|\/)(thermal-runtime|simulation-document|planet-controls|water|thermal|runtime-state|painting)\.(ts|js)$/.test(name));
assert.deepEqual(forbiddenInputs,[],'Replay bundle must contain no old physical runtime, controller, clock restore or painting entry');
assert.ok(inputs.includes('render.ts'),'Replay must use the existing Renderer');
const report={status:'PASS',inputCount:inputs.length,forbiddenInputs,usesExistingRenderer:true,previewBytes:metadata.outputs['build/earth-speedyweather/preview.js'].bytes,browserChecked:false,realMonthlyDataChecked:false};
await writeFile(resolve(out,'viewer-bundle-verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
