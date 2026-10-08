import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
const built=await build({stdin:{contents:`export {GeomorphModel,DEFAULT_GEOMORPH} from './geomorph.ts';export {makeThermalGrid} from './thermal.ts';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {GeomorphModel,DEFAULT_GEOMORPH,makeThermalGrid}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const grid=makeThermalGrid(),n=grid.count;
const land=Float64Array.from({length:n},(_,i)=>i%5?1:.5),h=Float64Array.from({length:n},(_,i)=>2000+1800*Math.sin(i/7)),q=new Float64Array(n).fill(10000);
const model=new GeomorphModel(grid,6371008.4,land,h,q,DEFAULT_GEOMORPH),ms=[];
for(let i=0;i<110;i++){const start=performance.now();model.advance(1e8);if(i>=10)ms.push(performance.now()-start);}
ms.sort((a,b)=>a-b);
const report={environment:`Node ${process.version}, this machine; solver only, excludes surface atlas rebuild/rendering`,cells:n,substepsPerBatch:32,batches:100,medianMs:ms[50],p95Ms:ms[95],stepYears:model.stepYears,diagnostics:model.diagnostics()};
await mkdir('build/validation/geomorph',{recursive:true});await writeFile('build/validation/geomorph/benchmark.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
