import json,pathlib,hashlib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import NullFormatter
folder=pathlib.Path('docs/evidence/earth-pressure-waves-20261015');out=pathlib.Path('build/earth-pressure-waves')
selected=json.loads((folder/'selected-runs.json').read_text());paths=[out/(selected[k]+'.json') for k in ('waves','reference')]
waves,reference=[json.loads(p.read_text()) for p in paths]
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False})
fig,axes=plt.subplots(1,3,figsize=(13,4.3),layout='constrained');colors=['#126782','#ee6c4d']
for model,color,style in zip(('c9','c10'),colors,('o-','s--')):
    rr=[r for r in waves['rows'] if r['model']==model and r['nper']==256]
    axes[0].loglog([24,48,96],[max(r['maxPressureError'] for r in rr if r['rings']==n) for n in [24,48,96]],style,color=color,label=model.upper())
    r=next(r for r in rr if r['rings']==96 and r['degree']==5 and r['kind']=='traveling' and r['axis']==2)
    axes[1].plot([t['time']/r['period'] for t in r['trace']],[-t['phaseError'] for t in r['trace']],'-' if model=='c9' else '--',color=color,label=model.upper())
axes[0].set(title='Worst pressure error over two periods',xlabel='Latitude rings',ylabel='Relative RMS; 256 steps per period');axes[0].set_xticks([24,48,96],['24','48','96']);axes[0].legend(frameon=False)
axes[1].set(title='96-ring traveling degree5, axis2',xlabel='Analytic wave periods',ylabel='Accumulated phase lag (rad)');axes[1].legend(frameon=False)
for i,key in enumerate(('pressure','velocity')):
    rows=[r for r in reference['rows'] if r['model']=='c10' and r['variable']]
    y=[r['error'][key] for r in rows];axes[2].loglog([r['nper'] for r in rows],y,'o-',color=colors[i],label=key.capitalize())
    if i==0:axes[2].loglog([64,256],[y[0],y[0]/16],':',color='#666666',label='Second order')
axes[2].set(title='Time error against discrete modal oracle',xlabel='Steps per period',ylabel='Normalized endpoint error');axes[2].set_xticks([64,128,256],['64','128','256']);axes[2].legend(frameon=False)
for ax in axes:ax.grid(alpha=.2);ax.set_axisbelow(True);ax.xaxis.set_minor_formatter(NullFormatter())
fig.suptitle('C11 · Integrated pressure waves: accuracy, phase and time refinement',fontsize=14,fontweight='bold')
png=out/'pressure-waves.png';fig.savefig(png,dpi=170)
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
record={'passed':True,'sourceHashes':{str(folder/'plot.py').replace('\\','/'):digest(folder/'plot.py')},'inputHashes':{str(p).replace('\\','/'):digest(p) for p in paths+[folder/'selected-runs.json']},'outputHashes':{str(png).replace('\\','/'):digest(png)}}
(out/'plot-provenance.json').write_text(json.dumps(record,indent=2)+'\n')
