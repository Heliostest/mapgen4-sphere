import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';

const folder='docs/evidence/earth-status-reassessment-20261011';
const digest=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const baseline=JSON.parse(await readFile(`${folder}/baseline.json`,'utf8'));
const audit=JSON.parse(await readFile(`${folder}/model-audit.json`,'utf8'));
const browser=JSON.parse(await readFile(`${folder}/browser-audit.json`,'utf8'));
const currentHead=git('rev-parse','HEAD'),liveOriginMain=git('ls-remote','origin','refs/heads/main');
assert.equal(currentHead,baseline.head);
assert.equal(liveOriginMain.split(/\s/)[0],currentHead);
assert.equal(git('diff','--name-only'),'');
assert.equal(git('diff','--cached','--name-only'),'');
git('diff','--check');

const bindings=[...audit.bindings.primary,...audit.bindings.reviewed];
for(const b of bindings)assert.equal(digest(await readFile(b.path)),b.currentSha256,`Source changed: ${b.path}`);
for(const b of baseline.hashes)assert.equal(digest(await readFile(b.path)),b.sha256,`Baseline changed: ${b.path}`);
for(const r of audit.reusedCheckpoints){assert.equal(digest(await readFile(r.path)),r.sha256);assert(r.manifestMatch&&r.strictRestore.snapshotExact&&r.strictRestore.nextStepExact);}
for(const c of audit.playbackOperatorTest.records)for(const r of c.records)assert.equal(digest(await readFile(r.path)),r.sha256);
assert(audit.newBrowserSave.strictRestore.nextStepExact&&audit.newBrowserSave.browserRestoredFileExact);
const finalPage=browser.findLast(r=>r.label==='final-formal-default-after-all-diagnostics');
assert.equal(finalPage.quality,'classic');assert.equal(finalPage.sharedMoisture,false);
assert.equal(finalPage.clockDay,'0.000000');assert.equal(finalPage.play,'false');
assert.equal(finalPage.layer,'surface');assert.equal(finalPage.zoom,'0.26');

const portSnapshot=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',"@(Get-NetTCPConnection -State Listen -LocalPort 8000,8001,8002 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess) | ConvertTo-Json -Compress"],{encoding:'utf8'}));
baseline.finalVerification={atUtc:new Date().toISOString(),head:currentHead,liveOriginMain,status:git('status','--short'),trackedDiffEmpty:true,currentSourcesAndBuildUnchanged:true,portSnapshot,portNote:'8000 has a separate listener at completion; 8001 none; this reassessment started only 8002 and never operated 8000/8001.',finalPage};
await writeFile(`${folder}/baseline.json`,JSON.stringify(baseline,null,2)+'\n');

const linkChecks=[];
for(const name of await readdir(folder))if(name.endsWith('.md')){
 const md=await readFile(`${folder}/${name}`,'utf8');
 for(const m of md.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)){
  const target=m[1];if(/^(https?:|#|codex:)/.test(target))continue;
  const absolute=path.resolve(folder,decodeURIComponent(target.split('#')[0]));
  if(absolute===path.resolve(folder,'manifest.json')){linkChecks.push({from:name,target,exists:true,createdByThisScript:true});continue;}
  await readFile(absolute);linkChecks.push({from:name,target,exists:true});
 }
}
const contact=JSON.parse(await readFile(`${folder}/contact-sheet-provenance.json`,'utf8'));
for(const c of contact)for(const s of c.sources)assert.equal(digest(await readFile(`${folder}/${s.file}`)),s.sha256);
const evidence=[];
for(const name of (await readdir(folder)).sort())if(name!=='manifest.json'){
 const bytes=await readFile(`${folder}/${name}`);evidence.push({path:`${folder}/${name}`,bytes:bytes.length,sha256:digest(bytes)});
}
const manifest={createdAtUtc:new Date().toISOString(),head:currentHead,scope:'Evaluation only. No tracked product changes, commit, push, published artifact or default change.',formalInput:baseline.hashes.find(x=>x.path.endsWith('earth-simulation.json')),currentSourceBindings:bindings,historicalCheckpointBindings:audit.reusedCheckpoints.map(({path,sha256,bytes,actualDay,mode,strictRestore})=>({path,sha256,bytes,actualDay,mode,strictRestore})),newExperimentBindings:audit.playbackOperatorTest.records.flatMap(c=>c.records.map(r=>({path:r.path,sha256:r.sha256,bytes:r.bytes,mode:c.mode,moisture:c.moisture,actualDay:r.actualDay}))),browserSave:{path:audit.newBrowserSave.path,sha256:audit.newBrowserSave.sha256,bytes:audit.newBrowserSave.bytes,strictRestore:audit.newBrowserSave.strictRestore},finalPage,linkChecks,contactSheetSourcesVerified:true,evidence};
await writeFile(`${folder}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
await readFile(`${folder}/manifest.json`);
console.log(JSON.stringify({evidenceFiles:evidence.length,localLinksChecked:linkChecks.length,trackedChanges:0,head:currentHead,portSnapshot,finalPage}));
