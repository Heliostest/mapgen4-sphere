import hashlib, json, pathlib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

folder=pathlib.Path('docs/evidence/earth-covariant-momentum-20261014')
out=pathlib.Path('build/earth-covariant-momentum')
selected=json.loads((folder/'selected-runs.json').read_text())
paths=[out/(selected[k]+'.json') for k in ('analytic','temporal')]+[out/(n+'.json') for n in selected['native']]
analytic,temporal,*native=[json.loads(p.read_text()) for p in paths]
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False})
fig,axes=plt.subplots(1,3,figsize=(14,4.4),layout='constrained')
colors=['#126782','#ee6c4d','#6a4c93']
for k,key in enumerate(('relativeRMS','polarRMS')):
    y=[max(r[key] for r in analytic['rows'] if r['rings']==n) for n in (24,48,96)]
    axes[0].loglog([24,48,96],y,'o-',color=colors[k],label=['Global RMS','Polar RMS'][k])
axes[0].set(title='Spatial refinement: worst of 12 cases',xlabel='Latitude rings',ylabel='Relative acceleration error')
axes[0].set_xticks([24,48,96],['24','48','96']);axes[0].legend(frameon=False)
for k,key in enumerate(('pressurePa','velocityMps','humidityKgKg')):
    y=[r[key] for r in temporal['adjacent']]
    axes[1].loglog([1800,900,450],[v/y[0] for v in y],'o-',color=colors[k],label=['Pressure','Velocity','Humidity'][k])
axes[1].loglog([1800,450],[1,.25],'--',color='#888888',label='First order')
axes[1].set(title='Time refinement: adjacent differences',xlabel='Coarser timestep (s)',ylabel='Normalized RMS difference')
axes[1].set_xticks([450,900,1800],['450','900','1800']);axes[1].legend(frameon=False)
rows=[r['results'][0] for r in native]
axes[2].bar([str(int(r['dt'])) for r in rows],[100*r['energyLossFraction'] for r in rows],color=colors[0],width=.55)
axes[2].set(title='Six-hour kinetic energy dissipation',xlabel='Timestep (s)',ylabel='Energy lost (%)',ylim=(0,max(100*r['energyLossFraction'] for r in rows)*1.25))
for i,r in enumerate(rows): axes[2].text(i,100*r['energyLossFraction']+.03,f"{100*r['energyLossFraction']:.3f}%",ha='center',fontsize=9)
for ax in axes: ax.grid(axis='y',alpha=.18);ax.set_axisbelow(True)
fig.suptitle('C6 · Covariant momentum transport | isolated pressureless baseline',fontweight='bold',fontsize=14)
fig.savefig(out/'convergence.png',dpi=180)
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
record={'passed':True,'sourceHashes':{str(folder/'plot.py').replace('\\','/'):digest(folder/'plot.py')},
        'inputHashes':{str(p).replace('\\','/'):digest(p) for p in paths},'outputSHA256':digest(out/'convergence.png')}
(out/'plot-provenance.json').write_text(json.dumps(record,indent=2)+'\n')
