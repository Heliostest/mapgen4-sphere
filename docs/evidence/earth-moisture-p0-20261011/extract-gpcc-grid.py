"""Export pinned GPCC monthly normals; reuse read-only CDF-1 decoder header."""
from pathlib import Path
import json
import hashlib
old = Path('docs/evidence/earth-moisture-climate-20261010/extract-gpcc.py')
scope = {'__file__': str(old.resolve())}
exec(old.read_text(encoding='utf-8').split('probes = [')[0], scope)
source = scope['SOURCE'].read_bytes()
assert hashlib.sha256(source).hexdigest() == '6e08db25ba4eebb0affe9e2519907aa66e24f8e0177d25c3084a7e2085ef0d0b'
values, lat, lon = scope['values'], scope['lat'], scope['lon']
precip = [values('precip', m) for m in range(12)]
cells = []
for j, latitude in enumerate(lat):
    for x, longitude in enumerate(lon):
        monthly = [p[j*len(lon)+x] for p in precip]
        if any(v < 0 or v > 1e6 for v in monthly):
            continue
        lng = (longitude+180) % 360 - 180
        cells.append({'bounds': {'south': max(-90, latitude-1.25), 'north': min(90, latitude+1.25), 'west': lng-1.25, 'east': lng+1.25}, 'monthlyMm': monthly})
out = {'product': 'GPCC v2022 normals 1991–2020 2.5° mm/month', 'url': scope['URL'], 'sha256': hashlib.sha256(source).hexdigest(), 'cells': cells, 'variableAttributes': scope['variables']['precip']['attributes']}
Path('docs/evidence/earth-moisture-p0-20261011/gpcc-grid.json').write_text(json.dumps(out, separators=(',', ':'))+'\n', encoding='utf-8')
print('valid GPCC cells:', len(cells))
