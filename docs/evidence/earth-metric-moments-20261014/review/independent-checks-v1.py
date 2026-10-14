"""Independent C10 review checks; implementation and frozen inputs remain read-only."""
import sys
sys.dont_write_bytecode=True
import json,hashlib,copy,importlib.util,traceback,time
from pathlib import Path
sys.path.insert(0,str(Path('build/earth-polar-pressure/python-libs').resolve()))
import numpy as np
from scipy.sparse import coo_matrix,csr_matrix
ROOT=Path.cwd(); OUT=ROOT/'build/c10-independent-review'; SRC=ROOT/'docs/evidence/earth-metric-moments-20261014/metric-fit.py'
paths=[SRC,Path(__file__).resolve(),ROOT/'docs/evidence/earth-native-graph-wind-20261014/raw/c4-graphs-v1-24-graph.json',ROOT/'build/earth-metric-moments/c10-fit-24-v1-graph.json',ROOT/'build/earth-metric-moments/c10-fit-24-v1.json']
hashpaths=lambda:{p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
record={'startedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'sourceBefore':hashpaths(),'checks':[]}; failed=False
spec=importlib.util.spec_from_file_location('c10_review_metric',SRC);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
graph=json.loads(paths[2].read_text());baseline=json.loads(paths[3].read_text());basereport=json.loads(paths[4].read_text())['report']
rng=np.random.default_rng(837191)
def check(name,fn):
 global failed
 try:
  data=fn();record['checks'].append({'name':name,'passed':True,'details':data});print(json.dumps(record['checks'][-1]),flush=True)
 except Exception as e:
  failed=True;record['checks'].append({'name':name,'passed':False,'error':repr(e),'traceback':traceback.format_exc()});print(json.dumps(record['checks'][-1]),flush=True)
def independent_matrix(g,angles=None,reflect=False):
 a=np.array(g['area']);lat=np.array(g['lat']);lon=np.array(g['lon']);n=len(a);ne=len(g['from'])
 x=np.c_[np.cos(lat)*np.cos(lon),np.cos(lat)*np.sin(lon),np.sin(lat)];east=np.c_[-np.sin(lon),np.cos(lon),np.zeros(n)];north=np.cross(x,east)
 if angles is not None:
  e=east*np.cos(angles)[:,None]+north*np.sin(angles)[:,None];q=-east*np.sin(angles)[:,None]+north*np.cos(angles)[:,None]
  east=e;north=-q if reflect else q
 rows=[];cols=[];data=[]
 for edge,(aa,bb) in enumerate(zip(g['from'],g['to'])):
  for i,j in ((aa-1,bb-1),(bb-1,aa-1)):
   v=x[j]-np.dot(x[i],x[j])*x[i];u=np.dot(v,east[i])/np.sqrt(a[i]);v=np.dot(v,north[i])/np.sqrt(a[i])
   r=2*np.sin(g['distance'][edge]/2)**2/a[i]
   vals=(u,v,r,(u*u-v*v)/np.sqrt(2),np.sqrt(2)*u*v,u**3,np.sqrt(3)*u*u*v,np.sqrt(3)*u*v*v,v**3)
   rows.extend(range(9*i,9*i+9));cols.extend([edge]*9);data.extend(vals)
 return coo_matrix((data,(rows,cols)),shape=(9*n,ne)).tocsr()
Cind=independent_matrix(graph);target=np.zeros(Cind.shape[0]);target[2::9]=2
w0=np.array(graph['conductance']);w=np.array(baseline['conductance'])
def bookkeeping():
 d=(Cind@w-target).reshape(-1,9);old=(Cind@w0-target).reshape(-1,9);objective=.5*np.dot((w-w0)/w0,(w-w0)/w0)+np.sum(d[:,5:]**2)/(.02)
 assert np.max(np.abs(d[:,:5]))<1e-7
 assert np.all(w>=.01*w0)
 assert np.isclose(objective,basereport['objective'],rtol=1e-10)
 assert np.isclose(np.linalg.norm(d[:,5:]),basereport['finalCubicNorm'],rtol=1e-10)
 assert np.count_nonzero(w==.01*w0)==basereport['pinned']
 return {'independentLowResidual':float(np.max(np.abs(d[:,:5]))),'independentObjective':float(objective),'cubicRatio':float(np.linalg.norm(d[:,5:])/np.linalg.norm(old[:,5:])),'pinned':int(np.count_nonzero(w==.01*w0))}
check('independent moment accumulation, floor, objective bookkeeping',bookkeeping)
def dense_primal():
 oldfun=m.moment_matrix
 try:
  E=13;n=2;low=rng.normal(size=(3,E));third=.01*rng.normal(size=(8,E));ref=1+rng.random(E);A=np.zeros((18,E));lowids=[0,1,9];cubicids=[5,6,7,8,14,15,16,17];A[lowids]=low;A[cubicids]=third;b=np.zeros(18);b[lowids]=low@ref
  m.moment_matrix=lambda g:(csr_matrix(A),b,ref)
  actual,rep=m.fit_metric({'conductance':ref.tolist()},penalty=.017,floor=.02)
  H=np.diag(1/ref**2)+third.T@third/.017
  rhs=np.r_[1/ref,b[lowids]];KKT=np.block([[H,low.T],[low,np.zeros((3,3))]])
  expected=np.linalg.solve(KKT,rhs)[:E];actual=np.array(actual['conductance']);err=np.linalg.norm(actual-expected)/np.linalg.norm(expected)
  assert np.all(expected>.02*ref) and rep['pinned']==0 and err<1e-10
  # A second system activates the lower bound. Re-solve the primal restricted to exactly that active set.
  third=.25*rng.normal(size=(8,E));A[cubicids]=third
  actual2,rep2=m.fit_metric({'conductance':ref.tolist()},penalty=.017,floor=.3)
  actual2=np.array(actual2['conductance']);pin=actual2==.3*ref;free=~pin;H=np.diag(1/ref**2)+third.T@third/.017
  KKT=np.block([[H[np.ix_(free,free)],low[:,free].T],[low[:,free],np.zeros((3,3))]])
  rhs=np.r_[1/ref[free]-H[np.ix_(free,pin)]@(.3*ref[pin]),b[lowids]-low[:,pin]@(.3*ref[pin])]
  restricted=np.linalg.solve(KKT,rhs)[:sum(free)];err2=np.linalg.norm(actual2[free]-restricted)/np.linalg.norm(restricted)
  assert pin.any() and err2<1e-9
  objective=.5*np.sum(((actual2-ref)/ref)**2)+np.sum((third@actual2)**2)/(.034)
  assert np.isclose(objective,rep2['objective'],rtol=1e-11)
  return {'unconstrainedPrimalRelativeError':float(err),'pinnedRestrictedPrimalRelativeError':float(err2),'pinned':int(sum(pin)),'reportedCertified':rep2['optimalityCertified']}
 finally:m.moment_matrix=oldfun
check('dense primal KKT comparison with and without pinned weights',dense_primal)
def local_basis():
 oldfun=m.moment_matrix;angles=rng.uniform(-np.pi,np.pi,len(graph['area']));Crot=independent_matrix(graph,angles,reflect=True)
 try:
  m.moment_matrix=lambda g:(Crot,target,w0)
  actual,rep=m.fit_metric(graph);actual=np.array(actual['conductance']);err=np.linalg.norm(actual-w)/np.linalg.norm(w)
  assert err<1e-7
  return {'independentLocalRotationsAndReflections':len(angles),'weightRelativeError':float(err),'pinned':rep['pinned']}
 finally:m.moment_matrix=oldfun
check('independent local O(2) basis covariance',local_basis)
def tiny_weight():
 g=copy.deepcopy(graph);idx=int(np.argmin(w0));g['conductance'][idx]=1e-290
 fitted,rep=m.fit_metric(g);ww=np.array(fitted['conductance']);ratio=ww/np.array(g['conductance']);assert np.all(np.isfinite(ratio)) and np.all(ww>=.01*np.array(g['conductance']))
 assert np.isfinite(rep['objective']) and rep['lowOrderResidual']<1e-7
 return {'edge':idx,'originalWeight':float(w0[idx]),'tinyWeight':g['conductance'][idx],'fittedTinyWeight':float(ww[idx]),'objective':rep['objective']}
check('near-zero positive original conductance remains finite',tiny_weight)
def malformed():
 failures=[]
 cases=[]
 for key,value in [('area',[]),('area',1.),('area',[[1.]]),('lat',[]),('lon',[float('inf')]*len(graph['lon'])),('conductance',[0.]*len(w0)),('from',[.5]*len(w0)),('distance',[0.]*len(w0))]:
  g=copy.deepcopy(graph);g[key]=value;cases.append((key+' '+str(type(value)),g))
 g=copy.deepcopy(graph);g['to']=g['from'].copy();cases.append(('self-loop',g))
 g=copy.deepcopy(graph);g['conductance'][0]=np.nextafter(0.,1.);cases.append(('unrepresentable floor',g))
 g=copy.deepcopy(graph);g['area']=[1e-310]*len(g['area']);cases.append(('moment overflow',g))
 for label,g in cases:
  before=copy.deepcopy(g)
  try:m.fit_metric(g)
  except (ValueError,TypeError,RuntimeError,OverflowError) as e:failures.append({'case':label,'exception':type(e).__name__,'message':str(e)})
  else:raise AssertionError('accepted malformed '+label)
  assert g==before
 return failures
check('malformed and overflow inputs reject without graph mutation',malformed)
record['sourceAfter']=hashpaths();record['sourceUnchanged']=record['sourceBefore']==record['sourceAfter'];record['completedUTC']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime());record['passed']=not failed and record['sourceUnchanged']
(OUT/'independent-checks-v1.json').write_text(json.dumps(record,indent=2,allow_nan=False))
print(json.dumps({'passed':record['passed'],'checks':len(record['checks']),'sourceUnchanged':record['sourceUnchanged']}),flush=True)
sys.exit(0 if record['passed'] else 1)
