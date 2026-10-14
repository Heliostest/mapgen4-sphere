import json,hashlib,re,subprocess,os,time
from pathlib import Path
root=Path.cwd();out=root/'build/c10-independent-review';script=out/'independent-invariants-v1.jl'
paths={script,Path(__file__).resolve()}
def visit(path):
    paths.add(path.resolve())
    for entry in re.findall(r'^\s*include\("([^"]+)"\)',path.read_text(encoding='utf-8-sig'),re.M):
        next=(path.parent/entry).resolve()
        if next not in paths:visit(next)
visit(script)
for p in ['build/earth-metric-moments/c10-fit-48-v1-graph.json','docs/evidence/earth-polar-pressure-20261014/raw/c3-spatial-near-audit-v1-native-graph.json','docs/evidence/earth-native-graph-wind-20261014/raw/inputs/candidate-c1-native-1800-import.bin','docs/evidence/earth-native-graph-wind-20261014/raw/inputs/split-reference-seasonal-geometry.json','docs/evidence/earth-speedyweather-20261012/julia-env/Project.toml','docs/evidence/earth-speedyweather-20261012/julia-env/Manifest.toml']:paths.add(root/p)
def hashes():return {p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths)}
record={'startedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'sourceBefore':hashes()};env=dict(os.environ,JULIA_DEPOT_PATH=str(root/'build/earth-speedyweather/depot'),JULIA_NUM_THREADS='1',OPENBLAS_NUM_THREADS='1')
args=[str(root/'build/earth-speedyweather/runtime/julia-1.12.7/bin/julia.exe'),'--startup-file=no','--project=docs/evidence/earth-speedyweather-20261012/julia-env',str(script)]
with (out/'independent-invariants-v1.log').open('wb') as log:result=subprocess.run(args,env=env,stdout=log,stderr=subprocess.STDOUT)
record['args']=args;record['code']=result.returncode;record['sourceAfter']=hashes();record['sourceUnchanged']=record['sourceBefore']==record['sourceAfter'];record['passed']=result.returncode==0 and record['sourceUnchanged'];record['completedUTC']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
record['outputHashes']={p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in [out/'independent-invariants-v1.log',out/'independent-invariants-v1.json',out/'new-metric-review-checkpoint.bin'] if p.exists()}
(out/'independent-invariants-v1-status.json').write_text(json.dumps(record,indent=2));print(json.dumps({'passed':record['passed'],'code':result.returncode}));raise SystemExit(result.returncode)
