from pathlib import Path
import sys,json
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'build/earth-seaice-p1/plot-libs'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
OUT=ROOT/'build/earth-conservative-transport'
d=json.loads((OUT/'candidate-c1-temporal-reference-v2.json').read_text())
fig,axes=plt.subplots(1,2,figsize=(11,4),layout='constrained')
c=d['modalTimeRefinement']
axes[0].loglog([r['dt'] for r in c],[r['errorPa'] for r in c],'o-',color='#007c91',label='Exact BE mode propagation')
axes[0].scatter([r['dt'] for r in d['rows']],[r['rmsTemporalErrorPa'] for r in d['rows']],marker='x',s=80,color='#b45747',label='Actual three-day integrations')
axes[0].invert_xaxis();axes[0].legend(fontsize=9)
axes[0].set(title='Time error improves, remains substantial',xlabel='Time step (s), finer to the right',ylabel='Pressure RMS error (Pa)\nvs continuous-time spatial system')
axes[1].bar(['1800 vs 900 s','900 vs 450 s'],[11.783161578878467,16.678109667905026],color=['#9470b3','#b45747'])
axes[1].set(title='Original adjacent-step gate: FAILED',ylabel='RMS difference between integrations (Pa)')
for ax in axes:
    ax.spines[['top','right']].set_visible(False)
fig.suptitle('Correct BE implementation does not establish coarse-step accuracy',fontsize=13)
fig.savefig(OUT/'candidate-c1-temporal-v2.png',dpi=170)
print(OUT/'candidate-c1-temporal-v2.png')
