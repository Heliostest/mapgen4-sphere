import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
const built=await build({stdin:{contents:`export {ThermalModel,DEFAULT_THERMAL,makeThermalGrid} from './thermal.ts';export {DEFAULT_PLANET} from './planet.ts';export {DEFAULT_ORBIT} from './astronomy.ts';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {ThermalModel,DEFAULT_THERMAL,makeThermalGrid,DEFAULT_PLANET,DEFAULT_ORBIT}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const grid=makeThermalGrid(),land=Float64Array.from({length:grid.count},(_,i)=>i%3?1:0);
const model=new ThermalModel(DEFAULT_PLANET,DEFAULT_ORBIT,DEFAULT_THERMAL,land,0,grid),ms=[];
for(let i=0;i<110;i++) {
    const start=performance.now();model.advanceTo(model.timeS+32*model.stepS);
    if(i>=10)ms.push(performance.now()-start);
}
ms.sort((a,b)=>a-b);
const report={environment:`Node ${process.version}, this machine; solver only, not full app or device FPS`,cells:grid.count,substepsPerBatch:32,batches:ms.length,medianMs:ms[50],p95Ms:ms[95],stepS:model.stepS,diagnostics:model.diagnostics()};
await mkdir('build/validation/thermal',{recursive:true});await writeFile('build/validation/thermal/benchmark.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
