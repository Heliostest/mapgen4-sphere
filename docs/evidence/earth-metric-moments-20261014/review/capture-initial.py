import json,hashlib,shutil,subprocess
from pathlib import Path
root=Path.cwd(); out=root/'build/c10-independent-review'; folder=root/'docs/evidence/earth-metric-moments-20261014'
paths=[p for p in folder.iterdir() if p.is_file()]
paths += [root/p for p in ['docs/evidence/earth-pressure-work-20261014/pressure-core.jl','docs/evidence/earth-rotating-sigma-20261014/vector-core.jl','docs/evidence/earth-conservative-transport-20261013/conservative-core.jl','docs/evidence/earth-native-graph-wind-20261014/graph-wind.jl']]
record={}
for p in paths:
    data=p.read_bytes(); h=hashlib.sha256(data).hexdigest(); dest=out/'source-before'/h/p.name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data);record[p.relative_to(root).as_posix()]=h
(out/'initial-source-bindings.json').write_text(json.dumps({'base':'a3a6934b6c9135ddfd912b86197f54026b615e05','sources':record},indent=2))
(out/'initial-git-status.txt').write_text(subprocess.check_output(['git','status','--short'],text=True))
print(json.dumps({'captured':len(record)}))
