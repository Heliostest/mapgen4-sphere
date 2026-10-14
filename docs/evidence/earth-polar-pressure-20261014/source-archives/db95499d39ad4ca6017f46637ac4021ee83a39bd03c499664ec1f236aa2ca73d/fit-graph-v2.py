"""Diagnostic candidate only: symmetric positive local graph moment fitting."""
import json, os, sys, time
from pathlib import Path
sys.path.insert(0, str(Path('build/earth-polar-pressure/python-libs').resolve()))
import numpy as np
import scipy
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix, diags
from scipy.sparse.linalg import lsmr
from scipy.optimize import lsq_linear
from scipy.sparse.csgraph import connected_components
from scipy.special import eval_legendre

def graph(area, lat, lon, neighbours):
    xyz=np.column_stack((np.cos(lat)*np.cos(lon),np.cos(lat)*np.sin(lon),np.sin(lat)))
    east=np.column_stack((-np.sin(lon),np.cos(lon),np.zeros_like(lon)))
    north=np.cross(xyz,east)
    _, ids=cKDTree(xyz).query(xyz,k=neighbours+1)
    pairs=np.sort(np.column_stack((np.repeat(np.arange(len(lat)),neighbours),ids[:,1:].ravel())),axis=1)
    pairs=np.unique(pairs,axis=0); a,b=pairs.T
    cosine=np.sum(xyz[a]*xyz[b],axis=1)
    radial=1-cosine
    rows=[];cols=[];vals=[]
    for center,other in ((a,b),(b,a)):
        t1=np.sum(xyz[other]*east[center],axis=1)
        t2=np.sum(xyz[other]*north[center],axis=1)
        moments=(t1/np.sqrt(area[center]),t2/np.sqrt(area[center]),radial/area[center],(t1*t1-t2*t2)/area[center],2*t1*t2/area[center])
        for m,v in enumerate(moments):
            rows.append(center*5+m);cols.append(np.arange(len(a)));vals.append(v)
    C=coo_matrix((np.concatenate(vals),(np.concatenate(rows),np.concatenate(cols))),shape=(5*len(lat),len(a))).tocsr()
    target=np.zeros(5*len(lat));target[2::5]=2
    h2=(area[a]+area[b])/2
    w0=np.exp(-6*np.pi*radial/(neighbours*h2))
    w0*=2/np.mean((C@w0)[2::5])
    t=time.perf_counter()
    fit=lsmr(C,target-C@w0,atol=1e-11,btol=1e-11,maxiter=4000)
    w=w0+fit[0]
    method='minimum correction via LSMR';iterations=int(fit[2]);status=int(fit[1])
    unbounded_min=float(w.min())
    if w.min() < 0:
        # Feasibility heuristic, not a claim of the closest constrained optimum.
        # Pin negative conductances and refit all remaining shared edges.
        free=np.ones(len(a),dtype=bool)
        method='negative-edge elimination with equality refits'
        status=0
        for iterations in range(1,31):
            free[w<0]=False
            reduced=C[:,free]
            solved=lsmr(reduced,target-reduced@w0[free],atol=1e-12,btol=1e-12,maxiter=12000)
            w=np.zeros(len(a));w[free]=w0[free]+solved[0]
            print(json.dumps(dict(stage='refit',cells=len(lat),iteration=iterations,freeEdges=int(free.sum()),negative=int(np.sum(w<0)),residual=float(np.max(np.abs(C@w-target))),lsmrStatus=int(solved[1]),lsmrIterations=int(solved[2]))),flush=True)
            if np.all(w>=0):
                status=1
                break
    incidence=coo_matrix((np.r_[np.ones(len(a)),-np.ones(len(a))],(np.r_[a,b],np.tile(np.arange(len(a)),2))),shape=(len(lat),len(a))).tocsr()
    K=(incidence@diags(w)@incidence.T).tocsr()
    adjacency=coo_matrix((w,(a,b)),shape=K.shape);adjacency.eliminate_zeros()
    return K,xyz,a,b,w,dict(method=method,iterations=iterations,status=status,seconds=time.perf_counter()-t,unboundedMinimum=unbounded_min,minimumWeight=float(w.min()),maximumWeight=float(w.max()),momentMax=float(np.max(np.abs(C@w-target))),momentRMS=float(np.sqrt(np.mean((C@w-target)**2))),components=int(connected_components(adjacency,directed=False,return_labels=False)),edges=len(a),maxAngularSeparation=float(np.arccos(np.clip(cosine,-1,1)).max()))

def metrics(K,xyz,area,lat):
    rows=[]
    for name,axis in [('tilted',np.array([.37,.53,.76])),('polar',np.array([0.,0.,1.]))]:
        axis=axis/np.linalg.norm(axis)
        for degree in range(1,5):
            f=eval_legendre(degree,xyz@axis);exact=degree*(degree+1)*f
            error=(K@f)/area-exact
            rows.append(dict(field=f'{name}-l{degree}',relativeL2=float(np.sqrt(np.dot(area,error**2)/np.dot(area,exact**2))),polarMax=float(np.max(np.abs(error[np.abs(lat)>np.deg2rad(75)]))),maxError=float(np.max(np.abs(error)))))
    return rows

def main():
    source=Path(sys.argv[1]); neighbours=int(os.environ.get('POLAR_NEIGHBOURS','24'))
    sizes=list(map(int,os.environ.get('POLAR_RINGS','12,24,48,96').split(',')))
    cases=[]
    for fixture in json.loads(source.read_text())['cases']:
        if fixture['full'] or fixture['rings'] not in sizes: continue
        area=np.array(fixture['area']);lat=np.array(fixture['lat']);lon=np.array(fixture['lon'])
        K,xyz,a,b,w,fit=graph(area,lat,lon,neighbours)
        constant=float(np.max(np.abs(K@np.ones(len(area)))))
        symmetry=K-K.T
        symmetryMax=float(np.max(np.abs(symmetry.data),initial=0))
        row=dict(rings=fixture['rings'],cells=len(area),fit=fit,constantResidual=constant,symmetryResidual=symmetryMax,metrics=metrics(K,xyz,area,lat))
        print(json.dumps(row),flush=True);cases.append(row)
        assert np.all(np.isfinite(w)) and np.all(w>=0)
        assert fit['components']==1 and constant<1e-11 and symmetryMax<1e-13
        np.savez_compressed(f"build/earth-polar-pressure/{os.environ['POLAR_RUN_NAME']}-{fixture['rings']}-graph.npz",area=area,lat=lat,lon=lon,a=a,b=b,w=w)
    refinement=[]
    for idx in range(8):
        values=[r['metrics'][idx] for r in cases]
        refinement.append(dict(field=values[0]['field'],l2Decreases=all(v['relativeL2']<u['relativeL2'] for u,v in zip(values,values[1:])),polarDecreases=all(v['polarMax']<u['polarMax'] for u,v in zip(values,values[1:]))))
    # Coordinate training residual is diagnostic, not an independent convergence gate.
    accepted=len(cases)>=3 and [r['rings'] for r in cases][-3:]==[24,48,96] and all(r['l2Decreases'] and r['polarDecreases'] for r in refinement if not r['field'].endswith('l1'))
    result=dict(scope='Local symmetric graph candidate; no native momentum import or coupled claim',numpy=np.__version__,scipy=scipy.__version__,neighbours=neighbours,cases=cases,refinement=refinement,spatialCandidateAccepted=accepted)
    with Path(f"build/earth-polar-pressure/{os.environ['POLAR_RUN_NAME']}.json").open('x') as f: json.dump(result,f,indent=2)
    print(json.dumps(dict(refinement=refinement,spatialCandidateAccepted=accepted)),flush=True)

if __name__=='__main__': main()
