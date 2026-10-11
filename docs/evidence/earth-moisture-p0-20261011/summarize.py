"""Deterministic comparison of preserved actual integrations, not a simulation."""
import json, hashlib, math
from pathlib import Path
ROOT=Path(__file__).resolve().parent
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
before=read(ROOT/'before-1800-continuous.json')
runs=[read(ROOT/f'continuous-front-{dt}-continuous.json') for dt in [1800,900,450]]
end=lambda r:r['records'][-1]
for r in [before,*runs]:
    for record in r['records']:
        for region in record['regions']:
            if isinstance(region['observedMonthlyMm'],dict):region['observedMonthlyMm']=[region['observedMonthlyMm'][str(k)] for k in range(12)]
assert all(end(r)['day']==365 and r['strictRestoreNextStepExact'] for r in [before,*runs])
def seasons(r):
    p=r['modelMonthlyMm']
    return {'DJF':sum(p[k] for k in [11,0,1]),'JJA':sum(p[5:8])}
def passes(r):
    d={x['name']:x for x in end(r)['regions']}
    return {
      'India_JJA_wetter_than_DJF':seasons(d['India'])['JJA']>seasons(d['India'])['DJF'],
      'India_net_vapor_import':d['India']['wholeArea']['netTransport']>0,
      'Foreland_wetter_than_Tibet':d['Himalaya foreland']['modelCumulativeMm']>d['Tibet']['modelCumulativeMm'],
      'Australia_interior_drier_than_east':d['Australia interior']['modelCumulativeMm']<d['Australia east']['modelCumulativeMm'],
      'Australia_interior_drier_than_north':d['Australia interior']['modelCumulativeMm']<d['Australia north']['modelCumulativeMm'],
      'Australia_north_DJF_wetter_than_JJA':seasons(d['Australia north'])['DJF']>seasons(d['Australia north'])['JJA'],
      'Australia_southwest_JJA_wetter_than_DJF':seasons(d['Australia southwest'])['JJA']>seasons(d['Australia southwest'])['DJF'],
    }
regions=[]
for i,b in enumerate(end(before)['regions']):
    values=[end(r)['regions'][i] for r in runs]
    regions.append({'name':b['name'],'bounds':b['bounds'],'validLandAreaKm2':b['validLandAreaKm2'],
      'observedAnnualMm':b['observedAnnualMm'],'before1800P':b['modelCumulativeMm'],
      'afterP':{str(r['dt']):v['modelCumulativeMm'] for r,v in zip(runs,values)},
      'afterE':{str(r['dt']):v['wholeArea']['E'] for r,v in zip(runs,values)},
      'afterNetVaporTransport':{str(r['dt']):v['wholeArea']['netTransport'] for r,v in zip(runs,values)},
      'afterVaporStorageDelta':{str(r['dt']):v['wholeArea']['storageDelta'] for r,v in zip(runs,values)},
      'wholeAreaVaporResidual':{str(r['dt']):v['wholeArea']['residual'] for r,v in zip(runs,values)},
      'P900minus1800':values[1]['modelCumulativeMm']-values[0]['modelCumulativeMm'],
      'P450minus900':values[2]['modelCumulativeMm']-values[1]['modelCumulativeMm'],
      'relativeP450vs900':abs(values[2]['modelCumulativeMm']-values[1]['modelCumulativeMm'])/max(values[2]['modelCumulativeMm'],1),
      'beforeSeasons':seasons(b),'afterSeasons':seasons(values[0]),
      'observationSeasons':{'DJF':sum(b['observedMonthlyMm'][k] for k in [11,0,1]),'JJA':sum(b['observedMonthlyMm'][5:8])}})
result={'status':'PARTIAL — numerical repair passes; regional supply acceptance fails',
 'periodDays':365,
 'calendar':'Earth phase zero March20. Gregorian month lengths scaled to the orbital year. Period is 365 actual Earth days, about 0.25 day short of an orbit; no annual-total extrapolation.',
 'budgets':{str(r['dt']):end(r)['budget'] for r in runs},
 'acceptance':{'before1800':passes(before),**{str(r['dt']):passes(r) for r in runs}},
 'regions':regions,
 'sources':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'before-1800-continuous.json',*[ROOT/f'continuous-front-{d}-continuous.json' for d in [1800,900,450]],ROOT/'gpcc-grid.json']}}
(ROOT/'comparison.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print(json.dumps({'acceptance':result['acceptance'],'maxRelativeP450vs900':max(x['relativeP450vs900'] for x in regions)},ensure_ascii=False))
