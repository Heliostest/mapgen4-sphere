"""Derive review metrics from the saved full-terrain runs, without fitting."""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROFILES = ['control', 'bulk', 'transport', 'transport-bulk']
runs = {key: json.loads((ROOT / f'{key}.json').read_text(encoding='utf-8')) for key in PROFILES}
assert len({d['formalSha256'] for d in runs.values()}) == 1
assert len({d['observationSha256'] for d in runs.values()}) == 1
assert all(d['strictContinuation'] and d['meshTriangles'] == 215348 for d in runs.values())

def metrics(months):
    annual = sum(months)
    peak = max(months)
    return dict(annualMm=annual, peakMonth=months.index(peak)+1 if peak > 0 else None,
                peakMm=peak, jjaMm=sum(months[5:8]),
                jjaPercent=100*sum(months[5:8])/annual if annual else None,
                maySepPercent=100*sum(months[4:9])/annual if annual else None)

regions = []
for i, ref in enumerate(runs['control']['gpcc']):
    obs = ref['observedMonthlyMm']
    row = dict(name=ref['name'], bounds=ref['bounds'], modelCells=ref['modelCells'], observed=metrics(obs), profiles={})
    for key, data in runs.items():
        r = data['gpcc'][i]
        assert r['observedMonthlyMm'] == obs
        assert math.isclose(sum(r['monthlyMm']),r['modelAnnualMm'],abs_tol=1e-7)
        vals = metrics(r['monthlyMm'])
        vals.update(annualBiasPercent=100*(vals['annualMm']/sum(obs)-1),
                    monthlyMaeMm=sum(abs(a-b) for a,b in zip(obs,r['monthlyMm']))/12,
                    annualComponentsMm={k:sum(v) for k,v in r['componentsMonthlyMm'].items()})
        row['profiles'][key] = vals
    regions.append(row)
checks = {key:{'sampledMaxAbsBudget':{field:max(abs(r['budget'][field]) for r in d['records'])
                                    for field in ['waterMm','heatJm2','routingM3']},
              'strictContinuation':d['strictContinuation']}
          for key,d in runs.items()}
(ROOT/'metrics.json').write_text(json.dumps(dict(regions=regions,checks=checks),indent=2)+'\n',encoding='utf-8')
for r in regions:
    print(r['name'], 'cells',r['modelCells'], 'observed',r['observed'])
    for key,vals in r['profiles'].items(): print(' ',key,vals)
print('CHECKS', checks)
