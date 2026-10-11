import json
from pathlib import Path

folder=Path(__file__).parent
a=json.loads((folder/'model-audit.json').read_text('utf8'))
for r in a['reusedCheckpoints']:
    print(Path(r['path']).name, 'day',r['actualDay'],'hemisphere marine extent million km2',*[round(r['polar'][h]['marineExtentKm2']/1e6,3) for h in ['north','south']])
print('point names',[v['name'] for v in a['formal']['points']])
for r in [a['formal']]+[v for v in a['reusedCheckpoints'] if v['mode']=='classic' and v['actualDay'] in [180,365]]:
    print('classic day',r['actualDay'])
    for v in r['points']:
        i=v['instant']
        print(v['name'],json.dumps({k:round(i[k],3) if isinstance(i[k],(float,int)) else i[k] for k in ['localAirC','visibleSurfaceC','precipitationMmDay','soilMm','biome','localLandIceM']},ensure_ascii=False))
b=json.loads((folder/'browser-audit.json').read_text('utf8'))
print('browser timing record keys',[(r.get('label'),list(r.keys())) for r in b if 'frame' in str(r).lower() and 'screenshot' not in r][:18])
