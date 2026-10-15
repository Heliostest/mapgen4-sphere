"""Exploratory spherical finite-volume remapping and pressure quadrature."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path('build/earth-seaice-causal/geo-libs').resolve()))
import numpy as np

def latitude_edges(lat,gaussian=False):
    lat=np.asarray(lat);assert np.all(np.diff(lat)<0)
    if gaussian:
        nodes,weights=np.polynomial.legendre.leggauss(len(lat))
        assert np.max(np.abs(np.rad2deg(np.arcsin(nodes[::-1]))-lat))<.001
        return np.r_[1,1-np.cumsum(weights[::-1])]
    return np.sin(np.deg2rad(np.r_[90,(lat[:-1]+lat[1:])/2,-90]))

def matrices(lat,lon,target_lat_edges,target_lon_centers,gaussian=False):
    src=latitude_edges(lat,gaussian);dst=np.asarray(target_lat_edges)
    lat_overlap=np.maximum(0,np.minimum(dst[:-1,None],src[None,:-1])-np.maximum(dst[1:,None],src[None,1:]))
    a=lat_overlap/(dst[:-1]-dst[1:])[:,None]
    lon=np.asarray(lon);target=np.asarray(target_lon_centers)
    sw=360/len(lon);tw=360/len(target)
    assert np.allclose(np.diff(lon),sw)
    b=np.zeros((len(target),len(lon)))
    for offset in [-720,-360,0,360,720]:
        b+=np.maximum(0,np.minimum(target[:,None]+tw/2,lon[None,:]+offset+sw/2)-np.maximum(target[:,None]-tw/2,lon[None,:]+offset-sw/2))/tw
    assert np.allclose(a.sum(axis=1),1,atol=1e-12) and np.allclose(b.sum(axis=1),1,atol=1e-12)
    return a,b

def apply(values,weights):
    a,b=weights
    return np.einsum('ij,...jk,lk->...il',a,values,b,optimize=True)

def pressure_weights(levels,ps_hpa):
    """Piecewise-constant q/wind integration from 300 hPa to local surface."""
    levels=np.asarray(levels);assert levels[0]==1000 and levels[-1]==300
    assert np.all(np.diff(levels)<0)
    edges=np.r_[np.inf,(levels[:-1]+levels[1:])/2,300.]
    valid=levels[None,:,None,None]<=ps_hpa[:,None,:,:]
    first=valid & ~np.concatenate([np.zeros_like(valid[:,:1]),valid[:,:-1]],axis=1)
    bottom=np.where(first,ps_hpa[:,None,:,:],np.minimum(ps_hpa[:,None,:,:],edges[None,:-1,None,None]))
    # A partially intersected layer must not import an extrapolated underground
    # pressure-level sample: extend the lowest *valid* sample to the surface.
    return np.where(valid,np.maximum(0,bottom-edges[None,1:,None,None])*100,0)
