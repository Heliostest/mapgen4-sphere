"""Sample NOAA ETOPO 2022 DAP2 data onto the app's exact spherical mesh.

Run make-world.ts --coordinates first. Requires numpy. No rendered imagery is
used as elevation. The cached source is checked before its binary data is read.
"""
import hashlib, json, struct, urllib.request, zipfile
from pathlib import Path
import numpy as np

root=Path(__file__).resolve().parents[2]
scene=root/'scenes/earth-land-sea'
cache=root/'build/earth-relief'
cache.mkdir(parents=True,exist_ok=True)
url='https://coastwatch.pfeg.noaa.gov/erddap/griddap/ETOPO_2022_v1_15s.dods?z%5B0:24:43199%5D%5B0:24:86399%5D'
sha='57c548870890f8eae5f020f9f143038f2c451f239983de4c7b54d6aedb331a8a'
path=cache/'etopo-2022-0.1deg.dods'
if not path.exists():
    with urllib.request.urlopen(url,timeout=240) as response:path.write_bytes(response.read())
blob=path.read_bytes()
assert hashlib.sha256(blob).hexdigest()==sha,'NOAA source checksum changed; inspect before regenerating'
header,body=blob.split(b'Data:\n',1)
assert b'Float32 z[latitude = 1800][longitude = 3600]' in header
offset=0
def array(count,dtype):
    global offset
    assert struct.unpack_from('>II',body,offset)==(count,count)
    offset+=8
    values=np.frombuffer(body,dtype=dtype,count=count,offset=offset).astype(float)
    offset+=count*np.dtype(dtype).itemsize
    return values
z=array(1800*3600,'>f4').reshape(1800,3600)
lat=array(1800,'>f8');lon=array(3600,'>f8')
assert offset==len(body) and np.isfinite(z).all()
assert np.allclose(np.diff(lat),.1) and np.allclose(np.diff(lon),.1)
assert -90<lat[0]<-89.99 and -180<lon[0]<-179.99

def elevation(latitude,longitude):
    x=((np.asarray(longitude)-lon[0])/.1)%len(lon)
    y=np.clip((np.asarray(latitude)-lat[0])/.1,0,len(lat)-1)
    x0=np.floor(x).astype(int);y0=np.floor(y).astype(int)
    x1=(x0+1)%len(lon);y1=np.minimum(y0+1,len(lat)-1)
    fx=x-x0;fy=y-y0
    value=(1-fy)*((1-fx)*z[y0,x0]+fx*z[y0,x1])+fy*((1-fx)*z[y1,x0]+fx*z[y1,x1])
    # A pole has no distinguished longitude.
    return np.where(latitude<=-89.95,z[0].mean(),np.where(latitude>=89.95,z[-1].mean(),value))

coast=json.loads((scene/'source.json').read_text())
archive=root/'build/earth-land-sea/ne_50m_land.zip'
if not archive.exists():
    archive.parent.mkdir(parents=True,exist_ok=True)
    with urllib.request.urlopen(coast['sourceURL'],timeout=120) as response:archive.write_bytes(response.read())
assert hashlib.sha256(archive.read_bytes()).hexdigest()==coast['archiveSha256']
with zipfile.ZipFile(archive) as package:data=package.read('ne_50m_land.shp')
rings=[];i=100
while i<len(data):
    _,length=struct.unpack_from('>ii',data,i);record=data[i+8:i+8+2*length];i+=8+2*length
    if struct.unpack_from('<i',record)[0]!=5:continue
    parts,count=struct.unpack_from('<ii',record,36)
    starts=list(struct.unpack_from('<'+'i'*parts,record,44))+[count]
    points=np.frombuffer(record,dtype='<f8',count=2*count,offset=44+4*parts).reshape(-1,2)
    rings.extend(points[a:b] for a,b in zip(starts,starts[1:]))
edges=np.concatenate([np.column_stack((r[:-1],r[1:])) for r in rings])
x0,y0,x1,y1=edges.T
def land_mask(latitude,longitude):
    # Group scanlines at the DEM sampling interval, bounding coastline sampling
    # error to 0.05 degrees rather than the old 128-column painting resolution.
    rows=np.clip(np.round(latitude*10)/10,-89.9999,89.9999)
    result=np.zeros(len(rows),dtype=bool)
    for row in np.unique(rows):
        crossing=(y0>row)!=(y1>row)
        crossings=np.sort(x0[crossing]+(row-y0[crossing])*(x1[crossing]-x0[crossing])/(y1[crossing]-y0[crossing]))
        indices=rows==row
        result[indices]=np.searchsorted(crossings,longitude[indices],side='right')%2==1
    result[latitude>89.95]=False;result[latitude<-89.95]=True
    return result

mesh=json.loads((cache/'mesh.json').read_text());xyz=np.array(mesh['xyz']).reshape(-1,3)
latitude=np.degrees(np.arcsin(xyz[:,1]/np.linalg.norm(xyz,axis=1)))
longitude=np.degrees(np.arctan2(xyz[:,0],xyz[:,2]))
raw=elevation(latitude,longitude);land=land_mask(latitude,longitude)
# The app encodes land/ocean by height sign. Retain the requested coastline;
# below-sea-level land and mismatched shoreline cells receive a 1 m floor.
heights=np.where(land,np.maximum(1,raw),np.minimum(-1,raw))
assert np.min(heights)>-11000 and np.max(heights)<10000
assert 2500<elevation(np.array(-90.),np.array(0.))<3200,'Expected ice-surface South Pole height'
checks=[('Tibetan Plateau',33,87,4000,6000),('Himalaya',28.25,86.85,4500,8000),('Altiplano',-20,-68,3000,6000),('Amazon Plain',-3,-60,0,400),('Ganges Plain',25,84,0,400),('West Siberian Plain',60,70,0,400),('Greenland Ice Sheet',73,-40,2000,3600),('South Pole',-90,0,2500,3200),('North Pacific Basin',25,-150,-6500,-3000),('Mariana Trench',11.35,142.2,-11000,-6000)]
benchmarks=[]
for name,la,lo,low,high in checks:
    h=float(elevation(np.array(la),np.array(lo)))
    assert low<h<high,(name,h,low,high)
    benchmarks.append({'name':name,'latitude':la,'longitude':lo,'sourceM':round(h,2),'expectedRangeM':[low,high]})
result={'mesh':mesh['mesh'],'units':'metres relative to EGM2008','heightsM':np.round(heights,2).tolist()}
(scene/'elevation-samples.json').write_text(json.dumps(result,separators=(',',':')))
metadata={'dataset':'NOAA ETOPO 2022, ice surface','sourcePage':'https://www.ncei.noaa.gov/products/etopo-global-relief-model','datasetURL':'https://coastwatch.pfeg.noaa.gov/erddap/griddap/ETOPO_2022_v1_15s.html','downloadURL':url,'sha256':sha,'accessed':'2026-10-10','license':'NOAA: data may be used and redistributed for free','verticalDatum':'EGM2008, metres','sourceResolutionArcSeconds':15,'downloadStride':24,'sampleSpacingDegrees':.1,'gridShape':[1800,3600],'latitudeStart':float(lat[0]),'longitudeStart':float(lon[0]),'sampling':'bilinear at actual mesh triangle positions; pole rows averaged across longitude','coastline':'Natural Earth 50m, scanline sampled at 0.1 degrees; 1 m sign floor for below-sea-level land and shoreline disagreements','clampedLandTriangles':int(np.sum(land&(raw<1))),'clampedSeaTriangles':int(np.sum(~land&(raw>-1))),'minMeshM':float(heights.min()),'maxMeshM':float(heights.max()),'checks':benchmarks}
(scene/'elevation-source.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2))
print(json.dumps(metadata,ensure_ascii=False,indent=2))
