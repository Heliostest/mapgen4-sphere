import hashlib,json,pathlib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import NullFormatter
folder=pathlib.Path('docs/evidence/earth-rotating-sigma-20261014');out=pathlib.Path('build/earth-rotating-sigma')
selected=json.loads((folder/'selected-runs.json').read_text())
paths=[out/(selected[k]+'.json') for k in ('analytic','gradient3','temporal')]+[out/(n+'.json') for n in selected['native']]
analytic,degree,temporal,*native=[json.loads(p.read_text()) for p in paths]
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False})
fig,axes=plt.subplots(2,2,figsize=(12,8),layout='constrained');colors=['#126782','#ee6c4d','#6a4c93','#4a7c59'];rings=[24,48,96]
ax=axes[0,0]
for k,(source,key,label,style) in enumerate([(analytic,'forceRelative','Rotation / mixed / shear: global','-'),(analytic,'polarForce','Rotation / mixed / shear: polar','--'),(degree,'c9Force','Degree3 potential flow: global','-'),(degree,'c9Polar','Degree3 potential flow: polar','--')]):
    ax.loglog(rings,[max(r[key] for r in source['rows'] if r['rings']==n) for n in rings],'o'+style,color=colors[k],label=label)
ax.set(title='Sampled full-force refinement',xlabel='Latitude rings',ylabel='Relative RMS error');ax.set_xticks(rings,list(map(str,rings)));ax.legend(frameon=False,fontsize=8)
ax=axes[0,1];r=analytic['verticalRefinement'];xx=[v['layers'] for v in r];yy=[v['relative'] for v in r]
ax.loglog(xx,yy,'o-',color=colors[0],label='Centered vertical advection');ax.loglog(xx,[yy[0]*(xx[0]/n)**2 for n in xx],'--',color='#888888',label='Second order')
ax.set(title='Linear sigma profile, uniform layers',xlabel='Sigma layers',ylabel='Relative RMS error');ax.set_xticks(xx,list(map(str,xx)));ax.legend(frameon=False)
ax=axes[1,0]
for k,key in enumerate(('pressurePa','velocityMps','humidityKgKg')):
    y=[r[key] for r in temporal['adjacent']];ax.loglog([1800,900,450],[v/y[0] for v in y],'o-',color=colors[k],label=['Pressure','Edge velocity','Humidity'][k])
ax.loglog([1800,450],[1,1/16],'--',color='#888888',label='Second order')
ax.set(title='Time refinement: adjacent differences',xlabel='Coarser timestep (s)',ylabel='Normalized RMS difference');ax.set_xticks([450,900,1800],['450','900','1800']);ax.legend(frameon=False)
ax=axes[1,1];rows=[r['results'][0] for r in native]
ax.semilogy([r['dt'] for r in rows],[r['accumulatedEnergyDrift'] for r in rows],'o-',color=colors[0]);ax.axhline(1e-9,color='#888888',linestyle='--',label='Acceptance limit')
ax.set(title='Six-hour barotropic energy balance',xlabel='Timestep (s)',ylabel='Maximum relative energy drift');ax.set_xticks([225,450,900,1800],['225','450','900','1800']);ax.legend(frameon=False)
for ax in axes.flat:
    ax.grid(axis='y',alpha=.18);ax.set_axisbelow(True)
    ax.xaxis.set_minor_formatter(NullFormatter())
fig.suptitle('C9 · Rotating sigma momentum under the actual-pressure metric',fontweight='bold',fontsize=15)
fig.savefig(out/'convergence.png',dpi=160)
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
record={'passed':True,'sourceHashes':{str(folder/'plot.py').replace('\\','/'):digest(folder/'plot.py')},'inputHashes':{str(p).replace('\\','/'):digest(p) for p in paths+[folder/'selected-runs.json']},'outputSHA256':digest(out/'convergence.png')}
(out/'plot-provenance.json').write_text(json.dumps(record,indent=2)+'\n')
