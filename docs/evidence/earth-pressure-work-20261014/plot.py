import hashlib,json,pathlib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
folder=pathlib.Path('docs/evidence/earth-pressure-work-20261014');out=pathlib.Path('build/earth-pressure-work')
selected=json.loads((folder/'selected-runs.json').read_text())
paths=[out/(selected[k]+'.json') for k in ('analytic','temporal')]+[out/(n+'.json') for n in selected['native']]
analytic,temporal,*native=[json.loads(p.read_text()) for p in paths]
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False})
fig,axes=plt.subplots(1,3,figsize=(14,4.4),layout='constrained');colors=['#126782','#ee6c4d','#6a4c93']
for k,key in enumerate(('pressureRelative','potentialRelative','forceRelative')):
    y=[max(r[key] for r in analytic['rows'] if r['rings']==n) for n in (24,48,96)]
    axes[0].loglog([24,48,96],y,'o-',color=colors[k],label=['Mass-flux divergence','Bernoulli potential','Bernoulli force'][k])
axes[0].set(title='Spatial refinement: worst of 12 cases',xlabel='Latitude rings',ylabel='Relative RMS error')
axes[0].set_xticks([24,48,96],['24','48','96']);axes[0].legend(frameon=False)
for k,key in enumerate(('pressurePa','velocityMps','humidityKgKg')):
    y=[r[key] for r in temporal['adjacent']]
    axes[1].loglog([1800,900,450],[v/y[0] for v in y],'o-',color=colors[k],label=['Pressure','Edge velocity','Humidity'][k])
axes[1].loglog([1800,450],[1,1/16],'--',color='#888888',label='Second order')
axes[1].set(title='Time refinement: adjacent differences',xlabel='Coarser timestep (s)',ylabel='Normalized RMS difference')
axes[1].set_xticks([450,900,1800],['450','900','1800']);axes[1].legend(frameon=False)
rows=[r['results'][0] for r in native]
axes[2].semilogy([r['dt'] for r in rows],[r['accumulatedEnergyDrift'] for r in rows],'o-',color=colors[0])
axes[2].axhline(1e-9,color='#888888',linestyle='--',label='Acceptance limit')
axes[2].set(title='Six-hour barotropic energy balance',xlabel='Timestep (s)',ylabel='Maximum relative energy drift')
axes[2].set_xticks([225,450,900,1800],['225','450','900','1800']);axes[2].legend(frameon=False)
for ax in axes:ax.grid(axis='y',alpha=.18);ax.set_axisbelow(True)
fig.suptitle('C8 · Actual-pressure kinetic metric and Bernoulli pressure work',fontweight='bold',fontsize=14)
fig.savefig(out/'convergence.png',dpi=180)
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
record={'passed':True,'sourceHashes':{str(folder/'plot.py').replace('\\','/'):digest(folder/'plot.py')},'inputHashes':{str(p).replace('\\','/'):digest(p) for p in paths},'outputSHA256':digest(out/'convergence.png')}
(out/'plot-provenance.json').write_text(json.dumps(record,indent=2)+'\n')
