import sys,json,pathlib
sys.path.insert(0,str(pathlib.Path('build/earth-seaice-p1/plot-libs').resolve()))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
folder=pathlib.Path('docs/evidence/earth-speedy-budgets-sst-20261012')
a=json.loads((folder/'acceptance.json').read_text(encoding='utf8'))
colors=['#7f8c8d','#df8c38','#168f86'];labels=['Original free SST','Corrected free SST','Corrected seasonal SST']
months=np.arange(1,13)
fig,axs=plt.subplots(2,2,figsize=(12,8),layout='constrained')
for col,name in enumerate(['India','Australia north']):
    regions=[next(r for r in c['regions'] if r['name']==name) for c in a['cases']]
    axs[0,col].plot(months,regions[0]['observedMonthlyMm'],'k--',label='GPCC 1991–2020',linewidth=2)
    for r,color,label in zip(regions,colors,labels):axs[0,col].plot(months,r['monthlyMm'],color=color,label=label,linewidth=2)
    axs[0,col].set(title=name+' — precipitation',ylabel='mm / month',xticks=months)
    for r,color,label in zip(regions,colors,labels):axs[1,col].plot(months,r['local']['northWindMps'],color=color,label=label)
    axs[1,col].axhline(0,color='black',linewidth=.7)
    axs[1,col].set(title=name+' — lowest-level northward wind',ylabel='m/s at sigma=0.9375',xlabel='Calendar month',xticks=months)
for ax in axs.flat:ax.grid(alpha=.18)
axs[0,0].legend(fontsize=9)
fig.suptitle('T32 / 8-layer real integration · same 2001 initial atmosphere and land\nFive-year spinup, statistics from 2006; geographic GPCC support unchanged',fontsize=13)
for ext in ['png','svg']:fig.savefig(folder/f'monsoon-comparison.{ext}',dpi=160)
plt.close(fig)
fig,axs=plt.subplots(1,3,figsize=(14,4.5),layout='constrained')
names=[r['name'] for r in a['cases'][0]['regions']]
x=np.arange(len(names))
for i,(c,color,label) in enumerate(zip(a['cases'],colors,labels)):
    axs[0].barh(x+(i-1)*.23,[r['annualBiasMm'] for r in c['regions']],height=.23,color=color,label=label)
axs[0].set(yticks=x,yticklabels=names,title='Annual precipitation bias',xlabel='Model − GPCC (mm/year)');axs[0].axvline(0,color='black',linewidth=.7)
for i,(c,color,label) in enumerate(zip(a['cases'],colors,labels)):
    b=c['budget']['statisticsYear']
    axs[1].bar(i,b['landRawResidualMm'],color=color,width=.6)
    if b['landLedgerResidualMm'] is not None:axs[1].scatter(i,b['landLedgerResidualMm'],marker='x',s=80,color='black')
    axs[2].bar(i,b['airWaterExcludingCurrentModeResidualMm'],color=color,width=.6)
    axs[2].vlines(i,-b['airWaterLimitMm'],b['airWaterLimitMm'],color='black',linewidth=2)
for ax in axs[1:]:ax.set(xticks=np.arange(3),xticklabels=['Original','Free SST','Seasonal SST']);ax.axhline(0,color='black',linewidth=.7);ax.grid(axis='y',alpha=.18)
axs[1].set(title='Land water ledger (2006)',ylabel='Residual mm; × includes drainage')
axs[2].set(title='Atmospheric water residual (2006)',ylabel='mm; black line = original tolerance')
axs[0].legend(fontsize=8,loc='lower right')
fig.suptitle('Scoped budget checks and all 11 GPCC regions — no regional rain correction',fontsize=13)
for ext in ['png','svg']:fig.savefig(folder/f'budget-and-regions.{ext}',dpi=160)
plt.close(fig)
print('Saved two PNG/SVG figures from acceptance.json')
