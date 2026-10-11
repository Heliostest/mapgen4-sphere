import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dir='docs/evidence/earth-physics-information-20261011',sha=x=>createHash('sha256').update(x).digest('hex');
const bindings=[];
for(const name of ['tests','typecheck','build','formal']){
 const bytes=await readFile(`build/earth-physics-information/premerge-${name}.log`);
 const text=bytes.toString(bytes[0]===255&&bytes[1]===254?'utf16le':'utf8').replace(/^\uFEFF/,'').replaceAll('\r\n','\n');
 if(name==='tests')assert.ok(text.includes('tests 251')&&text.includes('pass 251')&&text.includes('fail 0'));
 if(name==='typecheck')assert.ok(text.includes('tsc --noEmit')&&!text.includes('error TS'));
 if(name==='build')assert.ok(text.includes('Built spherical Mapgen4 with the original WebGL renderer.'));
 if(name==='formal'){const result=JSON.parse(text);assert.ok(result.savedSimulationValid&&result.separateReservoirs&&result.finiteTerrain);}
 const path=`${dir}/delivery-${name}.log`;await writeFile(path,text);bindings.push({path,sha256:sha(text)});
}
const physics=JSON.parse(await readFile(dir+'/physics-check.json','utf8'));
for(const b of physics.bindings)assert.equal(sha(await readFile(b.path)),b.sha256);
assert.equal(sha(await readFile('scenes/earth-land-sea/earth-simulation.json')),physics.formalSha256);
const result={generatedAtUtc:new Date().toISOString(),validatedProductionCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),tests:{passed:251,failed:0},typecheck:'pass',build:'pass',formalEarthVerify:'pass',formalEarthSha256:physics.formalSha256,sourceBindingsUnchanged:true,bindings,observationStatus:'Regional rainfall and sea-ice seasonal coverage remain failed; this delivery does not claim observed climate agreement.'};
await writeFile(dir+'/delivery-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({productionCommit:result.validatedProductionCommit,tests:result.tests,logs:bindings.length,formalEarthUnchanged:true}));
