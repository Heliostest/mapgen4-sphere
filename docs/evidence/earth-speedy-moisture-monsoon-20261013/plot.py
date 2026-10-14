import sys,json,pathlib
sys.path.insert(0,str(pathlib.Path('build/earth-seaice-p1/plot-libs').resolve()))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
folder=pathlib.Path('docs/evidence/earth-speedy-moisture-monsoon-20261013')
a=json.loads((folder/'acceptance.json').read_text(encoding='utf8'))
colors=['#858c95','#b185cc','#de9139','#188e86']
labels=['Before / seasonal SST','Water repair / seasonal SST','Coupled repair / free SST','Coupled repair / seasonal SST']
months=np.arange(1,13)
fig,axs=plt.subplots(2,2,figsize=(12,8),layout='constrained')
for col,name in enumerate(['India','Australia north']):
    regions=[next(r for r in c['regions'] if r['name']==name) for c in a['cases']]
    axs[0,col].plot(months,regions[0]['observedMonthlyMm'],'k--',label='GPCC 1991–2020',linewidth=2)
    for r,color,label in zip(regions,colors,labels):
        axs[0,col].plot(months,r['monthlyMm'],color=color,label=label,linewidth=2)
        axs[1,col].plot(months,np.array(r['profiles'][7]['temperatureK'])-273.15,color=color,label=label,linewidth=2)
    axs[0,col].set(title=name+' — precipitation',ylabel='mm / month',xticks=months)
    axs[1,col].set(title=name+' — lowest-layer air temperature',ylabel='°C at sigma=0.9375 (not 2 m)',xlabel='Calendar month',xticks=months)
for ax in axs.flat:ax.grid(alpha=.18)
axs[0,0].legend(fontsize=8)
fig.suptitle('Real 2001–2007 integrations · identical initial atmosphere and land\n2006 statistics; unchanged GPCC support; no regional precipitation adjustment',fontsize=13)
for ext in ['png','svg']:fig.savefig(folder/f'monsoon-repair.{ext}',dpi=160)
plt.close(fig)
fig,axs=plt.subplots(1,2,figsize=(13,5),layout='constrained')
names=[r['name'] for r in a['cases'][0]['regions']];x=np.arange(len(names))
for i,(c,color,label) in enumerate(zip(a['cases'],colors,labels)):
    axs[0].barh(x+(i-1.5)*.19,[r['monthlyMAEMm'] for r in c['regions']],height=.19,color=color,label=label)
    b=c['budget']['year'];axs[1].bar(i,b['airWaterExcludingModeResidualMm'],color=color,width=.6)
    axs[1].vlines(i,-b['airWaterLimitMm'],b['airWaterLimitMm'],color='black',linewidth=2)
axs[0].set(yticks=x,yticklabels=names,title='All 11 regions — monthly precipitation MAE',xlabel='mm / month');axs[0].legend(fontsize=8)
axs[1].set(title='Atmospheric water budget — 2006',ylabel='Residual mm; black interval = unchanged tolerance',xticks=range(4),xticklabels=['Before','Water','Coupled\nfree SST','Coupled\nseasonal SST'])
axs[1].axhline(0,color='black',linewidth=.7)
for ax in axs:ax.grid(axis='x' if ax is axs[0] else 'y',alpha=.18)
for ext in ['png','svg']:fig.savefig(folder/f'budgets-and-regressions.{ext}',dpi=160)
plt.close(fig)
print('Saved physical comparison and regression figures.')
