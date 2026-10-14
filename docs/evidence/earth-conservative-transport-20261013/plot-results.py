from pathlib import Path
import sys, json
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'build/earth-seaice-p1/plot-libs'))
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
OUT=ROOT/'build/earth-conservative-transport'
load=lambda name:json.loads((OUT/(name+'.json')).read_text())
native=load('candidate-c1-native-1800')
wave=load('candidate-c1-mimetic')['rows']
tilt=load('candidate-c1-tilted')['rows']
bench=load('candidate-c1-benchmark')
plt.rcParams.update({'font.size':10,'axes.spines.top':False,'axes.spines.right':False})
fig,ax=plt.subplots(2,2,figsize=(12,8),layout='constrained')
for kind,color in [('real','#007c91'),('constant','#9470b3'),('sharp','#e58a2b')]:
    rows=[v for v in native['rows'] if v['case']==kind]
    ax[0,0].plot([v['time']/86400 for v in rows],[v['waterDriftMm'] for v in rows],'.-',label=kind,color=color)
ax[0,0].set(title='Three-day source-free water budget',xlabel='Elapsed days',ylabel='Inventory drift (mm)')
ax[0,0].legend();ax[0,0].ticklabel_format(axis='y',style='sci',scilimits=(0,0))
ax[0,1].loglog([v['rings'] for v in wave],[v['maxError'] for v in wave],'o-',color='#007c91')
ax[0,1].set(title='Complete spherical acoustic solution',xlabel='Gaussian latitude rings',ylabel='Relative pressure error vs analytic BE wave')
ax[0,1].annotate('Native grid',xy=(48,wave[2]['maxError']),xytext=(30,.004),arrowprops={'arrowstyle':'->'})
ax[1,0].plot([v['steps'] for v in bench['waves']],[v['amplitude'] for v in bench['waves']],'o-',color='#b45747')
ax[1,0].axhline(1,color='#777777',ls='--',label='Undamped exact wave')
ax[1,0].set(title='Backward Euler is dissipative',xlabel='Time steps per wave period',ylabel='Amplitude remaining after one period',ylim=(0.45,1.03))
ax[1,0].legend()
ax[1,1].loglog([v['rings'] for v in tilt],[v['relativeL2'] for v in tilt],'o-',color='#9470b3')
ax[1,1].set(title='Tilted rigid rotation: bounded, still diffuse',xlabel='Gaussian latitude rings',ylabel='Relative tracer error after one rotation')
fig.suptitle('Conservative pressure / water prototype — limited subsystem evidence',fontsize=15)
fig.savefig(OUT/'candidate-c1-summary.png',dpi=170)
plt.close(fig)
print(OUT/'candidate-c1-summary.png')
