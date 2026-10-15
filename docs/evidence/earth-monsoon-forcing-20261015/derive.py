"""Verify source data, remap monthly fields, archive compact diagnostic forcing."""
import gzip,hashlib,json
from pathlib import Path
from remap import np,latitude_edges,matrices,apply,pressure_weights
import netCDF4 as nc

folder=Path(__file__).parent;manifest=json.loads((folder/'inputs.json').read_text())
data={};coords={};levels={}
for f in manifest['files']:
    assert hashlib.sha256(Path(f['path']).read_bytes()).hexdigest()==f['sha256']
    with nc.Dataset(f['path']) as ds:
        v=ds[f['variable']][:];assert not np.ma.getmaskarray(v).any()
        a=np.asarray(v,dtype=float);assert np.isfinite(a).all()
        if f['units']=='degC':a+=273.15
        if f['name']=='shum':
            assert f['units'] in ['grams/kg','kg/kg']
            if f['units']=='grams/kg':a/=1000
        data[f['name']]=a;coords[f['name']]=(np.array(ds['lat'][:]),np.array(ds['lon'][:]))
        if 'level' in ds.variables:levels[f['name']]=np.array(ds['level'][:])
        if 'valid_yr_count' in ds.variables:assert np.asarray(ds['valid_yr_count'][:]).min()==30
target_edges=np.linspace(1,-1,25);target_lon=np.arange(48)*7.5-176.25
for name in ['skt.sfc','uwnd.10m','vwnd.10m','pres.sfc']:
    for a,b in zip(coords[name],coords['air.2m']):assert np.array_equal(a,b)
for name in ['uwnd','vwnd']:
    for a,b in zip(coords[name],coords['shum']):assert np.array_equal(a,b)
g=matrices(*coords['air.2m'],target_edges,target_lon,True)
p=matrices(*coords['shum'],target_edges,target_lon)
fields={key:apply(data[name],g) for key,name in {'airK':'air.2m','skinK':'skt.sfc','u10':'uwnd.10m','v10':'vwnd.10m','surfacePressurePa':'pres.sfc'}.items()}
plat,plon=coords['shum'];ps=apply(data['pres.sfc'],matrices(*coords['pres.sfc'],latitude_edges(plat),plon,True))/100
dp=pressure_weights(levels['shum'],ps)
q=data['shum'];assert q.min()>=0
qdp=q*dp/9.80665
water=qdp.sum(axis=1);remapped_water=apply(water,p);assert remapped_water.min()>0
fields['lowerColumnVaporKgM2']=remapped_water
for component,name in [('uColumn','uwnd'),('vColumn','vwnd')]:
    indices=[int(np.flatnonzero(levels[name]==lev)[0]) for lev in levels['shum']]
    flux=(qdp*data[name][:,indices]).sum(axis=1)
    fields[component]=apply(flux,p)/remapped_water
assert fields['airK'].min()>170 and fields['airK'].max()<340
assert fields['skinK'].min()>170 and fields['skinK'].max()<350
payload={'width':48,'height':24,'months':'January through December',
         'inputManifestSha256':hashlib.sha256((folder/'inputs.json').read_bytes()).hexdigest(),
         'description':'Conservative spherical cell-average remap; see PROTOCOL.md for vertical and temporal approximations.',
         'fields':{k:v.reshape(12,-1).tolist() for k,v in fields.items()},
         'ranges':{k:[float(v.min()),float(v.max())] for k,v in fields.items()}}
raw=(json.dumps(payload,separators=(',',':'))+'\n').encode()
target=folder/'forcing.json.gz'
if target.exists():assert gzip.decompress(target.read_bytes())==raw,'Frozen forcing changed'
else:target.write_bytes(gzip.compress(raw,mtime=0))
print(json.dumps(payload['ranges'],indent=2));print('forcing bytes',target.stat().st_size)
