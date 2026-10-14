import sys, json, pathlib
sys.path.insert(0, str(pathlib.Path('build/earth-seaice-p1/plot-libs').resolve()))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

folder = pathlib.Path('docs/evidence/earth-speedy-transport-20261013')
data = json.loads((folder / 'sensitivity-comparison.json').read_text(encoding='utf8'))
fields = json.loads((folder / 'candidate-fields.json').read_text(encoding='utf8'))
cases = {c['prefix']: c for c in data['cases']}
field_cases = {c['prefix']: c for c in fields['cases']}
styles = {
    'baseline-sensitivity-v2': ('Frozen baseline', '#888d94'),
    'clouds-precip-sensitivity': ('Cloud precipitation term', '#8d72b3'),
    'clouds-full-sensitivity-v2': ('Full cloud correction', '#c78936'),
    'parcel-sensitivity': ('Parcel correction', '#367ac4'),
    'combined-sensitivity': ('Parcel + cloud correction', '#138d80'),
    'parcel-seasonal': ('Parcel correction', '#367ac4'),
    'combined-seasonal': ('Parcel + cloud correction', '#138d80'),
    'evaporation-sensitivity': ('Combined + evaporation', '#a749a4'),
    'implicit-sensitivity': ('Combined + thermal transport', '#b07442'),
    'all-corrections-sensitivity': ('All corrections', '#d84954'),
    'all-corrections-seasonal': ('All corrections', '#d84954'),
    'longwave-sensitivity': ('Combined + graybody reflection', '#535db3'),
    'split-reference-sensitivity': ('All fixes + split SI reference', '#d64e55'),
    'split-reference-seasonal': ('All fixes + split SI reference', '#d64e55'),
    'thermal-split-reference-sensitivity': ('Combined + stable thermal transport', '#b07442'),
}
months = np.arange(1, 13)
def region(c, name):
    return next(r for r in c['regions'] if r['name'] == name)
def save(fig, name):
    for ext in ('png', 'svg'):
        fig.savefig(folder / f'{name}.{ext}', dpi=170)
    plt.close(fig)
def prettify(ax):
    ax.grid(alpha=.18)
    ax.spines[['top','right']].set_visible(False)

short = [k for k in ('baseline-sensitivity-v2','clouds-precip-sensitivity','clouds-full-sensitivity-v2','parcel-sensitivity','combined-sensitivity') if k in cases]
fig, axs = plt.subplots(1, 2, figsize=(12, 4.6), layout='constrained')
for ax, name in zip(axs, ('India', 'Australia north')):
    obs = region(cases[short[0]], name)['observedMonthlyMm']
    ax.plot(months, obs, 'k--', lw=2.1, label='GPCC 1991–2020')
    for key in short:
        label, color = styles[key]
        ax.plot(months, region(cases[key], name)['monthlyMm'], color=color, lw=1.8, label=label)
    ax.set(title=name, ylabel='Precipitation (mm / month)', xlabel='Calendar month', xticks=months)
    prettify(ax)
axs[0].legend(fontsize=8)
fig.suptitle('One-year response from the same frozen 2006 state\nSensitivity experiment; not a new equilibrated climate', fontsize=13)
save(fig, 'sensitivity-rain')

v2 = [k for k in ('baseline-sensitivity-v2','combined-sensitivity','evaporation-sensitivity','implicit-sensitivity','longwave-sensitivity','all-corrections-sensitivity') if k in cases]
if len(v2) > 2:
    fig, axs = plt.subplots(1, 2, figsize=(12, 4.8), layout='constrained')
    for ax, name in zip(axs, ('India', 'Australia north')):
        ax.plot(months,region(cases[v2[0]],name)['observedMonthlyMm'],'k--',lw=2.1,label='GPCC 1991–2020')
        for key in v2:
            label,color=styles[key]
            ax.plot(months,region(cases[key],name)['monthlyMm'],color=color,lw=1.8,label=label)
        ax.set(title=name,ylabel='Precipitation (mm / month)',xlabel='Calendar month',xticks=months)
        prettify(ax)
    axs[0].legend(fontsize=8)
    fig.suptitle('Second batch: one-year response from the same frozen 2006 state\nIndividual fixes build on the parcel + cloud correction',fontsize=13)
    save(fig,'sensitivity-v2-rain')

if 'split-reference-sensitivity' in cases:
    fig, axs = plt.subplots(1, 2, figsize=(12, 4.8), layout='constrained')
    for ax, name in zip(axs, ('India', 'Australia north')):
        ax.plot(months, region(cases['baseline-sensitivity-v2'], name)['observedMonthlyMm'], 'k--', lw=2.1, label='GPCC 1991–2020')
        for key in [k for k in ('baseline-sensitivity-v2', 'combined-sensitivity', 'thermal-split-reference-sensitivity', 'split-reference-sensitivity') if k in cases]:
            label, color = styles[key]
            ax.plot(months, region(cases[key], name)['monthlyMm'], color=color, lw=2, label=label)
        ax.set(title=name, ylabel='Precipitation (mm / month)', xlabel='Calendar month', xticks=months)
        prettify(ax)
    axs[0].legend(fontsize=8)
    fig.suptitle('Third batch: one-year response from the same frozen 2006 state\nThermal and all-fix candidates use a separate solver reference; auxiliary row retained', fontsize=13)
    save(fig, 'sensitivity-v3-rain')

long = ['baseline-sensitivity-v2'] + [k for k in ('parcel-seasonal','combined-seasonal','all-corrections-seasonal','split-reference-seasonal') if k in cases]
if len(long) > 1:
    fig, axs = plt.subplots(2, 2, figsize=(12, 8), layout='constrained')
    for col, name in enumerate(('India', 'Australia north')):
        axs[0,col].plot(months, region(cases[long[0]],name)['observedMonthlyMm'], 'k--', lw=2.1, label='GPCC 1991–2020')
        for key in long:
            label, color = styles[key]
            axs[0,col].plot(months,region(cases[key],name)['monthlyMm'],color=color,lw=2,label=label)
            r = region(field_cases[key],name)
            axs[1,col].plot(months,[m['layers']['temperatureK'][-1]-273.15 for m in r['monthly']],color=color,lw=2)
        axs[0,col].set(title=name+' — precipitation',ylabel='mm / month',xticks=months)
        axs[1,col].set(title=name+' — lowest atmospheric layer',ylabel='°C at sigma=0.9375 (not 2 m)',xlabel='Calendar month',xticks=months)
    for ax in axs.flat: prettify(ax)
    axs[0,0].legend(fontsize=9)
    fig.suptitle('Continuous 2001–2007 integrations · 2006 statistics\nIdentical initial atmosphere and land; fixed regional observation support',fontsize=13)
    save(fig,'six-year-monsoon')
    names=[r['name'] for r in cases[long[0]]['regions']]
    fig,axs=plt.subplots(1,2,figsize=(13,5.8),layout='constrained')
    y=np.arange(len(names))
    for i,key in enumerate(long):
        label,color=styles[key];c=cases[key]
        h=.8/len(long)
        axs[0].barh(y+(i-(len(long)-1)/2)*h,[r['monthlyMAEMm'] for r in c['regions']],height=h*.96,color=color,label=label)
        axs[1].bar(i,c['budget']['airWaterExcludingModeResidualMm'],width=.55,color=color)
        axs[1].vlines(i,-c['waterLimitMm'],c['waterLimitMm'],color='#333',lw=2)
    axs[0].set(yticks=y,yticklabels=names,xlabel='Monthly precipitation MAE (mm)',title='All 11 fixed regions')
    axs[0].legend(fontsize=8)
    tick_names={'baseline-sensitivity-v2':'Baseline','parcel-seasonal':'Parcel','combined-seasonal':'Combined','all-corrections-seasonal':'All fixes','split-reference-seasonal':'Split SI'}
    axs[1].set(xticks=np.arange(len(long)),xticklabels=[tick_names[k] for k in long],ylabel='Residual water (mm)',title='2006 water budget\nBlack intervals: unchanged tolerance')
    axs[1].axhline(0,color='#333',lw=.8)
    for ax in axs:prettify(ax)
    save(fig,'six-year-regions-budgets')

replay=json.loads((folder/'replay-summary.json').read_text(encoding='utf8'))
india=next(r for r in replay['records'] if r['name']=='India')['seasons']['JJA']
sig=np.array(replay['sigma'])
fig,axs=plt.subplots(1,2,figsize=(12,5.3),layout='constrained')
for key,label,color in [('convectionTemperatureKDay','Convection','#367ac4'),('radiationTemperatureKDay','Radiation','#c78936'),('surface_heat_fluxTemperatureKDay','Surface heat','#138d80'),('vertical_diffusionTemperatureKDay','Vertical mixing','#8d72b3')]:
    axs[0].plot(india['processes'][key],sig,'o-',label=label,color=color)
for key,label,color in [('convectionWaterMmDay','Convection','#367ac4'),('surface_humidity_fluxWaterMmDay','Surface evaporation','#138d80'),('vertical_diffusionWaterMmDay','Vertical mixing','#8d72b3')]:
    axs[1].plot(india['processes'][key],sig,'o-',label=label,color=color)
for ax in axs:
    ax.invert_yaxis();ax.axvline(0,color='#555',lw=.7);ax.set_ylabel('Sigma (top → bottom)');prettify(ax);ax.legend(fontsize=9)
axs[0].set(title='Temperature tendency',xlabel='K / day')
axs[1].set(title='Layer water tendency',xlabel='mm / day per layer')
fig.suptitle('Frozen baseline: India, June–August\nEvery native process sampled each step; replay matches the original trajectory exactly',fontsize=13)
save(fig,'india-process-budgets')

audit=json.loads(pathlib.Path('build/earth-speedy-transport/audit-combined.json').read_text(encoding='utf8'))
fig,axs=plt.subplots(1,2,figsize=(12,4.6),layout='constrained')
for ax,c in zip(axs,audit):
    rows=c['steps'];hours=np.cumsum([r['dt'] for r in rows])/3600
    ax.plot(hours,[r['rectangularResidual'] for r in rows],label='Clock-rectangle residual',color='#888d94')
    ax.plot(hours,[r['discreteFluxResidual'] for r in rows],label='Leapfrog/RAW flux residual',color='#367ac4')
    ax.axhspan(-.05,.05,color='#138d80',alpha=.1,label='Original ±0.05 mm threshold')
    ax.set(xlim=(0,12),xlabel='Hours from initialization',ylabel='Water residual (mm)',title=c['mode']+' — first 12 hours')
    prettify(ax)
axs[0].legend(fontsize=8)
fig.suptitle('Combined candidate: startup accounting\nTime-consistent diagnostics still expose a numerical residual; no water was adjusted',fontsize=13)
save(fig,'startup-candidate')
v2audit=pathlib.Path('build/earth-speedy-transport/audit-all-corrections.json')
if v2audit.exists():
    fig,axs=plt.subplots(1,2,figsize=(12,4.6),layout='constrained')
    for ax,c in zip(axs,json.loads(v2audit.read_text(encoding='utf8'))):
        rows=c['steps'];hours=np.cumsum([r['dt'] for r in rows])/3600
        ax.plot(hours,[r['rectangularResidual'] for r in rows],label='Clock-rectangle residual',color='#888d94')
        ax.plot(hours,[r['discreteFluxResidual'] for r in rows],label='Leapfrog/RAW flux residual',color='#d84954')
        ax.axhspan(-.05,.05,color='#138d80',alpha=.1,label='Original ±0.05 mm threshold')
        ax.set(xlim=(0,12),xlabel='Hours from initialization',ylabel='Water residual (mm)',title=c['mode']+' — first 12 hours')
        prettify(ax)
    axs[0].legend(fontsize=8)
    fig.suptitle('All corrections: startup accounting\nPhysical column budgets close; the full numerical integration still has a residual',fontsize=13)
    save(fig,'startup-v2-candidate')
v3audit=pathlib.Path('build/earth-speedy-transport/audit-all-corrections-split-reference.json')
if v3audit.exists():
    fig,axs=plt.subplots(1,2,figsize=(12,4.6),layout='constrained')
    for ax,c in zip(axs,json.loads(v3audit.read_text(encoding='utf8'))):
        rows=c['steps'];hours=np.cumsum([r['dt'] for r in rows])/3600
        ax.plot(hours,[r['rectangularResidual'] for r in rows],label='Clock-rectangle residual',color='#888d94')
        ax.plot(hours,[r['discreteFluxResidual'] for r in rows],label='Leapfrog/RAW flux residual',color='#d64e55')
        ax.axhspan(-.05,.05,color='#138d80',alpha=.1,label='Original ±0.05 mm threshold')
        ax.set(xlim=(0,12),xlabel='Hours from initialization',ylabel='Water residual (mm)',title=c['mode']+' — first 12 hours')
        prettify(ax)
    axs[0].legend(fontsize=8)
    fig.suptitle('Split semi-implicit reference: startup accounting\nSame original initial state and 30-minute time step; no water adjustment',fontsize=13)
    save(fig,'startup-v3-candidate')
print('Saved precipitation, process, and budget figures.')

convergence=pathlib.Path('build/earth-speedy-transport/timestep-convergence-summary.json')
if convergence.exists():
    fig,axs=plt.subplots(1,2,figsize=(12,4.8),layout='constrained')
    for dt,color in ((1800,'#d84954'),(900,'#b07442'),(450,'#138d80')):
        rows=json.loads(pathlib.Path(f'build/earth-speedy-transport/timestep-convergence-{dt}s.json').read_text(encoding='utf8'))['steps']
        hours=[r['elapsedSeconds']/3600 for r in rows]
        for ax in axs:ax.plot(hours,[r['discreteFluxResidual'] for r in rows],label=f'{dt/60:g} min',color=color,lw=1.7)
    for ax in axs:
        ax.axhspan(-.05,.05,color='#138d80',alpha=.08,label='Original ±0.05 mm threshold')
        ax.set(xlabel='Hours from initialization',ylabel='Discrete water residual (mm)')
        prettify(ax)
    axs[0].set(xlim=(0,12),title='Startup peak decreases')
    axs[1].set(xlim=(0,72),title='Final residual does not converge to zero')
    axs[0].legend(fontsize=8)
    fig.suptitle('Same 2001 state, three native time steps\nDiagnostic experiment; no water adjustment and no change to the 30-minute climate protocol',fontsize=13)
    save(fig,'timestep-convergence')
