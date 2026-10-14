"""Independent artifact checks and unfitted variable-coefficient harmonics."""
import hashlib, json, os, sys
from pathlib import Path
sys.path.insert(0,str(Path('build/earth-polar-pressure/python-libs').resolve()))
import numpy as np
from scipy.sparse import coo_matrix,diags
from scipy.sparse.csgraph import connected_components
from scipy.special import eval_legendre

prefix=sys.argv[1]
baseline=json.loads(Path('build/earth-polar-pressure/c3-baseline-v1.json').read_text())
axes=[np.array([1.,0.,0.]),np.array([0.,0.,1.]),np.array([.37,.53,.76]),np.array([.81,-.47,.19]),np.array([-.23,.91,-.62])]
cases=[];checks=0
def check(condition):
    global checks
    assert condition
    checks+=1

for nr in (24,48,96):
    g=np.load(f'{prefix}-{nr}-graph.npz');area=g['area'];lat=g['lat'];lon=g['lon'];a=g['a'];b=g['b'];w=g['w']
    fixture=next(r for r in baseline['cases'] if not r['full'] and r['rings']==nr)
    for field in ('area','lat','lon'): check(np.array_equal(g[field],np.array(fixture[field])))
    check(np.all(np.isfinite(w)) and np.all(w>=0))
    keep=w>0;a=a[keep];b=b[keep];w=w[keep]
    check(np.all(a<b) and len(np.unique(np.column_stack((a,b)),axis=0))==len(a))
    n=len(area);ne=len(a)
    B=coo_matrix((np.r_[np.ones(ne),-np.ones(ne)],(np.r_[a,b],np.tile(np.arange(ne),2))),shape=(n,ne)).tocsr()
    check(connected_components(B@B.T,directed=False,return_labels=False)==1)
    xyz=np.column_stack((np.cos(lat)*np.cos(lon),np.cos(lat)*np.sin(lon),np.sin(lat)))
    polar=np.abs(lat)>np.deg2rad(75);z=xyz[:,2]
    rows=[]
    for variable in (False,True):
        pref=1+.2*z if variable else np.ones(n)
        K=B@diags(w*(pref[a]+pref[b])/2)@B.T
        check(np.max(np.abs(K@np.ones(n)))<1e-11)
        check(np.max(np.abs((K-K.T).data),initial=0)<1e-13)
        for index,axis in enumerate(axes):
            axis=axis/np.linalg.norm(axis);t=xyz@axis
            for degree in range(1,7):
                f=eval_legendre(degree,t)
                exact=pref*degree*(degree+1)*f
                if variable:
                    # Polynomial derivative avoids division by 1-t^2 at poles.
                    coeff=np.zeros(degree+1);coeff[-1]=1
                    deriv=np.polynomial.legendre.legval(t,np.polynomial.legendre.legder(coeff))
                    exact-=.2*deriv*(axis[2]-z*t)
                error=K@f/area-exact
                rows.append(dict(variable=variable,axis=index,degree=degree,l2=float(np.sqrt(np.dot(area,error**2)/np.dot(area,exact**2))),polar=float(np.max(np.abs(error[polar]))),maximum=float(np.max(np.abs(error)))))
    cases.append(dict(rings=nr,cells=n,edges=ne,rows=rows))
    print(json.dumps(dict(rings=nr,edges=ne,maximumTrainedCoordinateError=max(r['maximum'] for r in rows if not r['variable'] and r['degree']==1))),flush=True)
    if nr==48:
        distance=np.arccos(np.clip(np.sum(xyz[a]*xyz[b],axis=1),-1,1))
        export=dict(scope='Effective graph metric, not geographic faces; manufactured tests only; no native wind import',area=area.tolist(),lat=lat.tolist(),lon=lon.tolist(),**{'from':(a+1).tolist(),'to':(b+1).tolist()},conductance=w.tolist(),distance=distance.tolist())
        with Path(f"build/earth-polar-pressure/{os.environ['POLAR_RUN_NAME']}-native-graph.json").open('x') as f:json.dump(export,f)

failures=[];ratios=[]
for index,r in enumerate(cases[0]['rows']):
    series=[c['rows'][index] for c in cases]
    if not r['variable'] and r['degree']==1:
        # These coordinate modes train the fit. Check a tolerance, not a rate.
        for s in series:check(s['maximum']<1e-6)
        continue
    passed=all(v['l2']<u['l2'] and v['polar']<u['polar'] for u,v in zip(series,series[1:]))
    row=dict(variable=r['variable'],axis=r['axis'],degree=r['degree'],passed=passed,l2Ratios=[u['l2']/v['l2'] for u,v in zip(series,series[1:])],polarRatios=[u['polar']/v['polar'] for u,v in zip(series,series[1:])])
    ratios.append(row)
    if not passed:failures.append(row)
nativeGraphPath=f"build/earth-polar-pressure/{os.environ['POLAR_RUN_NAME']}-native-graph.json"
result=dict(scope='Independent graph artifact and analytic variable-pref checks; no climate acceptance',checks=checks,cases=cases,refinement=ratios,failures=failures,spatialCandidateAccepted=not failures,nativeGraphPath=nativeGraphPath,nativeGraphSha256=hashlib.sha256(Path(nativeGraphPath).read_bytes()).hexdigest(),graphInputSha256={f'{prefix}-{nr}-graph.npz':hashlib.sha256(Path(f'{prefix}-{nr}-graph.npz').read_bytes()).hexdigest() for nr in (24,48,96)})
with Path(f"build/earth-polar-pressure/{os.environ['POLAR_RUN_NAME']}.json").open('x') as f:json.dump(result,f,indent=2)
print(json.dumps(dict(checks=checks,refinementCases=len(ratios),failures=failures,spatialCandidateAccepted=not failures)),flush=True)
assert not failures
