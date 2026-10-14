import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const folder='docs/evidence/earth-conservative-transport-20261013',out='build/earth-conservative-transport';
const hash=b=>createHash('sha256').update(b).digest('hex');
const verification=JSON.parse(await readFile(`${folder}/verification.json`,'utf8'));
assert(verification.implementationAndConservationAcceptance&&!verification.climateAcceptance);
async function walk(dir){const files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=`${dir}/${e.name}`;if(e.isDirectory())files.push(...await walk(p));else files.push(p);}return files;}
const old=JSON.parse(await readFile(`${folder}/preservation-before-final.json`,'utf8'));
const paths=[...await walk(folder),...await walk(out),'docs/superpowers/plans/2026-10-13-conservative-pressure-water.md',...old.manifests.map(m=>m.path)].filter(p=>p!==`${folder}/manifest.json`).sort();
const bindings=[];
for(const path of paths){const b=await readFile(path);bindings.push({path,bytes:b.length,sha256:hash(b)});}
const manifest={createdUTC:new Date().toISOString(),head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),previousManifest:old.previous,formalPath:'scenes/earth-land-sea/earth-simulation.json',formalSHA256:old.formalSHA256,formalDefaultPromoted:false,candidate:'c1',coreSHA256:verification.coreSHA,acceptance:{implementationAndConservation:true,weakPressureWaveConvergence:true,strongPointwisePolarAccuracy:false,nativeCoarsePressureTimeAccuracy:false,originalAdjacentStepDifferenceGate:false,nativePrimitiveEquationCoupling:false,climate:false},bindings};
const text=JSON.stringify(manifest,null,2)+'\n';
await writeFile(`${folder}/manifest.json`,text,{flag:'wx'});
for(const b of bindings)assert.equal(hash(await readFile(b.path)),b.sha256,b.path);
console.log(JSON.stringify({sealed:true,bindings:bindings.length,manifestSHA256:hash(Buffer.from(text)),acceptance:manifest.acceptance}));
