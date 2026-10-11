"""Numerical integration figures; these are not browser/WebGL screenshots."""
import sys,json
from pathlib import Path
sys.path.insert(0,str(Path('build/earth-seaice-p1/plot-libs').resolve()))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

folder=Path('docs/evidence/earth-seaice-p1-20261011')
load=lambda name:json.loads((folder/(name+'.json')).read_text(encoding='utf8'))
a=load('acceptance')
fig,axes=plt.subplots(1,3,figsize=(13.5,4),constrained_layout=True)
colors={'baseline-1800':'#b7792b','conductive-v2-1800':'#167d9b'}
for name in colors:
 d=load(name+'-seaice')['daily']
 axes[0].plot([r['day'] for r in d],[r['north']['iceGlobalMm']+r['south']['iceGlobalMm'] for r in d],color=colors[name],label='Before' if name.startswith('baseline') else 'Conductive v2')
 for ax,hem in zip(axes[1:],['north','south']):
  ax.plot([r['day'] for r in d],[r[hem]['extentMillionKm2'] for r in d],color=colors[name])
axes[0].set(title='Conserved sea-ice inventory',ylabel='Global water equivalent (mm)',xlabel='Actual integrated day')
for ax,hem in zip(axes[1:],['north','south']):
 obs=[r['extentMillionKm2'] for r in load('nsidc-1981-2010')['records'] if r['hemisphere']==hem]
 ax.axhspan(min(obs),max(obs),color='#657967',alpha=.18,label='NSIDC native monthly range')
 ax.set(title=hem.capitalize()+' extent proxy',ylabel='Million km²',xlabel='Actual integrated day')
 ax.legend(fontsize=8)
axes[0].legend(fontsize=8)
for ax in axes:ax.grid(alpha=.18)
fig.suptitle('Identical initial stock · actual 730-day integration · unchanged formal default',fontsize=12)
fig.savefig(folder/'seaice-continuous.png',dpi=160)
fig.savefig(folder/'seaice-continuous.svg')
plt.close(fig)

fig,ax=plt.subplots(figsize=(11,4),constrained_layout=True)
rows=a['gpcc'];x=list(range(len(rows)))
for offset,key,color,label in [(-.23,'before1800Mm','#b7792b','Before (1800 s)'),(0,'after450Mm','#167d9b','After (450 s)'),(.23,'GPCCMm','#526954','GPCC, same land support')]:
 ax.bar([i+offset for i in x],[r[key] for r in rows],width=.23,color=color,label=label)
ax.set_xticks(x,[r['name'].replace('Australia ','Aus. ').replace('Himalaya foreland','Him. foreland') for r in rows],rotation=25,ha='right')
ax.set(ylabel='Actual 365-day precipitation (mm)',title='Regional acceptance remains open; lower rainfall alone is not a pass')
ax.legend(fontsize=9);ax.grid(axis='y',alpha=.18)
fig.savefig(folder/'gpcc-regional.png',dpi=160)
fig.savefig(folder/'gpcc-regional.svg')
