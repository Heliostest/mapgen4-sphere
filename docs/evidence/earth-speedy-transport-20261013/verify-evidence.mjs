import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {basename} from 'node:path';
import assert from 'node:assert/strict';
import {verifyFrozenChain,previousManifestSHA256} from './verify-frozen-chain.mjs';
const folder='docs/evidence/earth-speedy-transport-20261013';
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const manifestBytes=await readFile(`${folder}/manifest.json`),m=JSON.parse(manifestBytes);
for(const b of m.bindings){const bytes=await readFile(b.path);assert.equal(bytes.length,b.bytes,b.path);assert.equal(hash(bytes),b.sha256,b.path);}
assert.equal(hash(await readFile(m.formalPath)),m.formalSHA256);
for(const d of m.defaultDeclarations){
 const source=await readFile(d.path,'utf8');
 const match=source.match(new RegExp('export const '+d.name+'[^=]*=Object\\.freeze\\(\\{[\\s\\S]*?\\}\\);'));
 assert(match,d.name);assert.equal(hash(match[0].replaceAll('\r\n','\n')),d.sha256,d.name);
}
const oldBytes=await readFile(m.previousManifest.path);assert.equal(hash(oldBytes),m.previousManifest.sha256);
const chain=await verifyFrozenChain(m.previousManifest.path,previousManifestSHA256),old=chain.root;
assert.equal(m.formalSHA256,old.formalSha256);
const native=await read(`${folder}/native-source-baseline.json`);
for(const b of native.bindings)assert.equal(hash(await readFile(b.path)),b.sha256,b.path);
let subordinateBindingsVerified=0;
for(const name of (await readdir(folder)).filter(n=>n.endsWith('-bindings.json'))){
 const child=await read(`${folder}/${name}`);
 const records=child.bindings??child.files;
 assert(records&&typeof records==='object',name);
 const bindings=Array.isArray(records)?records:Object.entries(records).map(([path,sha256])=>({path,sha256}));
 for(const b of bindings){
  const bytes=await readFile(b.path);assert.equal(hash(bytes),b.sha256,`${name}: ${b.path}`);
  if(b.bytes!==undefined)assert.equal(bytes.length,b.bytes,b.path);
  subordinateBindingsVerified++;
 }
}
let provenanceBindings=0;
for(const run of m.nativeExecutions){const s=await read(run.file);assert(s.sourceUnchanged,run.file);
 assert.deepEqual(s.sourceBefore,s.sourceAfter,run.file);
 for(const [path,sha]of Object.entries(s.sourceBefore??{})){
  assert.equal(hash(await readFile(`${folder}/source-archives/${sha}/${basename(path)}`)),sha,path);provenanceBindings++;
 }
 if(s.inputsBefore){assert(s.inputsUnchanged);assert.deepEqual(s.inputsBefore,s.inputsAfter);
  for(const [path,sha]of Object.entries(s.inputsBefore)){assert.equal(hash(await readFile(path)),sha,path);provenanceBindings++;}}
}
const raw=await read(`${folder}/raw-index.json`);
for(const e of raw.entries){const compressed=await readFile(e.path),bytes=gunzipSync(compressed);assert.equal(hash(compressed),e.sha256,e.path);assert.equal(bytes.length,e.rawBytes);assert.equal(hash(bytes),e.rawSha256,e.path);assert.equal(hash(await readFile(e.source)),e.rawSha256,e.source);}
const full=m.completedCandidates.filter(c=>c.stage==='five-year-spinup-one-statistics-year');
const climatePassed=c=>c.monsoonPassed&&c.waterPassed&&c.landWaterPassed&&c.dryAirMassPassed&&Object.entries(c.fullBudgetChecks).filter(([k])=>k.endsWith('Passed')).every(([,v])=>v);
const startupPassed=c=>{
 const audit=m.startupAudits.find(a=>a.physicsFix===c.physicsFix);
 return !!audit&&['slab','seasonal'].every(mode=>audit.modes.some(a=>a.mode===mode&&a.pointwiseWaterPassed));
};
const result={checkedUTC:new Date().toISOString(),manifestSHA256:hash(manifestBytes),evidenceIntegrityPassed:true,
 bindingsVerified:m.bindings.length,previousBindingsVerified:old.bindings.length,nativeSourceFilesVerified:native.bindings.length,subordinateBindingsVerified,provenanceBindingsVerified:provenanceBindings,archivesVerified:raw.entries.length,
 frozenManifestsVerified:chain.manifests,recursivePreviousBindingsVerified:chain.bindingsVerified,uniqueFrozenFilesVerified:chain.uniqueFilesVerified,
 formalDefaultUnchanged:true,formalDefaultPromoted:false,
 climateAcceptancePassed:full.some(climatePassed),
 climateAndStartupAcceptancePassed:full.some(c=>climatePassed(c)&&startupPassed(c)),
 startupAudits:m.startupAudits,
 completedSixYearCases:full.length,
 failedCandidateRuns:m.nativeExecutions.filter(r=>r.code!==0&&/\/run(?:-v\d+)?\.jl$/.test(r.script??'')).map(r=>({case:r.configuration?.SPEEDY_CASE,code:r.code})),
 failedDiagnosticExecutions:m.nativeExecutions.filter(r=>r.code!==0&&!/\/run(?:-v\d+)?\.jl$/.test(r.script??'')).map(r=>({case:r.configuration?.SPEEDY_CASE,script:r.script,code:r.code})),
 note:'Integrity PASS does not mean every experiment passed. Candidate failures, red tests and unmet climate gates remain in the evidence.'};
await writeFile(`${folder}/verification.json`,JSON.stringify(result,null,2)+'\n');console.log(result);
