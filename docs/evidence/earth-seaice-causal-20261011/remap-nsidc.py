"""NSIDC on exactly the marine model support, using terrain quadrature.
No data are inferred within land/coast/pole-hole/missing pixels. Preserve
the static intersection of valid pixels over every available 1981-2010 month.
The source triangle mask excludes confirmed lakes and imported ice shelves.
Each hemisphere uses its GeoTIFF CRS, including the Hughes datum.
"""
import sys,json,hashlib
from pathlib import Path
sys.path.insert(0,str(Path('build/earth-seaice-causal/geo-libs').resolve()))
import numpy as np
import rasterio
from rasterio.transform import Affine
import netCDF4 as nc
from pyproj import Transformer
folder=Path('docs/evidence/earth-seaice-causal-20261011')
manifest=json.loads((folder/'nsidc-inputs.json').read_text())
grid=json.loads(Path('build/earth-seaice-causal/grid.json').read_text())
tri=np.fromfile('build/earth-seaice-causal/marine-triangles.f64',dtype='<f8').reshape(-1,11)
n=grid['width']*grid['height'];cellarea=grid['cellAreaM2']
expected=np.array(grid['triangleMarineSupportM2'])
exported=np.bincount(tri[:,0].astype(int),weights=tri[:,1],minlength=n)
assert np.allclose(exported,expected,atol=.02,rtol=1e-12), 'Triangle weights must use m2 and close to model marine support'
datasets={}
for hemi in ['north','south']:
    files=[f for f in manifest['files'] if f['hemisphere']==hemi]
    with nc.Dataset(files[0]['file']) as ds:
        shape=ds[manifest['variable']].shape[1:];crs=ds['projection'].spatial_ref
        x=ds['xgrid'][:];y=ds['ygrid'][:]
        dx=float(x[1]-x[0]);dy=float(y[1]-y[0]);assert dx==25000 and dy==-25000
        transform=Affine(dx,0,float(x[0]-dx/2),0,dy,float(y[0]-dy/2))
    total=np.zeros((12,*shape),dtype='float64');count=np.zeros((12,*shape),dtype='int16')
    valid_all=np.ones(shape,dtype=bool);counts=[];excluded=[]
    for month in range(1,13):
        mf=[f for f in files if f['month']==month];included=0
        for f in mf:
            b=Path(f['file']).read_bytes();assert hashlib.sha256(b).hexdigest()==f['sha256']
            with nc.Dataset(f['file']) as ds:
                assert ds[manifest['variable']].shape[1:]==shape and ds['projection'].spatial_ref==crs
                assert np.array_equal(ds['xgrid'][:],x) and np.array_equal(ds['ygrid'][:],y)
                v=ds[manifest['variable']];v.set_auto_maskandscale(False)
                raw=v[0].view('uint8');valid=raw<=100;a=raw.astype('float64')/100
            if not valid.any():excluded.append({'year':f['year'],'month':month,'reason':'entire NASA Team monthly concentration field missing'});continue
            included+=1
            valid_all &= valid
            total[month-1]+=np.where(valid,a,0);count[month-1]+=valid
        assert included>=28;counts.append(included)
    means=np.divide(total,count,out=np.zeros_like(total),where=count>0)
    datasets[hemi]=(means,valid_all,Transformer.from_crs('EPSG:4326',crs,always_xy=True),transform,counts)
    print(hemi,shape,counts,'common valid pixels',valid_all.sum(),'excluded',excluded,flush=True)
    datasets[hemi]=(*datasets[hemi],excluded)

def norm(v):return v/np.linalg.norm(v,axis=-1,keepdims=True)
def split(t):
    a,b,c=t[:,0],t[:,1],t[:,2];ab=norm(a+b);bc=norm(b+c);ca=norm(c+a)
    return np.stack([np.stack([a,ab,ca],1),np.stack([ab,b,bc],1),np.stack([ca,bc,c],1),np.stack([ab,bc,ca],1)],1).reshape(-1,3,3)
def area(t):
    a,b,c=t[:,0],t[:,1],t[:,2]
    return 2*np.arctan2(np.abs(np.einsum('ij,ij->i',a,np.cross(b,c))),1+np.einsum('ij,ij->i',a,b)+np.einsum('ij,ij->i',a,c)+np.einsum('ij,ij->i',b,c))
def remap(level):
    triangles=norm(tri[:,2:].reshape(-1,3,3));k=tri[:,0].astype(int);weights=tri[:,1].copy()
    for _ in range(level):
        triangles=split(triangles);subarea=area(triangles).reshape(-1,4)
        weights=(weights[:,None]*subarea/subarea.sum(1)[:,None]).reshape(-1);k=np.repeat(k,4)
    p=norm(triangles.sum(1));lon=np.rad2deg(np.arctan2(p[:,0],p[:,2]));lat=np.rad2deg(np.arcsin(p[:,1]))
    support=np.zeros(n);obs=np.zeros((12,n));year_counts={}
    for hemi in ['north','south']:
        sel=lat>0 if hemi=='north' else lat<0
        means,valid,projection,tform,counts,excluded=datasets[hemi];year_counts[hemi]=counts
        xs,ys=projection.transform(lon[sel],lat[sel]);cols=np.floor((xs-tform.c)/tform.a).astype(int);rows=np.floor((ys-tform.f)/tform.e).astype(int)
        inside=(rows>=0)&(rows<valid.shape[0])&(cols>=0)&(cols<valid.shape[1])
        idx=np.flatnonzero(sel)[inside];rows=rows[inside];cols=cols[inside]
        good=valid[rows,cols];idx=idx[good];rows=rows[good];cols=cols[good]
        support+=np.bincount(k[idx],weights=weights[idx],minlength=n)
        for month in range(12):obs[month]+=np.bincount(k[idx],weights=weights[idx]*means[month,rows,cols],minlength=n)
    obs=np.divide(obs,support[None,:],out=np.zeros_like(obs),where=support[None,:]>0)
    assert (support<=expected+.02).all() and support[:n//2].sum()>1e12 and support[n//2:].sum()>1e12
    assert np.isfinite(obs).all() and (obs>=0).all() and (obs<=1+1e-12).all()
    return {'subtrianglesPerSource':4**level,'supportM2':support.tolist(),'concentration':obs.tolist(),'yearsPerMonth':year_counts,'commonMillionKm2':{h:float(support[slice(0,n//2) if h=='north' else slice(n//2,n)].sum()/1e12) for h in ['north','south']}}
runs=[remap(i) for i in range(3)]
diff=[]
for a,b in zip(runs,runs[1:]):
    wa=np.array(a['supportM2']);wb=np.array(b['supportM2']);ca=np.array(a['concentration']);cb=np.array(b['concentration'])
    polar={}
    for h,s in [('north',slice(0,n//2)),('south',slice(n//2,n))]:
        polar[h]={'iceAreaDifferenceMillionKm2':(np.abs((wa[s]*ca[:,s]).sum(1)-(wb[s]*cb[:,s]).sum(1))/1e12).tolist(),'extentDifferenceMillionKm2':(np.abs((wa[s]*(ca[:,s]>=.15)).sum(1)-(wb[s]*(cb[:,s]>=.15)).sum(1))/1e12).tolist(),'supportDifferenceMillionKm2':float(np.abs(wa[s]-wb[s]).sum()/1e12)}
    diff.append({'from':a['subtrianglesPerSource'],'to':b['subtrianglesPerSource'],'supportDifferenceMillionKm2':float(np.abs(wa-wb).sum()/1e12),'globalIceAreaDifferenceMillionKm2':(np.abs((wa*ca).sum(1)-(wb*cb).sum(1))/1e12).tolist(),'hemispheres':polar})
result={**runs[-1],'product':manifest['product'],'variable':manifest['variable'],'doi':manifest['doi'],'excludedFiles':{h:datasets[h][-1] for h in ['north','south']},'method':'G02202 v02r00 NASA Team monthly field, fixed 1981-2010 climatology. Terrain triangle subdivision centroid quadrature on the sphere, weights renormalized to actual model marine support; fixed land/lake/shelf mask; strict intersection of NSIDC valid concentration 0..100 percent pixels for all available years and months, pole hole excluded. Whole missing monthly fields excluded; no inferred ice. Remap monthly concentration before applying 15% coarse-cell extent threshold. This is a same-grid statistic, not G02135 native extent CSV or the merged CDR. March20 model calendar normalized to physical year.','triangleMaskSha256':hashlib.sha256(Path('build/earth-seaice-causal/marine-triangles.f64').read_bytes()).hexdigest(),'inputManifestSha256':hashlib.sha256((folder/'nsidc-inputs.json').read_bytes()).hexdigest(),'quadratureConvergence':diff,'grid':grid}
(folder/'nsidc-same-grid.json').write_text(json.dumps(result,indent=2))
print(json.dumps({'support':result['commonMillionKm2'],'convergence':diff}),flush=True)
