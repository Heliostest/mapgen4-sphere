"""Check archived-run provenance and consistency, then write its manifest."""
import gzip
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
PROFILES = json.loads((ROOT / 'profiles.json').read_text(encoding='utf-8'))
runs = {k: json.loads((ROOT / f'{k}.json').read_text(encoding='utf-8')) for k in PROFILES}
sha = lambda b: hashlib.sha256(b).hexdigest()
formal = REPO / 'scenes/earth-land-sea/earth-simulation.json'
observation = REPO / 'docs/evidence/earth-moisture-structural-20261011/gpcc-grid.json'
assert sha(formal.read_bytes()) == 'afb80a8ab730785eed0cb709a66d938ad20a9690b04ecfa1246d1deb393adca6'
bundles = {kind: sha(gzip.decompress((ROOT / f'bundles/{kind}.mjs.gz').read_bytes()))
           for kind in ['baseline', 'buoyancy']}
assert len(set(bundles.values())) == 2
assert PROFILES['buoyancy-old'] == PROFILES['buoyancy']
assert len({run['initialInventoriesSha'] for run in runs.values()}) == 1
# The shared solver serializes an extra land-precipitation diagnostic.
# Initial physical inventories are identical; whole-snapshot hashes differ.
assert len({run['initialStockSha'] for run in runs.values()}) == 2
for key, run in runs.items():
    assert run['label'] == key and run['parameters'] == PROFILES[key]
    assert run['formalSha256'] == sha(formal.read_bytes())
    assert run['observationSha256'] == sha(observation.read_bytes())
    assert run['bundleSha256'] == bundles['buoyancy' if key == 'buoyancy' else 'baseline']
    assert run['meshTriangles'] == 215348 and run['grid'] == {'width': 48, 'height': 24}
    assert run['dt'] == 1800 and run['strictContinuation']
    assert len(run['gpcc']) == 13 and len(run['records']) == 5
    for record in run['records']:
        assert abs(record['budget']['waterMm']) < 5e-6
        assert abs(record['budget']['heatJm2']) < .005
        assert abs(record['budget']['routingM3']) < 1
    for region, ref in zip(run['gpcc'], runs['control']['gpcc']):
        for field in ['name', 'bounds', 'modelCells', 'observedMonthlyMm']:
            assert region[field] == ref[field]
        assert math.isclose(sum(region['monthlyMm']), region['modelAnnualMm'], abs_tol=1e-7)
        for month in range(12):
            total = sum(part[month] for part in region['componentsMonthlyMm'].values())
            assert abs(total - region['monthlyMm'][month]) < 1e-7
browser = (ROOT / 'browser-controls.txt').read_text(encoding='utf-8')
result_line = next(line for line in browser.splitlines() if line.startswith('- generic: "{'))
browser_result = json.loads(json.loads(result_line.removeprefix('- generic: ')))
assert browser_result == {'status': 'PASS', 'checks': 43, 'failures': []}
assert json.loads((ROOT / 'preview-console.json').read_text(encoding='utf-8')) == []
source_files = ['water.ts', 'water-panel.ts', 'thermal-runtime.ts', 'scenes/earth-land-sea/sidebar-zh.js',
                'tests/moisture.test.ts', 'tests/simulation.test.ts', 'tests/planet-controls.ts']
manifest = {
    'date': '2026-10-15',
    'baselineCommit': '104e7fef5594636cd437e5fa64cc0c90933a7cc6',
    'formalSha256': sha(formal.read_bytes()),
    'observationSha256': sha(observation.read_bytes()),
    'initialInventoriesSha': runs['control']['initialInventoriesSha'],
    'initialStockShaByProfile': {key: run['initialStockSha'] for key, run in runs.items()},
    'initialStateNote': 'Full restored state differs only in the optional water.landPrecipitationKgM2S diagnostic serialized by transport mode. Physical inventories and all other state fields are identical; verify-start.ts checks this independently of the annual integration.',
    'decompressedBundleSha256': bundles,
    'bundleUse': {key: 'buoyancy' if key == 'buoyancy' else 'baseline' for key in runs},
    'provenanceNote': 'Archived programs are the exact executed integration bundles. The buoyancy bundle predates the UI migration addition; that UI-only entry point is not called by this audit. Source hashes below identify the final implementation, normalized to LF.',
    'sourceSha256LF': {f: sha((REPO / f).read_text(encoding='utf-8').encode('utf-8')) for f in source_files},
    'checks': {'completedFullTerrainOrbits': len(runs), 'regionsPerOrbit': 13,
               'sameInitialInventories': True, 'strictContinuationAll': True,
               'monthlyComponentSums': True, 'browserChecks': 43, 'previewConsoleErrorsAndWarnings': 0},
    'evidenceSha256': {str(f.relative_to(ROOT)).replace('\\', '/'): sha(f.read_bytes())
                      for f in sorted(ROOT.rglob('*')) if f.is_file() and f.name != 'manifest.json'},
}
(ROOT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print('Verified: 8 complete terrain runs, 13 matched regions, common inputs and inventories, exact archived bundles, sampled budgets, monthly sums, strict continuation, 43 browser checks.')
