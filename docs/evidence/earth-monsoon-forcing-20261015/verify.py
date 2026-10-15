"""Fail on inconsistent provenance, water/heat ledgers or rainfall supports."""
import gzip,hashlib,json,math,sys
from pathlib import Path
ROOT=Path(__file__).parent;REPO=ROOT.parents[2]
sha=lambda b:hashlib.sha256(b).hexdigest()
labels=['native','wind10','thermal','both10','windColumn','bothColumn']
runs={k:json.loads((ROOT/f'{k}.json').read_text()) for k in labels}
formal=sha((REPO/'scenes/earth-land-sea/earth-simulation.json').read_bytes())
assert formal=='afb80a8ab730785eed0cb709a66d938ad20a9690b04ecfa1246d1deb393adca6'
bundle=sha(gzip.decompress((ROOT/'audit.mjs.gz').read_bytes()))
forcing=gzip.decompress((ROOT/'forcing.json.gz').read_bytes());forcing_hash=sha(forcing)
assert json.loads(forcing)['inputManifestSha256']==sha((ROOT/'inputs.json').read_bytes())
gpcc_hash=sha((REPO/'docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json').read_bytes())
assert len({r['initialInventoriesSha'] for r in runs.values()})==1
assert len({r['initialStockSha'] for r in runs.values()})==1
previous=json.loads((REPO/'docs/evidence/earth-east-asia-mechanisms-20261015/shared-core.json').read_text())
assert runs['native']['initialInventoriesSha']==previous['initialInventoriesSha']
for label,d in runs.items():
    assert d['label']==label and d['bundleSha256']==bundle and d['forcingSha256']==forcing_hash
    assert d['formalSha256']==formal and d['observationSha256']==gpcc_hash
    assert d['dt']==1800 and d['grid']=={'width':48,'height':24} and d['meshTriangles']==215348
    assert not d['strictContinuation'] and len(d['records'])==5
    assert d['maxVaporResidualMm']<1e-7
    for r in d['records']:
        b=r['budget'];assert abs(b['waterMm'])<5e-6 and abs(b['heatJm2'])<.005 and abs(b['routingM3'])<1
        if not d['intervention']['forceThermal']:assert b['externalJm2']==b['externalAbsJm2']==0
    grid=json.loads(gzip.decompress((ROOT/f'{label}-grid.json.gz').read_bytes()))
    assert math.isclose(sum(grid['coverageSeconds']),d['yearS'],abs_tol=1e-6)
    for i,(r,prior) in enumerate(zip(d['gpcc'],previous['gpcc'])):
        for key in ['name','bounds','modelCells','observedMonthlyMm']:assert r[key]==prior[key]
        assert math.isclose(r['modelAnnualMm'],sum(r['monthlyMm']),abs_tol=1e-7)
        weight=grid['support'][i];denom=sum(weight)
        for month in range(12):
            assert abs(sum(a[month] for a in r['componentsMonthlyMm'].values())-r['monthlyMm'][month])<1e-7
            assert abs(sum(w*v for w,v in zip(weight,grid['rainMonthlyMm'][month]))/denom-r['monthlyMm'][month])<1e-9
        if label=='native':
            assert r['monthlyMm']==prior['monthlyMm'],'Unforced harness must reproduce the previously frozen baseline exactly'
            for key,values in prior['diagnostics'].items():assert r['diagnostics'][key]==values
manifest={'baselineCommit':'6bbbad414f5602cf532e41adbcc6a46a5286b9b3','formalSha256':formal,
          'bundleSha256':bundle,'forcingSha256':forcing_hash,'initialInventoriesSha':runs['native']['initialInventoriesSha'],
          'nativeMatchesPreviousExactly':True,'labels':labels,
          'files':{p.name:sha(p.read_bytes()) for p in sorted(ROOT.iterdir()) if p.is_file() and p.name!='manifest.json'}}
target=ROOT/'manifest.json'
if target.exists():assert json.loads(target.read_text())==manifest,'Evidence changed after sealing'
elif '--check-only' not in sys.argv:target.write_text(json.dumps(manifest,indent=2)+'\n')
print('PASS: six runs, source/forcing/bundle provenance, identical initial stocks, exact native reproduction, rainfall support/components, closed water, external heat ledger.')
