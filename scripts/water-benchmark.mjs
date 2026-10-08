import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
const built=await build({stdin:{contents:`export {ThermalRuntime} from './thermal-runtime.ts';export {DEFAULT_PLANET} from './planet.ts';export {DEFAULT_ORBIT} from './astronomy.ts';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {ThermalRuntime,DEFAULT_PLANET,DEFAULT_ORBIT}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const runtime=new ThermalRuntime(),n=runtime.grid.count;
runtime.enabled=runtime.waterEnabled=true;runtime.setTerrain(Float64Array.from({length:n},(_,i)=>i%3?1:0),Float64Array.from({length:n},(_,i)=>i%7/7));
runtime.sync(DEFAULT_PLANET,DEFAULT_ORBIT,0,0);const ms=[];
for(let i=0;i<110;i++) {
    const time=runtime.model.timeS,target=time+runtime.maxAdvanceS,start=performance.now();
    runtime.sync(DEFAULT_PLANET,DEFAULT_ORBIT,target,time);
    if(i>=10)ms.push(performance.now()-start);
}
ms.sort((a,b)=>a-b);
const report={environment:`Node ${process.version}, this machine; paired solver + checkpoints + texture encoding, not browser rendering or device FPS`,cells:n,substepsPerBatch:32,batches:ms.length,medianMs:ms[50],p95Ms:ms[95],stepS:runtime.model.stepS,thermal:runtime.model.diagnostics(),water:runtime.water.diagnostics()};
await mkdir('build/validation/water',{recursive:true});await writeFile('build/validation/water/benchmark.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
