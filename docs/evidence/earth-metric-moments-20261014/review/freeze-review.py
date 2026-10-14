"""Freeze the completed read-only review; never change implementation or ancestor bytes."""
import json,hashlib,time,re
from pathlib import Path
ROOT=Path.cwd();OUT=ROOT/'build/c10-independent-review';FOLDER=ROOT/'docs/evidence/earth-metric-moments-20261014';RUNS=ROOT/'build/earth-metric-moments'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def rel(p):return p.relative_to(ROOT).as_posix()
final=OUT/'review-source-bindings.json';assert not final.exists()
audit=read(OUT/'final-evidence-audit-v1.json');docs=read(OUT/'document-output-audit-v2.json');numeric=read(OUT/'independent-checks-v1.json');invariant=read(OUT/'independent-invariants-v1-status.json')
assert all(r['passed'] for r in (audit,docs,numeric,invariant))
assert numeric['sourceUnchanged'] and invariant['sourceUnchanged']
for record,keys in [(audit,('sourceHashes','inputHashes','outputHashes','statusHashes')),(docs,('inputHashes',)),(numeric,('sourceAfter',)),(invariant,('sourceAfter','outputHashes'))]:
 for key in keys:
  for p,h in record[key].items():assert digest(ROOT/p)==h,(key,p)
source=dict(audit['sourceHashes'])
for p in FOLDER.iterdir():
 if p.is_file():source[rel(p)]=digest(p)
inputs=dict(audit['inputHashes']);inputs.update(docs['inputHashes'])
outputs={rel(p):digest(p) for p in RUNS.iterdir() if p.is_file()}
for dirname in ('exploration','source-archives'):
 for p in (FOLDER/dirname).rglob('*'):
  if p.is_file():outputs[rel(p)]=digest(p)
for p,h in source.items():
 original=ROOT/p;dest=OUT/'source-after'/h/original.name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(original.read_bytes());assert digest(dest)==h
selected=read(FOLDER/'selected-runs.json');assertions=0;names=[]
for v in selected.values():names.extend(v if isinstance(v,list) else [v])
for name in names:
 status=read(RUNS/(name+'-status.json'))
 if status['script'].endswith('.jl'):
  found=re.findall(r'^C10 .*\|\s+(\d+)\s+(\d+)\s+.+$',(RUNS/(name+'.log')).read_text(),re.M);assert len(found)==1 and found[0][0]==found[0][1];assertions+=int(found[0][0])
assert len(names)==12 and assertions==141
artifacts={rel(p):digest(p) for p in OUT.rglob('*') if p.is_file() and p!=final and '__pycache__' not in p.parts}
record={'completed':True,'actionableFindings':0,'deferredFindings':0,'reviewKind':'fresh independent read-only mathematical, implementation, numerical, evidence and documentation review','baseCommit':'a3a6934b6c9135ddfd912b86197f54026b615e05','completedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'reviewerRoot':rel(OUT),'archiveDestination':rel(FOLDER/'review'),'archivePreservesOriginalExecutionPaths':True,'reviewScope':'Pre-seal acceptance; actual one-time seal and Git integration follow this completed review.','selectedRuns':names,'selectedJuliaAssertions':assertions,'initialSourceHashes':read(OUT/'initial-source-bindings.json')['sources'],'sourceHashes':source,'inputHashes':inputs,'outputHashes':outputs,'reviewArtifactHashes':artifacts,'selfHashExcluded':True,'findingsResolved':['Separate pressure contribution added to every final spatial comparison before selected run.'],'retainedAttempts':['Implementation no-op RED and failed spatial-v1 are retained with exact source/status/log hashes.','Reviewer CSV audit v1 failed on an incorrect expected column name; v2 fixes the reviewer mapping and passes.','All reviewer numerical stress attempts and warnings are retained.']}
for category in ('sourceHashes','inputHashes','outputHashes','reviewArtifactHashes'):
 for p,h in record[category].items():assert digest(ROOT/p)==h,(category,p)
with final.open('x',encoding='utf-8') as f:f.write(json.dumps(record,indent=2,allow_nan=False)+'\n')
print(json.dumps({'completed':True,'actionableFindings':0,'reviewBindingSHA256':digest(final),'codeReviewSHA256':digest(OUT/'code-review.md'),'sourceCount':len(source),'inputCount':len(inputs),'outputCount':len(outputs),'reviewArtifactCount':len(artifacts),'selectedJuliaAssertions':assertions}))
