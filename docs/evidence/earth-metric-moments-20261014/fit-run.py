# bind: metric-fit.py
import json,sys,os,importlib.util
from pathlib import Path
sys.path.insert(0,str(Path('build/earth-polar-pressure/python-libs').resolve()))
spec=importlib.util.spec_from_file_location('metric',Path(__file__).with_name('metric-fit.py'));metric=importlib.util.module_from_spec(spec);spec.loader.exec_module(metric)
nr=int(sys.argv[1]);name=os.environ['VC_RUN_NAME'];out=Path('build/earth-metric-moments')
g=json.loads(Path(f'docs/evidence/earth-native-graph-wind-20261014/raw/c4-graphs-v1-{nr}-graph.json').read_text())
new,report=metric.fit_metric(g)
assert report['finalCubicNorm']<.8*report['originalCubicNorm']
assert all(new[k]==g[k] for k in ('area','lat','lon','from','to','distance'))
(out/f'{name}-graph.json').write_text(json.dumps(new))
(out/f'{name}.json').write_text(json.dumps(dict(passed=True,rings=nr,cells=len(g['area']),edges=len(g['from']),report=report),indent=2))
print(json.dumps(dict(rings=nr,**report)),flush=True)
