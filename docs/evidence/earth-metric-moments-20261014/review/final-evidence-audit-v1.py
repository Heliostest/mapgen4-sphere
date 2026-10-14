"""Read-only independent provenance and acceptance audit. Run after all selected jobs finish."""
import json,hashlib,math,re,time,subprocess,sys
from pathlib import Path
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path('build/earth-polar-pressure/python-libs').resolve()))
import numpy as np
ROOT=Path.cwd();OUT=ROOT/'build/c10-independent-review';FOLDER=ROOT/'docs/evidence/earth-metric-moments-20261014';RUNS=ROOT/'build/earth-metric-moments'
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def rel(p):return p.relative_to(ROOT).as_posix()
def finite(v):
 if isinstance(v,float):assert math.isfinite(v),'nonfinite numeric output'
 elif isinstance(v,dict):
  for z in v.values():finite(z)
 elif isinstance(v,list):
  for z in v:finite(z)
def ordered(xs):return all(math.isfinite(x) for x in xs) and all(a>b>0 for a,b in zip(xs,xs[1:]))
selected=read(FOLDER/'selected-runs.json');names=[]
for v in selected.values():names.extend(v if isinstance(v,list) else [v])
record={'startedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'selected':selected,'sourceHashes':{},'inputHashes':{},'outputHashes':{},'statusHashes':{},'historicalRuns':[],'checks':[]}
for path in sorted(RUNS.glob('*-status.json')):
 s=read(path);assert s['state'] in ('passed','failed') and s.get('completedUTC'),f'unfinished {path.name}'
 assert s['sourceUnchanged'] and s['inputUnchanged'] and s['sourceBefore']==s['sourceAfter'] and s['inputBefore']==s['inputAfter']
 for p,h in s['sourceBefore'].items():
  archive=FOLDER/'source-archives'/h/Path(p).name;assert digest(archive)==h,f'archive {archive}'
  if s['name'] in names:assert digest(ROOT/p)==h,f'current source {p}';record['sourceHashes'][p]=h
 for p,h in s['inputBefore'].items():assert digest(ROOT/p)==h,f'input {p}';record['inputHashes'][p]=h
 for p,h in s['outputHashes'].items():assert digest(ROOT/p)==h,f'output {p}';record['outputHashes'][p]=h
 record['statusHashes'][rel(path)]=digest(path);record['historicalRuns'].append({'name':s['name'],'state':s['state'],'code':s['code']})
for name in names:
 s=read(RUNS/(name+'-status.json'));r=read(RUNS/(name+'.json'));finite(r);assert s['state']=='passed' and s['code']==0 and r['passed']
record['checks'].append('all selected source/input/output hashes agree; every attempt retained')
red=read(RUNS/'c10-metric-red-v1-status.json');assert red['state']=='failed' and red['code']!=0
assert read(RUNS/'c10-metric-v1.json')=={'passed':True,'tests':7,'failures':0,'errors':0}
record['independentFitChecks']=[]
for nr,name in zip((24,48,96),selected['fit']):
 old=read(ROOT/f'docs/evidence/earth-native-graph-wind-20261014/raw/c4-graphs-v1-{nr}-graph.json');new=read(RUNS/(name+'-graph.json'));r=read(RUNS/(name+'.json'))['report']
 assert all(old[k]==new[k] for k in old if k!='conductance')
 assert len(old['conductance'])==len(new['conductance']) and all(math.isfinite(a) and a>=.01*b>0 for a,b in zip(new['conductance'],old['conductance']))
 assert r['penalty']==r['floor']==.01 and not r['optimalityCertified'] and r['lowOrderResidual']<1e-7 and r['finalCubicNorm']<.8*r['originalCubicNorm']
 assert r['iterations']==len(r['history'])<=30 and r['history'][-1]['belowFloor']==0
 area=np.array(old['area']);la=np.array(old['lat']);lo=np.array(old['lon']);x=np.c_[np.cos(la)*np.cos(lo),np.cos(la)*np.sin(lo),np.sin(la)];east=np.c_[-np.sin(lo),np.cos(lo),np.zeros(len(area))];north=np.cross(x,east)
 i0=np.array(old['from'])-1;j0=np.array(old['to'])-1;ww=np.array(new['conductance']);ref=np.array(old['conductance']);mom=np.zeros((len(area),9));orig=np.zeros_like(mom)
 for ii,jj in ((i0,j0),(j0,i0)):
  delta=x[jj]-np.sum(x[ii]*x[jj],axis=1)[:,None]*x[ii];u=np.sum(delta*east[ii],axis=1)/np.sqrt(area[ii]);v=np.sum(delta*north[ii],axis=1)/np.sqrt(area[ii]);radial=2*np.sin(np.array(old['distance'])/2)**2/area[ii]
  for kk,component in enumerate((u,v,radial,(u*u-v*v)/np.sqrt(2),np.sqrt(2)*u*v,u**3,np.sqrt(3)*u*u*v,np.sqrt(3)*u*v*v,v**3)):
   np.add.at(mom[:,kk],ii,ww*component);np.add.at(orig[:,kk],ii,ref*component)
 mom[:,2]-=2;orig[:,2]-=2
 low=float(np.max(np.abs(mom[:,:5])));cubic=float(np.linalg.norm(mom[:,5:]));objective=float(.5*np.sum(((ww-ref)/ref)**2)+np.sum(mom[:,5:]**2)/.02)
 assert low<1e-7 and np.isclose(cubic,r['finalCubicNorm'],rtol=1e-9) and np.isclose(objective,r['objective'],rtol=1e-9)
 record['independentFitChecks'].append({'rings':nr,'lowResidual':low,'cubicNorm':cubic,'objective':objective,'minimumWeight':float(np.min(ww))})
record['checks'].append('all graph fields unchanged except bounded conductance, all fit gates satisfied')
spatial=read(RUNS/(selected['spatial']+'.json'));assert len(spatial['rows'])==72 and len(spatial['primary'])==36 and spatial['commonOriginalMetric']
for variable in (False,True):
 for axis in (1,2):
  rows=[r for r in spatial['rows'] if r['degree']==3 and r['axis']==axis and r['variable']==variable];assert [r['rings'] for r in rows]==[24,48,96]
  assert all(r['c10']['force']['globalError']<=r['c9']['force']['globalError'] for r in rows)
  for key in ('globalError','polar'):assert ordered([r['c10']['force'][key] for r in rows])
  assert rows[-1]['c10']['force']['polar']<=min(.09,.8*rows[-1]['c9']['force']['polar'])
for r in spatial['rows']:
 for model in ('c9','c10'):
  assert set(r[model])=={'force','pressure','kineticSampling','exactKGradient','curlForce'}
  assert r[model]['pressure']['globalError']>=0
 assert r['c9']['pressure']==r['c10']['pressure'] and r['c9']['exactKGradient']==r['c10']['exactKGradient']
assert sorted(set(r['degree'] for r in spatial['rows']))==[2,3,4,5] and sorted(set(r['axis'] for r in spatial['rows']))==[1,2,3]
regressions=[]
for r in spatial['rows']:
 for key in ('globalError','polar'):
  ratio=r['c10']['force'][key]/r['c9']['force'][key]
  if ratio>1:regressions.append({**{k:r[k] for k in ('rings','variable','axis','degree')},'metric':key,'ratio':ratio})
primaryRegressions=[]
for r in spatial['primary']:
 for key in ('globalError','polar'):
  ratio=r['c10'][key]/r['c9'][key]
  if ratio>1:primaryRegressions.append({**{k:r[k] for k in ('rings','variable','axis','kind')},'metric':key,'ratio':ratio})
record['potentialRegressions']=regressions;record['primaryRegressions']=primaryRegressions
record['checks'].append('all common-metric degree3 gates, held-out fields and separate force terms present')
harmonic=read(RUNS/(selected['harmonic']+'.json'));assert len(harmonic['rows'])==90
record['harmonicWorstRatios']=[]
record['harmonicRegressions']=[]
for r in harmonic['rows']:
 for key in ('relative','polarMax','rayleigh'):
  ratio=r['c10'][key]/r['c9'][key] if r['c9'][key] else (0. if r['c10'][key]==0 else float('inf'))
  if ratio>1:record['harmonicRegressions'].append({**{k:r[k] for k in ('rings','variable','axis','degree')},'metric':key,'c9':r['c9'][key],'c10':r['c10'][key],'ratio':ratio})
for nr in (24,48,96):
 rows=[r for r in harmonic['rows'] if r['rings']==nr and r['degree']>=2];ratio=max(r['c10']['relative'] for r in rows)/max(r['c9']['relative'] for r in rows);assert ratio<=1.10;record['harmonicWorstRatios'].append({'rings':nr,'ratio':ratio})
 assert max(r['c10']['relative'] for r in harmonic['rows'] if r['rings']==nr and r['degree']==1 and not r['variable'])<1e-6
record['checks'].append('scalar harmonic worst-error proxy gate passed at every resolution')
for dt,name in zip((1800,900,450,225),selected['native']):
 r=read(RUNS/(name+'.json'));assert r['dt']==dt and r['duration']==21600 and r['sameDynamicsAcrossTracers']
 assert [z['case'] for z in r['results']]==(['real','constant','sharp'] if dt==1800 else ['real'])
 for z in r['results']:
  assert z['steps']==21600/dt and z['rejections']==0 and z['pmin']>0
  assert z['maxLocalRelative']<5e-12 and z['maxEquationRelative']<5e-12 and z['maxPressureResidual']<=2e-14 and z['accumulatedEnergyDrift']<1e-9
  assert abs(z['airDriftKgM2'])<1e-8 and abs(z['dryDriftKgM2'])<1e-8 and abs(z['waterDriftMm'])<1e-9
  assert z['qmin']>=z['initialQmin']-1e-11 and z['qmax']<=z['initialQmax']+1e-11
  if dt==1800:assert z['restartBitwiseEqual'] and z['resumedSteps']==4
  trace=read(RUNS/(name+'-'+z['case']+'-trace.json'));finite(trace);assert len(trace)==z['steps']
  for k,t in enumerate(trace,1):
   assert t['step']==k and t['time']==k*dt and t['dt']==dt
   assert max(t['firstEquation'],t['lastEquation'],t['pressureEquation'],t['localAirRelativeResidual'],t['localWaterRelativeResidual'],t['localDryRelativeResidual'])<5e-12
   assert t['pressureResidual']<=2e-14 and t['completeEnergyAbsolute']<=t['completeEnergyAllowance']
   assert t['qmin']>=z['initialQmin']-1e-11 and t['qmax']<=z['initialQmax']+1e-11
  assert max(max(t['firstIterations'],t['lastIterations']) for t in trace)==z['maxNeutralIterations']
  assert sum(t['firstIterations']+t['lastIterations'] for t in trace)==z['totalNeutralIterations']
record['checks'].append('native matrix, literal trace gates and three rebuilt restarts passed')
temporal=read(RUNS/(selected['temporal']+'.json'));assert temporal['names']==selected['native']
for key in ('pressurePa','velocityMps','humidityKgKg'):
 for kind in ('adjacent','reference'):assert ordered([r[key] for r in temporal[kind]])
record['checks'].append('pressure/velocity/humidity adjacent and finest-reference differences all decrease')
project=read(RUNS/'project-checks.json');assert project['passed'] and project['tests']==278
for r in project['rows']:assert r['code']==0 and digest(ROOT/r['log'])==r['sha256']
source=read(RUNS/'c10-source-v1.json');assert source['passed'] and source['checks']==14
for p,h in source['sourceHashes'].items():assert digest(ROOT/p)==h
for folder in ('earth-rotating-sigma-20261014','earth-pressure-work-20261014','earth-compatible-momentum-20261014','earth-covariant-momentum-20261014','earth-rotating-graph-20261014','earth-native-graph-wind-20261014'):
 p=ROOT/'docs/evidence'/folder/'manifest.json';manifest=read(p)
 for b in manifest['bindings']:assert digest(ROOT/b['path'])==b['sha256']
record['checks'].append('project tests/typecheck/build and exact ancestor manifest bindings passed')
record['gitDiff']=subprocess.check_output(['git','diff','--name-only','a3a6934b6c9135ddfd912b86197f54026b615e05','--'],text=True).splitlines()
record['completedUTC']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime());record['passed']=True
(OUT/'final-evidence-audit-v1.json').write_text(json.dumps(record,indent=2,allow_nan=False));print(json.dumps({'passed':True,'checks':len(record['checks']),'potentialRegressions':len(regressions),'primaryRegressions':len(primaryRegressions),'harmonicWorstRatios':record['harmonicWorstRatios'],'harmonicRegressions':record['harmonicRegressions']}))
