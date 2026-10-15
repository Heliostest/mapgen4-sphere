"""Derive review metrics from the saved full-terrain runs, without fitting."""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROFILES = ['control', 'transport-only', 'radiation-only', 'shared-core', 'buoyancy-old', 'buoyancy', 'balanced', 'boundary']
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
tables = ['# 全部分区与对照结果', '', '由 summarize.py 从八份全年结果生成；月误差是 12 个月总量的平均绝对误差。所有方案均为第一年瞬变。', '',
          '## 区域支持', '', '| 区域 | 南/北纬边界（°） | 西/东经边界（°） | 有效模型格数 | GPCC 年降水（mm） | GPCC 雨峰月 |',
          '| --- | --- | --- | ---: | ---: | ---: |']
for r in regions:
    b = r['bounds']
    tables.append(f"| {r['name']} | {b['south']} / {b['north']} | {b['west']} / {b['east']} | {r['modelCells']} | {r['observed']['annualMm']:.1f} | {r['observed']['peakMonth']} |")
for key in PROFILES:
    tables += ['', f'## {key}', '', '| 区域 | 年降水（mm） | 年偏差（%） | 雨峰月 | 月 MAE（mm） | 夏季 JJA 占比（%） |',
               '| --- | ---: | ---: | ---: | ---: | ---: |']
    for r in regions:
        v = r['profiles'][key]
        jja = f"{v['jjaPercent']:.1f}" if v['jjaPercent'] is not None else '—'
        tables.append(f"| {r['name']} | {v['annualMm']:.1f} | {v['annualBiasPercent']:+.1f} | {v['peakMonth'] or '—'} | {v['monthlyMaeMm']:.1f} | {jja} |")
(ROOT/'METRICS.md').write_text('\n'.join(tables)+'\n', encoding='utf-8')
for r in regions:
    print(r['name'], 'cells',r['modelCells'], 'observed',r['observed'])
    for key,vals in r['profiles'].items(): print(' ',key,vals)
print('CHECKS', checks)
