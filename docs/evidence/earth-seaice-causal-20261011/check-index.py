"""Provenance check only: compare cached Index against the NASA Team field.
Do not claim they are the same product. Common valid pixels only. Include
15%-thresholded NT as a separate sensitivity check, not an assumed Index
operation: cached Index files contain valid concentrations below 15%.
"""
import sys,json,hashlib,re
from pathlib import Path
sys.path.insert(0,str(Path('build/earth-seaice-causal/geo-libs').resolve()))
import numpy as np
import netCDF4 as nc
import rasterio
folder=Path('docs/evidence/earth-seaice-causal-20261011')
manifest=json.loads((folder/'nsidc-inputs.json').read_text())
files={(f['hemisphere'],f['year'],f['month']):f for f in manifest['files']}
checks=[]
for p in sorted(Path('build/earth-seaice-causal/nsidc').glob('*.tif')):
 m=re.match(r'([NS])_(\d{4})(\d{2})_',p.name);h='north' if m[1]=='N' else 'south'
 f=files[(h,int(m[2]),int(m[3]))]
 with nc.Dataset(f['file']) as ds:
  v=ds[manifest['variable']];v.set_auto_maskandscale(False);raw=v[0].view('uint8');a=raw.astype(float)/100
  x=ds['xgrid'][:];y=ds['ygrid'][:]
 with rasterio.open(p) as ds:
  b=ds.read(1);assert b.shape==a.shape
  assert ds.transform.c+ds.transform.a/2==float(x[0]) and ds.transform.f+ds.transform.e/2==float(y[0])
 good=(raw<=100)&(b<=1000);bi=b[good].astype(float)/1000;ai=a[good];masked=np.where(ai>=.15,ai,0)
 if not len(ai):continue
 checks.append({'file':p.name,'indexSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'ntSha256':f['sha256'],'validPixels':int(good.sum()),'rawMeanAbsoluteDifferenceFraction':float(np.abs(ai-bi).mean()),'threshold15MeanAbsoluteDifferenceFraction':float(np.abs(masked-bi).mean()),'threshold15MaxDifferenceFraction':float(np.abs(masked-bi).max()),'threshold15DisagreementPixelCount':int(((ai>=.15)!=(bi>=.15)).sum()),'identicalFraction':float(np.mean(masked==bi))})
result={'method':'Direct pixelwise comparison on aligned Hughes polar stereographic 25-km cells and common valid masks. G02202 v02r00 NASA Team monthly fields may differ from G02135 v4; use neither as a silent substitute. Cached Index only covers a subset of north Jan-Jun; it cannot establish equivalence for south or all seasons.', 'pairs':len(checks),'hemispheres':sorted(set(p['file'][0] for p in checks)),'months':sorted(set(int(p['file'][6:8]) for p in checks)), 'checks':checks}
for key in ['rawMeanAbsoluteDifferenceFraction','threshold15MeanAbsoluteDifferenceFraction']:
 result[key]=float(sum(c[key]*c['validPixels'] for c in checks)/sum(c['validPixels'] for c in checks))
(folder/'nsidc-index-crosscheck.json').write_text(json.dumps(result,indent=2))
print(json.dumps({k:v for k,v in result.items() if k!='checks'}))
