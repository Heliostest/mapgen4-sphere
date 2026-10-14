"""Positive graph metric with constrained low moments and penalized cubic moments."""
import copy,math,time
import numpy as np
from scipy.sparse import coo_matrix,diags
from scipy.sparse.linalg import spsolve
from scipy.sparse.csgraph import connected_components

def moment_matrix(graph):
    try:
        A,lat,lon,w,d=[np.asarray(graph[k],dtype=float) for k in ('area','lat','lon','conductance','distance')]
        af,bf=[np.asarray(graph[k],dtype=float) for k in ('from','to')]
    except (KeyError,TypeError,ValueError) as error:raise ValueError('invalid graph arrays') from error
    n=len(A);ne=len(w)
    if n<2 or ne<1 or any(z.ndim!=1 or not np.all(np.isfinite(z)) for z in (A,lat,lon,w,d,af,bf)):raise ValueError('finite graph vectors required')
    if len(lat)!=n or len(lon)!=n or any(len(z)!=ne for z in (d,af,bf)):raise ValueError('graph shape mismatch')
    if np.any(A<=0) or np.any(w<=0) or np.any(d<=0) or np.any(d>=np.pi) or np.any(np.abs(lat)>np.pi/2):raise ValueError('positive metric and valid radians required')
    if any(np.any(z!=np.floor(z)) or np.any(z<1) or np.any(z>n) for z in (af,bf)) or np.any(af==bf):raise ValueError('invalid edge indices')
    a=af.astype(int)-1;b=bf.astype(int)-1
    if connected_components(coo_matrix((np.ones(ne),(a,b)),shape=(n,n)),directed=False,return_labels=False)!=1:raise ValueError('connected graph required')
    x=np.column_stack((np.cos(lat)*np.cos(lon),np.cos(lat)*np.sin(lon),np.sin(lat)))
    east=np.column_stack((-np.sin(lon),np.cos(lon),np.zeros(n)));north=np.cross(x,east)
    actual=np.arctan2(np.linalg.norm(np.cross(x[a],x[b]),axis=1),np.sum(x[a]*x[b],axis=1))
    if not np.allclose(actual,d,rtol=1e-10,atol=1e-12):raise ValueError('coordinate/distance mismatch')
    rows=[];cols=[];values=[]
    for i,j in ((a,b),(b,a)):
        u=np.sum(x[j]*east[i],axis=1)/np.sqrt(A[i]);v=np.sum(x[j]*north[i],axis=1)/np.sqrt(A[i]);r=(1-np.sum(x[i]*x[j],axis=1))/A[i]
        components=(u,v,r,(u*u-v*v)/np.sqrt(2),np.sqrt(2)*u*v,u**3,np.sqrt(3)*u*u*v,np.sqrt(3)*u*v*v,v**3)
        for k,z in enumerate(components):rows.append(9*i+k);cols.append(np.arange(ne));values.append(z)
    C=coo_matrix((np.concatenate(values),(np.concatenate(rows),np.concatenate(cols))),shape=(9*n,ne)).tocsr()
    if not np.all(np.isfinite(C.data)):raise ValueError('moment scale overflow')
    target=np.zeros(9*n);target[2::9]=2
    return C,target,w

def fit_metric(graph,penalty=.01,floor=.01,maxiter=30):
    if not isinstance(maxiter,int) or isinstance(maxiter,bool) or maxiter<1:raise ValueError('positive integer iteration limit required')
    if not math.isfinite(penalty) or penalty<=0 or not math.isfinite(floor) or not 0<floor<1:raise ValueError('positive penalty and floor between zero and one required')
    C,target,w0=moment_matrix(graph);n=len(target)//9;lower=floor*w0
    if not np.all(np.isfinite(lower)) or not np.all(lower>0):raise ValueError('positive floor not representable')
    free=np.ones(len(w0),dtype=bool);history=[];started=time.perf_counter()
    initial=(C@w0-target).reshape(n,9)
    for iteration in range(1,maxiter+1):
        if not np.any(free):raise RuntimeError('no free metric weights')
        Cf=C[:,free];reference=w0[free];S=Cf@diags(reference);N=(S@S.T).tocsc()
        ridge=1e-14*float(np.mean(N.diagonal()))
        if not math.isfinite(ridge) or ridge<=0:raise RuntimeError('invalid normal-matrix scale')
        diagonal=np.full((n,9),ridge);diagonal[:,5:]+=penalty
        rhs=target-C[:,~free]@lower[~free]-Cf@reference
        multiplier=spsolve(N+diags(diagonal.ravel()),rhs)
        w=lower.copy();w[free]=reference*(1+S.T@multiplier)
        if not np.all(np.isfinite(w)):raise RuntimeError('nonfinite metric solve')
        defect=(C@w-target).reshape(n,9);violating=w<lower
        history.append(dict(iteration=iteration,free=int(np.sum(free)),belowFloor=int(np.sum(violating)),lowMax=float(np.max(np.abs(defect[:,:5]))),cubicNorm=float(np.linalg.norm(defect[:,5:]))))
        if not np.any(violating):break
        free[violating]=False
    else:raise RuntimeError('metric iteration limit exhausted')
    if np.max(np.abs(defect[:,:5]))>1e-7:raise RuntimeError('low-order metric consistency failed')
    result=copy.deepcopy(graph);result['conductance']=w.tolist()
    report=dict(passed=True,penalty=penalty,floor=floor,iterations=iteration,history=history,
        originalCubicNorm=float(np.linalg.norm(initial[:,5:])),finalCubicNorm=float(np.linalg.norm(defect[:,5:])),
        lowOrderResidual=float(np.max(np.abs(defect[:,:5]))),minimumRatio=float(np.min(w/w0)),maximumRatio=float(np.max(w/w0)),
        pinned=int(np.sum(~free)),ridge=ridge,seconds=time.perf_counter()-started,
        objective=float(np.sum(((w-w0)/w0)**2)/2+np.sum(defect[:,5:]**2)/(2*penalty)),optimalityCertified=False)
    return result,report
