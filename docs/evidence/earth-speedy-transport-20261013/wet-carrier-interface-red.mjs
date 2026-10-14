import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const path='build/earth-speedy-transport/wet-carrier-prototype-test.json';
const bytes=await readFile(path), data=JSON.parse(bytes);
const tests=[];
for(const row of data.rows){
  tests.push({step:row.step,requirement:'Native-pressure bridge preserves a constant tracer',
    value:row.usingNativePressureConstantQError,tolerance:1e-12,
    passed:row.usingNativePressureConstantQError<1e-12});
  tests.push({step:row.step,requirement:'Nonnegative initial sharp tracer remains nonnegative',
    value:row.stock.sharp.minQ,tolerance:-1e-14,passed:row.stock.sharp.minQ>=-1e-14});
  tests.push({step:row.step,requirement:'Legal scalar q reconstruction preserves pressure-weighted water',
    value:row.scalarTruncatedProjection.waterProjectionErrorMm,tolerance:1e-10,
    passed:Math.abs(row.scalarTruncatedProjection.waterProjectionErrorMm)<1e-10});
}
const result={scope:'Coupling acceptance gates, not mechanism tests. Failed gates reject this uncoupled prototype as a native moisture fix.',
  input:path,inputSHA256:createHash('sha256').update(bytes).digest('hex'),tests,
  passed:tests.filter(t=>t.passed).length,failed:tests.filter(t=>!t.passed).length};
await writeFile('build/earth-speedy-transport/wet-carrier-interface-red.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
process.exitCode=result.failed?1:0;
