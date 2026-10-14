import json,hashlib,pathlib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import NullFormatter
folder=pathlib.Path('docs/evidence/earth-metric-moments-20261014');out=pathlib.Path('build/earth-metric-moments')
selected=json.loads((folder/'selected-runs.json').read_text());paths=[out/(selected[k]+'.json') for k in ('spatial','temporal')]
spatial,temporal=[json.loads(p.read_text()) for p in paths];benchmark=[r for r in spatial['rows'] if r['degree']==3 and r['axis']<=2]
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False})
fig,axes=plt.subplots(2,2,figsize=(12,8),layout='constrained');rings=[24,48,96];colors=['#126782','#ee6c4d','#6a4c93','#4a7c59']
ax=axes[0,0]
for model,color in zip(('c9','c10'),colors):
    for metric,style in [('polar','--'),('globalError','-')]:
        ax.loglog(rings,[max(r[model]['force'][metric] for r in benchmark if r['rings']==n) for n in rings],'o'+style,color=color,label=f'{model.upper()} '+('polar' if metric=='polar' else 'global'))
ax.set(title='Degree3 force: same original metric',xlabel='Latitude rings',ylabel='Normalized RMS error');ax.set_xticks(rings,list(map(str,rings)));ax.legend(frameon=False)
ax=axes[0,1]
for model,color in zip(('c9','c10'),colors):
    for term,style,label in [('kineticSampling','-','kinetic sampling'),('curlForce','--','weak curl')]:
        ax.loglog(rings,[max(r[model][term]['polar'] for r in benchmark if r['rings']==n) for n in rings],'o'+style,color=color,label=f'{model.upper()} {label}')
ax.set(title='Polar force-error contributions',xlabel='Latitude rings',ylabel='Normalized RMS magnitude');ax.set_xticks(rings,list(map(str,rings)));ax.legend(frameon=False,fontsize=9)
ax=axes[1,0]
for i,key in enumerate(('pressurePa','velocityMps','humidityKgKg')):
    y=[r[key] for r in temporal['adjacent']];ax.loglog([1800,900,450],[v/y[0] for v in y],'o-',color=colors[i],label=['Pressure','Edge velocity','Humidity'][i])
ax.loglog([1800,450],[1,1/16],'--',color='#888888',label='Second order')
ax.set(title='Six-hour time refinement',xlabel='Coarser timestep (s)',ylabel='Normalized adjacent difference');ax.set_xticks([450,900,1800],['450','900','1800']);ax.legend(frameon=False)
ax=axes[1,1];degrees=[2,3,4,5]
for i,(key,label) in enumerate([('globalError','Global'),('polar','Polar')]):
    ratios=[max(r['c10']['force'][key]/r['c9']['force'][key] for r in spatial['rows'] if r['rings']==96 and r['degree']==d) for d in degrees]
    ax.bar([d+(i-.5)*.32 for d in degrees],ratios,width=.32,color=colors[i],label=label)
ax.axhline(1,color='#888888',linestyle='--');ax.set(title='96-ring worst paired error ratio',xlabel='Potential-flow harmonic degree',ylabel='C10 / C9 (lower is better)');ax.set_xticks(degrees);ax.legend(frameon=False)
for ax in axes.flat:ax.grid(axis='y',alpha=.18);ax.set_axisbelow(True);ax.xaxis.set_minor_formatter(NullFormatter())
fig.suptitle('C10 · Positive metric refinement with unchanged C9 dynamics',fontweight='bold',fontsize=15)
fig.savefig(out/'convergence.png',dpi=160)
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
record={'passed':True,'sourceHashes':{str(folder/'plot.py').replace('\\','/'):digest(folder/'plot.py')},'inputHashes':{str(p).replace('\\','/'):digest(p) for p in paths+[folder/'selected-runs.json']},'outputSHA256':digest(out/'convergence.png')}
(out/'plot-provenance.json').write_text(json.dumps(record,indent=2)+'\n')
