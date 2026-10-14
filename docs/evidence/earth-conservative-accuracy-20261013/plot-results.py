import json,sys
from pathlib import Path
root=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(root/'build/earth-seaice-p1/plot-libs'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
out=root/'build/earth-conservative-accuracy'
a=json.loads((out/'c2-final-analysis.json').read_text())
fig,axes=plt.subplots(1,3,figsize=(14.5,4.8),layout='constrained')
dt=[r['dt'] for r in a['rows']]
axes[0].plot(dt,[r['oldPressureTimeErrorPa'] for r in a['rows']],'o-',color='#bb5946',label='C1 backward Euler')
axes[0].plot(dt,[r['newPressureTimeErrorPa'] for r in a['rows']],'o-',color='#227d92',label='C2 exact linear step')
axes[0].set(yscale='log',xlabel='Time step (s)',ylabel='3-day pressure RMS time error (Pa)',title='Fixed linear pressure time error')
axes[0].invert_xaxis();axes[0].legend(fontsize=8)
rows=[r for r in a['sphereTransport']['rows'] if r['axis']=='tilted']
old=json.loads((root/'build/earth-conservative-transport/candidate-c1-tilted.json').read_text())
old=[r for r in old['rows'] if r['rings']<=48]
axes[1].plot([r['rings'] for r in old],[r['relativeL2'] for r in old],'o-',color='#bb5946',label='C1 upwind (archived)')
axes[1].plot([r['rings'] for r in rows],[r['relativeL2'] for r in rows],'o-',color='#227d92',label='C2 flux correction')
axes[1].set(xlabel='Gaussian rings',ylabel='Relative L2 error after one rotation',title='Polar-crossing tracer rotation')
axes[1].legend(fontsize=8)
rows=[r for r in a['spatialPressure']['rows'] if r['field']=='tilted-l1']
axes[2].plot([r['rings'] for r in rows],[r['strongOperatorRelativeError'] for r in rows],'o-',color='#bb5946')
axes[2].set(xlabel='Gaussian rings',ylabel='Strong spatial operator relative error',title='Still open: polar pressure accuracy')
for ax in axes:ax.grid(alpha=.18);ax.spines[['top','right']].set_visible(False)
fig.suptitle('C2: time and tracer accuracy improved; full atmospheric coupling remains open',fontsize=13)
fig.savefig(out/'c2-summary.png',dpi=160)
print(out/'c2-summary.png')
