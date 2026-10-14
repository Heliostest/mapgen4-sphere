import sys
sys.dont_write_bytecode=True
import json,hashlib,importlib.util,math,time
from pathlib import Path
sys.path.insert(0,str(Path('build/earth-polar-pressure/python-libs').resolve()))
import numpy as np
src=Path('docs/evidence/earth-metric-moments-20261014/metric-fit.py');before=hashlib.sha256(src.read_bytes()).hexdigest()
spec=importlib.util.spec_from_file_location('metric',src);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
x=np.array([[1,1,1],[-1,-1,1],[-1,1,-1],[1,-1,-1]],dtype=float)/np.sqrt(3);edges=[(i,j) for i in range(4) for j in range(i+1,4)]
g={'area':[np.pi]*4,'lat':np.arcsin(x[:,2]).tolist(),'lon':np.arctan2(x[:,1],x[:,0]).tolist(),'from':[i+1 for i,j in edges],'to':[j+1 for i,j in edges],'distance':[float(np.arccos(x[i]@x[j])) for i,j in edges]}
results=[]
for weight in (1e-150,1e-153,1e-154,5e-155):
 g['conductance']=[weight]*6
 try:
  fitted,report=m.fit_metric(g)
  nonfinite={k:str(v) for k,v in report.items() if isinstance(v,float) and not math.isfinite(v)}
  row={'originalWeight':weight,'returned':True,'nonfiniteReport':nonfinite,'conductance':fitted['conductance'],'report':{k:(str(v) if isinstance(v,float) and not math.isfinite(v) else v) for k,v in report.items()}}
 except Exception as e:row={'originalWeight':weight,'returned':False,'error':repr(e)}
 results.append(row);print(json.dumps(row),flush=True)
record={'sourceBefore':before,'sourceAfter':hashlib.sha256(src.read_bytes()).hexdigest(),'results':results};Path('build/c10-independent-review/finite-output-probe-v1.json').write_text(json.dumps(record,indent=2,allow_nan=False))
