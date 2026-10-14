import json,sys,time
from pathlib import Path
sys.path.insert(0,str(Path('build/earth-polar-pressure/python-libs').resolve()))
import numpy as np
from scipy.sparse import coo_matrix,diags
from scipy.sparse.linalg import spsolve
nr=int(sys.argv[1]);src=Path(f'docs/evidence/earth-native-graph-wind-20261014/raw/c4-graphs-v1-{nr}-graph.json')
g=json.loads(src.read_text());a=np.array(g['from'])-1;b=np.array(g['to'])-1;A=np.array(g['area']);lat=np.array(g['lat']);lon=np.array(g['lon']);w0=np.array(g['conductance'])
x=np.column_stack((np.cos(lat)*np.cos(lon),np.cos(lat)*np.sin(lon),np.sin(lat)));east=np.column_stack((-np.sin(lon),np.cos(lon),np.zeros(len(A))));north=np.cross(x,east)
rows=[];cols=[];vals=[];ne=len(a);n=len(A)
for i,j in ((a,b),(b,a)):
    u=np.einsum('ij,ij->i',x[j],east[i])/np.sqrt(A[i]);v=np.einsum('ij,ij->i',x[j],north[i])/np.sqrt(A[i])
    for k,y in enumerate((u,v,(u*u+v*v)/np.sqrt(2),(u*u-v*v)/np.sqrt(2),np.sqrt(2)*u*v,u**3,np.sqrt(3)*u*u*v,np.sqrt(3)*u*v*v,v**3)):
        rows.append(9*i+k);cols.append(np.arange(ne));vals.append(y)
C=coo_matrix((np.concatenate(vals),(np.concatenate(rows),np.concatenate(cols))),shape=(9*n,ne)).tocsr();target=np.zeros(9*n);target[2::9]=2*np.sqrt(2)
started=time.time();free=np.ones(ne,dtype=bool);history=[]
for it in range(12):
    S=C[:,free]@diags(w0[free]);N=(S@S.T).tocsc();ridge=1e-12*max(N.diagonal())
    z=spsolve(N+diags(np.full(9*n,ridge)),target-C[:,free]@w0[free]);w=np.zeros(ne);w[free]=w0[free]*(1+S.T@z)
    row=dict(iteration=it,minimum=float(w.min()),negative=int(sum(w<0)),residual=float(np.max(np.abs(C@w-target))),seconds=time.time()-started);history.append(row);print(json.dumps(row),flush=True)
    if np.all(w>=0):break
    free[w<0]=False
keep=w>0
out=dict(g);out.update({'from':(a[keep]+1).tolist(),'to':(b[keep]+1).tolist(),'conductance':w[keep].tolist(),'distance':np.array(g['distance'])[keep].tolist()})
Path(f'build/c10-diagnosis/moment-{nr}-graph.json').write_text(json.dumps(out))
Path(f'build/c10-diagnosis/moment-{nr}-result.json').write_text(json.dumps(dict(history=history,positive=bool(np.all(w>=0)),residual=float(np.max(np.abs(C@w-target))))))
