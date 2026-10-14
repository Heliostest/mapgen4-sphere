import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

out=Path('build/earth-rotating-graph')
folder=Path('docs/evidence/earth-rotating-graph-20261014')
selected=json.loads((folder/'selected-runs.json').read_text())
read=lambda key: json.loads((out/(selected[key]+'.json')).read_text())
analytic=read('analytic');coupled=read('coupled');temporal=read('temporal')
plt.rcParams.update({'font.size':10,'axes.spines.top':False,'axes.spines.right':False,'figure.facecolor':'#fafaf7','axes.facecolor':'#fafaf7'})
fig,ax=plt.subplots(2,2,figsize=(11,7.4),layout='constrained')
for key,label in [('reconstruction','Wind reconstruction'),('force','Coriolis tendency')]:
    values=[max(r[key] for r in analytic['rows'] if r['rings']==n) for n in [24,48,96]]
    ax[0,0].loglog([24,48,96],values,'o-',label=label)
ax[0,0].set(xlabel='Gaussian rings',ylabel='Maximum global relative RMS',title='Spatial refinement: sampled smooth fields');ax[0,0].legend()
ax[0,1].loglog([.1,.05,.025,.0125],coupled['errors'],'o-',color='#197d75')
ax[0,1].set(xlabel='Time step (dimensionless)',ylabel='Relative state error',title='Independent complete linear-system reference')
for key,label in [('pressurePa','Pressure'),('momentumMps','Momentum'),('humidityKgKg','Humidity')]:
    values=[r[key] for r in temporal['adjacent']]
    ax[1,0].loglog([1800,900,450],[v/values[0] for v in values],'o-',label=label)
ax[1,0].set(xlabel='Coarser step in adjacent pair (s)',ylabel='Difference / first-pair difference',title='Native one-day temporal differences');ax[1,0].legend()
native=[json.loads((out/(name+'.json')).read_text()) for name in selected['native']]
ax[1,1].semilogy([r['dt'] for r in native],[max(c['maxLocalRelative'] for c in r['results']) for r in native],'o-',label='Local mass/water/dry residual')
ax[1,1].semilogy([r['dt'] for r in native],[max(c['maxEnergyRelative'] for c in r['results']) for r in native],'o-',label='Reference energy drift')
ax[1,1].set(xlabel='Time step (s)',ylabel='Maximum relative residual',title='Native one-day budgets');ax[1,1].legend(fontsize=8)
for a in ax.flat:a.grid(True,alpha=.2)
fig.suptitle('C5: rotating acoustic + shared water subsystem\nFixed reference; no nonlinear momentum, thermodynamics or climate acceptance',fontsize=13)
fig.savefig(out/'convergence.png',dpi=160)
