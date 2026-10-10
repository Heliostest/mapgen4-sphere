"""Sample Natural Earth polygons on the application's existing painting grid."""
import hashlib, json, math, struct, zipfile
from pathlib import Path
import numpy as np

root = Path(__file__).resolve().parents[2]
folder = root / 'build/earth-land-sea'
archive = folder / 'ne_50m_land.zip'
with zipfile.ZipFile(archive) as z:
    source = z.read('ne_50m_land.shp')
    version = z.read('ne_50m_land.VERSION.txt').decode().strip() if 'ne_50m_land.VERSION.txt' in z.namelist() else '4.0.0'
    crs = z.read('ne_50m_land.prj').decode()
    rings=[]
    offset=100
    while offset<len(source):
        _, length = struct.unpack_from('>ii',source,offset)
        record=source[offset+8:offset+8+length*2]
        offset+=8+length*2
        if struct.unpack_from('<i',record)[0]!=5: continue
        parts,count=struct.unpack_from('<ii',record,36)
        starts=list(struct.unpack_from('<'+'i'*parts,record,44))+[count]
        points=np.frombuffer(record,dtype='<f8',count=count*2,offset=44+4*parts).reshape(-1,2).copy()
        for a,b in zip(starts,starts[1:]): rings.append(points[a:b])

edges=np.concatenate([np.column_stack((r[:-1],r[1:])) for r in rings])
x0,y0,x1,y1=edges.T
def at_lat(lat,lon):
    crossing=(y0>lat)!=(y1>lat)
    xs=np.sort(x0[crossing]+(lat-y0[crossing])*(x1[crossing]-x0[crossing])/(y1[crossing]-y0[crossing]))
    return np.searchsorted(xs,np.asarray(lon),side='right')%2==1

size=128
lons=np.arange(size)*360/size-180
lats=90-np.arange(size)*180/(size-1)
mask=np.stack([at_lat(float(np.clip(lat,-89.99999,89.99999)),lons) for lat in lats])
mask[0,:]=False
mask[-1,:]=True
# Keep source coordinates and binary nodes. Heights remain illustrative generator inputs.
values=np.where(mask,0.45,-0.15).astype(np.float32)
samples=[('Africa',20,0,True),('South America',-60,-10,True),('North America',-100,40,True),('Eurasia',90,45,True),('Australia',135,-25,True),('Greenland',-42,73,True),('Antarctica',0,-89,True),('Atlantic',-30,0,False),('Pacific',-140,0,False),('Indian Ocean',80,-30,False),('Arctic Ocean',0,89,False)]
checks=[]
for name,lon,lat,want in samples:
    got=bool(at_lat(lat,[lon])[0]);assert got==want,(name,got)
    checks.append({'name':name,'longitude':lon,'latitude':lat,'land':got})
# Independent equal-area reference integration, no latitude-weight bias.
equal_lats=np.degrees(np.arcsin(1-2*(np.arange(720)+.5)/720))
equal_lons=-180+(np.arange(1440)+.5)*360/1440
fraction=float(np.mean([np.mean(at_lat(lat,equal_lons)) for lat in equal_lats]))
(folder/'constraints.json').write_text(json.dumps(values.ravel().tolist(),separators=(',',':')))
(folder/'rings.json').write_text(json.dumps([r.tolist() for r in rings],separators=(',',':')))
metadata={'source':'Natural Earth 1:50m land polygons','sourcePage':'https://www.naturalearthdata.com/downloads/50m-physical-vectors/50m-land/','sourceURL':'https://naturalearth.s3.amazonaws.com/50m_physical/ne_50m_land.zip','version':version,'license':'Public domain','licenseURL':'https://www.naturalearthdata.com/about/terms-of-use/','archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'crs':crs,'referenceLandFraction':fraction,'paintingSize':size,'grid':'u=x/128, longitude=360*u-180; v=y/127, latitude=90-180*v; one scalar per pole','heightPolicy':'Illustrative procedural relief; this is a land-sea distribution preview, not an Earth DEM or measured bathymetry.','checks':checks}
(folder/'source.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2))
print(json.dumps({'rings':len(rings),'sourceVersion':version,'referenceLandFraction':fraction,'knownLocations':len(checks)}))
