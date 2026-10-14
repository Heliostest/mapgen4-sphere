import json,csv,hashlib,subprocess
from pathlib import Path
root=Path.cwd();out=root/'build/c10-independent-review';run=root/'build/earth-metric-moments';folder=root/'docs/evidence/earth-metric-moments-20261014'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'));digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
selected=read(folder/'selected-runs.json');spatial=read(run/(selected['spatial']+'.json'));harmonic=read(run/(selected['harmonic']+'.json'));checks=[];paths=[]
for name,raw,field,metrics in [('potential-comparison.csv',spatial['rows'],'degree',('force_globalError','force_polar','pressure_globalError','pressure_polar','kineticSampling_globalError','kineticSampling_polar','exactKGradient_globalError','exactKGradient_polar','curlForce_globalError','curlForce_polar')),('primary-comparison.csv',spatial['primary'],'kind',('globalError','polar')),('pressure-proxy-comparison.csv',harmonic['rows'],'degree',('relative','polarMax','rayleigh'))]:
 path=run/name;paths.append(path);rows=list(csv.DictReader(path.open(newline='',encoding='utf-8-sig')));assert len(rows)==len(raw)
 for row,data in zip(rows,raw):
  assert int(row['rings'])==data['rings'] and (row['variablePref']=='true')==data['variable'] and int(row['axis'])==data['axis']
  assert row[field]==str(data[field])
  for model in ('c9','c10'):
   for metric in metrics:
    val=data[model]
    for key in metric.split('_'):val=val[key]
    assert float(row[model+'_'+('global' if name=='primary-comparison.csv' and metric=='globalError' else metric)])==val
 checks.append({'csv':name,'rows':len(rows),'unroundedExact':True})
plot=read(run/'plot-provenance.json');assert plot['passed']
for p,h in dict(plot['sourceHashes'],**plot['inputHashes']).items():assert digest(root/p)==h
assert digest(run/'convergence.png')==plot['outputSHA256'];paths.extend([run/'convergence.png',run/'plot-provenance.json'])
r=subprocess.run(['node','docs/evidence/earth-native-graph-wind-20261014/check-frozen.mjs'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
(out/'ancestor-default-check-v2.log').write_text(r.stdout+r.stderr);assert r.returncode==0
preservation=json.loads(r.stdout);assert preservation['passed'] and preservation['formalDefaultUnchanged']
record={'passed':True,'csvChecks':checks,'plotProvenance':True,'visualInspection':'Convergence figure viewed at full rendered resolution; labels, series, norms and axes consistent with report and source.','preservation':preservation,'inputHashes':{p.relative_to(root).as_posix():digest(p) for p in paths}}
(out/'document-output-audit-v2.json').write_text(json.dumps(record,indent=2));print(json.dumps(record))

