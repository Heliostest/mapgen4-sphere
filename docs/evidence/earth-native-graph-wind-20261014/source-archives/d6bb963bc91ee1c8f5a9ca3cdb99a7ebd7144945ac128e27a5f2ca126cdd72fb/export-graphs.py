"""Export the already audited C3 NPZ data; do not refit or reorder it."""
import hashlib,json,os,sys
from pathlib import Path
sys.path.insert(0,str(Path('build/earth-polar-pressure/python-libs').resolve()))
import numpy as np
folder=Path('docs/evidence/earth-polar-pressure-20261014/raw')
audit=json.loads((folder/'c3-spatial-near-audit-v1.json').read_text())
rows=[]
for nr in (24,48,96):
    path=folder/f'c3-fit-near-k24-refinement-v1-{nr}-graph.npz'
    digest=hashlib.sha256(path.read_bytes()).hexdigest()
    assert digest==audit['graphInputSha256'][f'build/earth-polar-pressure/{path.name}']
    g=np.load(path);keep=g['w']>0;a=g['a'][keep];b=g['b'][keep];w=g['w'][keep]
    lat=g['lat'];lon=g['lon'];xyz=np.column_stack((np.cos(lat)*np.cos(lon),np.cos(lat)*np.sin(lon),np.sin(lat)))
    d=np.arccos(np.clip(np.sum(xyz[a]*xyz[b],axis=1),-1,1))
    graph=dict(area=g['area'].tolist(),lat=lat.tolist(),lon=lon.tolist(),**{'from':(a+1).tolist(),'to':(b+1).tolist()},conductance=w.tolist(),distance=d.tolist())
    if nr==48:
        native=json.loads((folder/'c3-spatial-near-audit-v1-native-graph.json').read_text())
        assert all(native[k]==v for k,v in graph.items())
    dest=Path(f"build/earth-native-graph-wind/{os.environ['WIND_RUN_NAME']}-{nr}-graph.json")
    with dest.open('x') as f:json.dump(graph,f)
    rows.append(dict(rings=nr,input=str(path),inputSha256=digest,output=str(dest),outputSha256=hashlib.sha256(dest.read_bytes()).hexdigest()))
result=dict(rows=rows,numpy=np.__version__,nativeGraphSha256=audit['nativeGraphSha256'])
Path(f"build/earth-native-graph-wind/{os.environ['WIND_RUN_NAME']}.json").write_text(json.dumps(result,indent=2))
print(json.dumps(result))
