"""Analyze preserved actual integrations; this script does not run the model."""
import json, sys, hashlib, math
from pathlib import Path
ROOT=Path(__file__).resolve().parent
def read(name):
    return json.loads((ROOT/name).read_text(encoding='utf-8'))
def seasons(p):
    if isinstance(p,dict):p=[p[str(k)] for k in range(12)]
    return {'JJA':sum(p[5:8]),'DJF':sum(p[k] for k in [11,0,1])}
def metrics(run):
    end=run['records'][-1]; regions=end['regions']; d={r['name']:r for r in regions}
    P=lambda name:d[name]['modelCumulativeMm']
    J=lambda name:seasons(d[name]['modelMonthlyMm'])['JJA']
    D=lambda name:seasons(d[name]['modelMonthlyMm'])['DJF']
    def wind_seasons(region):
        wind=region.get('monthlyWindMps');time=end.get('calendarCoverageS')
        if not wind or not time:return None
        return {season:{axis:sum(wind[axis][k]*time[k] for k in months)/sum(time[k] for k in months)
            for axis in ['east','north']} for season,months in [('JJA',[5,6,7]),('DJF',[11,0,1])]}
    worst={key:max(abs(r['budget'][key]) for r in run['records']) for key in ['waterResidualMm','enthalpyResidualJm2','maxCellVaporResidualMm','globalNetVaporTransportMm']}
    return {'day':end['day'],'dt':run['dt'],'restoresExactly':run.get('strictRestoreNextStepExact',False),'budget':end['budget'],'worstRecordedBudget':worst,'coastalGt':end.get('coastalGt'),
      'checks':{'India_net_vapor_import':d['India']['wholeArea']['netTransport']>0,
        'India_JJA_wetter_than_DJF':J('India')>D('India'),
        'Foreland_wetter_than_Tibet':P('Himalaya foreland')>P('Tibet'),
        'Australia_interior_drier_than_east':P('Australia interior')<P('Australia east'),
        'Australia_interior_drier_than_north':P('Australia interior')<P('Australia north'),
        'Australia_north_DJF_wetter_than_JJA':D('Australia north')>J('Australia north'),
        'Australia_southwest_JJA_wetter_than_DJF':J('Australia southwest')>D('Australia southwest')},
      'regions':[{'name':r['name'],'annualMm':r['modelCumulativeMm'],'GPCCannualMm':r['observedAnnualMm'],
         'biasMm':r['modelCumulativeMm']-r['observedAnnualMm'],'biasPercent':100*(r['modelCumulativeMm']/r['observedAnnualMm']-1),
         'seasons':seasons(r['modelMonthlyMm']),'GPCCseasons':seasons(r['observedMonthlyMm']),
         'netVaporTransportMm':r['wholeArea']['netTransport'],'vaporResidualMm':r['wholeArea']['residual'],
         'componentsMm':r.get('precipitationComponentsMm'),'monthlyWindMps':r.get('monthlyWindMps'),'seasonalWindMps':wind_seasons(r)}
         for r in regions]}

def convergence(runs):
    candidates={r['dt']:r for name,r in runs.items() if not name.startswith('baseline')}
    if not all(dt in candidates for dt in [1800,900,450]):return None
    coarse,medium,fine=[candidates[dt] for dt in [1800,900,450]]
    rows=[]
    for a,b,c in zip(coarse['regions'],medium['regions'],fine['regions']):
        d1=b['annualMm']-a['annualMm'];d2=c['annualMm']-b['annualMm']
        rows.append({'name':a['name'],'annual1800Mm':a['annualMm'],'annual900Mm':b['annualMm'],'annual450Mm':c['annualMm'],
            'delta900Minus1800Mm':d1,'delta450Minus900Mm':d2,
            'relative450Vs900Percent':100*abs(d2)/max(1,abs(c['annualMm'])),
            'differenceAsGPCCPercent':100*abs(d2)/c['GPCCannualMm'],
            'differenceReductionRatio':abs(d1/d2) if d2 else None,
            'observedAnnualDifferenceOrder':math.log2(abs(d1/d2)) if d1 and d2 else None,
            'netTransport1800Mm':a['netVaporTransportMm'],'netTransport900Mm':b['netVaporTransportMm'],'netTransport450Mm':c['netVaporTransportMm'],
            'seasons1800':a['seasons'],'seasons900':b['seasons'],'seasons450':c['seasons']})
    return {'regions':rows,'maxAnnual450Vs900Mm':max(abs(r['delta450Minus900Mm']) for r in rows),
        'maxRelativeAnnual450Vs900Percent':max(r['relative450Vs900Percent'] for r in rows),
        'allDirectionalChecksStable':coarse['checks']==medium['checks']==fine['checks'],
        'note':'These are measured finite-step differences, not a proof of convergence order of nonlinear coupled dynamics or climate realism.'}

def tropical_changes(runs):
    baseline=next((r for name,r in runs.items() if name.startswith('baseline')),None)
    if not baseline:return None
    old={r['name']:r for r in baseline['regions']}
    return {name:[{'name':r['name'],'absoluteBiasChangeMm':abs(r['biasMm'])-abs(old[r['name']]['biasMm']),
       'absoluteBiasChangeAsGPCCPercent':100*(abs(r['biasMm'])-abs(old[r['name']]['biasMm']))/r['GPCCannualMm']}
       for r in run['regions'] if r['name'] in ['Amazon','Congo']]
       for name,run in runs.items() if not name.startswith('baseline')}
names=sys.argv[1:] or ['baseline-1800','coastal-deposition-v2-1800']
results={name:metrics(read(name+'-continuous.json')) for name in names}
for name,run in results.items():
    print(name,'day',run['day'],'restore',run['restoresExactly'],run['checks'])
    for r in run['regions']:print(r['name'],round(r['annualMm'],1),'GPCC',round(r['GPCCannualMm'],1),'netT',round(r['netVaporTransportMm'],1),r['seasons'])
if all(run['day']==365 and run['restoresExactly'] for run in results.values()):
    files=[ROOT/(name+'-continuous.json') for name in names]+[ROOT/'gpcc-grid.json']
    summary={'runs':results,'convergence':convergence(results),'tropicalAbsoluteErrorChanges':tropical_changes(results),
       'allDirectionalRegionalChecksPass':all(all(r['checks'].values()) for name,r in results.items() if not name.startswith('baseline')),
       'sources':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in files}}
    (ROOT/'comparison.json').write_text(json.dumps(summary,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    if summary['convergence']:print('Convergence:',{k:v for k,v in summary['convergence'].items() if k!='regions'})
