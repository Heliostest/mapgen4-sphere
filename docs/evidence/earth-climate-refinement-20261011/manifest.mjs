// Run from the repository root after final checks and evidence capture.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const evidence='docs/evidence/earth-climate-refinement-20261011';
const sha=data=>createHash('sha256').update(data).digest('hex');
const git=(...args)=>execFileSync('git',args,{maxBuffer:128*1024*1024});
const normalized=data=>Buffer.from(data.toString('utf8').replace(/\r\n/g,'\n'));
const record=file=>{const data=fs.readFileSync(file);return {path:file,bytes:data.length,sha256:sha(data),
  ...(/\.(?:md|json|js|ts|mjs|py|log)$/.test(file)?{repositoryLfSha256:sha(normalized(data))}:{})};};
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const review=readJson(`${evidence}/CODE-REVIEW-FILES.json`);
const reviewedFiles=review.files.map(file=>({...record(file.path),reviewedSha256:file.sha256,
  matchesReviewedBytes:sha(fs.readFileSync(file.path))===file.sha256,
  repositoryLfSha256:sha(normalized(fs.readFileSync(file.path)))}));
if(reviewedFiles.some(f=>!f.matchesReviewedBytes))throw Error('Product changed after independent final review');

const primaryNames=['earth-simulation.json','earth-terrain.json','elevation-samples.json','elevation-source.json',
  'ice-samples.json','ice-source.json','drainage-samples.json','drainage-source.json','scene-config.json','validation.json'];
const primaryFiles=primaryNames.map(name=>{const file=`scenes/earth-land-sea/${name}`;
  const baseline=git('show',`dc87afb:${file}`),current=fs.readFileSync(file);
  return {...record(file),baselineSha256:sha(baseline),unchangedFromBaseline:sha(baseline)===sha(current)};});
if(primaryFiles.some(f=>!f.unchangedFromBaseline))throw Error('Formal Earth/source data changed');

const restored=readJson(`${evidence}/restore-audit.json`);
const checkpoints=restored.map(r=>{const file=`build/refinement/${r.mode}-day${r.day}.json`,result=record(file);
  if(result.sha256!==r.sha256)throw Error(`Checkpoint changed: ${file}`);
  if(!r.strictSourceRestore||!r.exactNextStep)throw Error(`Restore failed: ${file}`);
  return {...result,strictSourceRestore:r.strictSourceRestore,exactNextStep:r.exactNextStep};});
const browserRestore=readJson(`${evidence}/browser-restore-audit.json`);
const browserFile=record('build/refinement/browser-saved.json');
if(browserFile.sha256!==browserRestore[0].sha256)throw Error('Browser export changed');

const otherProductFiles=['river-channels.ts','scripts/test.mjs','README.md'].map(file=>({...record(file),
  repositoryLfSha256:sha(normalized(fs.readFileSync(file)))}));
const evidenceFiles=fs.readdirSync(evidence).filter(name=>name!=='manifest.json').sort().map(name=>record(`${evidence}/${name}`));
const manifest={createdAtUtc:new Date().toISOString(),baseline:git('rev-parse','dc87afb').toString().trim(),
  implementationBranch:'codex/earth-climate-refinement',formalDecision:'classic default; balanced/high explicitly experimental',
  nodeVersion:process.version,
  hashNotes:['sha256 describes evidence-capture worktree bytes before publication.',
    'Git core.autocrlf=input may normalize source CRLF to LF on commit/checkout; repositoryLfSha256 binds the published text content.',
    'Large checkpoints and generated runtime bundles remain ignored build artifacts; their summaries, hashes and reproducible harnesses are committed.',
    'The full-year physics bundle preceded only query-unit/null handling and UI wording fixes. Current final runtime bundle includes those fixes.'],
  reviewedFiles,otherProductFiles,primaryFiles,checkpoints,browserExport:browserFile,
  runtimeBundles:['build/refinement/audit-release.mjs','build/refinement/restore-audit.mjs',
    'build/refinement/verify-earth-final.mjs','build/_bundle.js','build/_worker.js'].map(record),
  finalChecks:readJson(`${evidence}/final-checks.json`),evidenceFiles};
fs.writeFileSync(`${evidence}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({reviewedFiles:reviewedFiles.length,allReviewBytesMatch:true,
  unchangedFormalSourceFiles:primaryFiles.length,restoredCheckpoints:checkpoints.length,
  evidenceFiles:evidenceFiles.length,browserExportSha256:browserFile.sha256}));
