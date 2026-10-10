"""Sample actual BedMachine ice thickness and masks through GFZ GDEMM2024.

Requires numpy. HTTP range requests read the required uncompressed GeoTIFF
scanlines; no entire global raster, rendered image, or DEM difference is used.
Cached byte ranges are validated against the checked-in ice-source.json before
they are decoded. Run with the same Python environment as sample-elevation.py.
"""
import concurrent.futures
import hashlib
import json
import struct
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SCENE = ROOT / 'scenes/earth-land-sea'
CACHE = ROOT / 'build/earth-ice'
CACHE.mkdir(parents=True, exist_ok=True)
BASE = 'https://datapub.gfz-potsdam.de/download/10.5880.GFZ.1.2.2024.002-Veebui/'
LAYERS = ('LTM', 'ICE', 'BED', 'SUR')
W, H = 96, 49
WIDTH, HEIGHT = 21600, 10800
DELTA = 1 / 60
OLD = json.loads((SCENE / 'ice-source.json').read_text(encoding='utf8')) if (SCENE / 'ice-source.json').exists() else None
EXPECTED = {x['cacheKey']: x for x in OLD['byteRanges']} if OLD else {}
RANGES = {}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_range(layer, start, size, key):
    url = BASE + f'GDEMM2024_{layer}.1m.tif'
    path = CACHE / key
    expected = EXPECTED.get(key)
    if path.exists():
        data = path.read_bytes()
        if expected:
            assert digest(data) == expected['sha256'], f'Cached source changed: {key}'
            RANGES[key] = expected
            return data
    request = urllib.request.Request(url, headers={'Range': f'bytes={start}-{start+size-1}'})
    with urllib.request.urlopen(request, timeout=120) as response:
        assert response.status == 206, 'Source did not honour HTTP byte-range request'
        data = response.read()
        assert len(data) == size, f'Truncated source: {key}'
        content_range = response.headers['Content-Range']
        assert content_range.startswith(f'bytes {start}-{start+size-1}/')
        record = {'layer': layer, 'url': url, 'cacheKey': key, 'start': start, 'length': size,
                  'sha256': digest(data), 'sourceFileBytes': int(content_range.split('/')[1]),
                  'etag': response.headers.get('ETag'), 'lastModified': response.headers.get('Last-Modified')}
        source_header = EXPECTED.get(f'{layer}-header.bin')
        if source_header:
            for field in ('sourceFileBytes', 'etag', 'lastModified'):
                assert record[field] == source_header[field], f'Official raster changed ({field}): {key}'
        if expected:
            for field in ('sha256', 'sourceFileBytes', 'etag', 'lastModified'):
                assert record[field] == expected[field], f'Official source changed ({field}): {key}'
        path.write_bytes(data)
        RANGES[key] = record
        return data


class Raster:
    def __init__(self, layer):
        self.layer = layer
        header = read_range(layer, 0, 262144, f'{layer}-header.bin')
        assert header[:4] == b'II*\x00', 'Expected ordinary little-endian TIFF'
        offset = struct.unpack_from('<I', header, 4)[0]
        tags = {}
        for i in range(struct.unpack_from('<H', header, offset)[0]):
            tag, kind, count, value = struct.unpack_from('<HHII', header, offset+2+12*i)
            tags[tag] = (kind, count, value)
        assert tags[256][2] == WIDTH and tags[257][2] == HEIGHT
        assert tags[258][2] == 16 and tags[259][2] == 1 and tags[339][2] == 2
        assert tags[278][2] == 1 and tags[277][2] == 1
        assert tags[273][0:2] == (4, HEIGHT) and tags[279][0:2] == (4, HEIGHT)
        self.offsets = np.frombuffer(header, '<u4', HEIGHT, tags[273][2]).copy()
        sizes = np.frombuffer(header, '<u4', HEIGHT, tags[279][2])
        assert np.all(sizes == WIDTH*2)
        assert np.all(np.diff(self.offsets) == WIDTH*2)
        scale = struct.unpack_from('<3d', header, tags[33550][2])
        tie = struct.unpack_from('<6d', header, tags[33922][2])
        assert np.allclose(scale[:2], [DELTA, DELTA], rtol=0, atol=1e-12)
        assert np.allclose(tie, [0, 0, 0, -180, 90, 0], rtol=0, atol=1e-9)
        # GeoTIFF declares pixel-as-area registration and WGS84 (G1150), EPSG9055.
        keys = np.frombuffer(header, '<u2', tags[34735][1], tags[34735][2])
        assert [1025, 0, 1, 1] in keys[4:].reshape(-1, 4).tolist()
        assert [2048, 0, 1, 9055] in keys[4:].reshape(-1, 4).tolist()
        kind, count, address = tags[42113]
        self.nodata = int(header[address:address+count].rstrip(b'\x00'))
        assert self.nodata == (-127 if layer == 'LTM' else -32767)
        self.rows = {}

    def load_rows(self, rows):
        pending = sorted(set(int(r) for r in rows) - self.rows.keys())
        def load(row):
            data = read_range(self.layer, int(self.offsets[row]), WIDTH*2, f'{self.layer}-row-{row:05}.bin')
            return row, np.frombuffer(data, '<i2').copy()
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            self.rows.update(pool.map(load, pending))
        if pending:
            print(f'{self.layer}: {len(pending)} source rows verified', flush=True)

    def values(self, rows, cols):
        return np.array([self.rows[int(r)][int(c)] for r, c in zip(rows, cols)])


def coordinates(lat, lon):
    x = ((np.asarray(lon)+180)/DELTA-.5) % WIDTH
    y = np.clip((90-np.asarray(lat))/DELTA-.5, 0, HEIGHT-1)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    return x0, (x0+1) % WIDTH, y0, np.minimum(y0+1, HEIGHT-1), x-x0, y-y0


def nearest_indices(lat, lon):
    return (np.clip(np.floor((90-np.asarray(lat))/DELTA).astype(int), 0, HEIGHT-1),
            np.floor((np.asarray(lon)+180)/DELTA).astype(int) % WIDTH)


POINTS = [('Antarctic inland', -85, 0), ('South Pole', -90, 0),
          ('Greenland inland', 72, -40), ('Greenland summit', 73, -40),
          ('Ross Ice Shelf', -81, 175), ('Filchner-Ronne Ice Shelf', -78, -50),
          ('Lake Vostok', -77.5, 106), ('North Pole ocean', 90, 0),
          ('Arctic Ocean', 85, 0), ('Southern Ocean', -60, 0),
          ('Tibetan Plateau', 33, 87), ('Himalaya', 28.25, 86.85)]
lat = np.array([90-y*180/(H-1) for y in range(H) for x in range(W)] + [p[1] for p in POINTS])
lon = np.array([-180+(x+.5)*360/W for y in range(H) for x in range(W)] + [p[2] for p in POINTS])
r, c = nearest_indices(lat, lon)
x0, x1, y0, y1, fx, fy = coordinates(lat, lon)
rasters = {layer: Raster(layer) for layer in LAYERS}
mask = rasters['LTM']
mask.load_rows(np.concatenate((r, y0, y1)))
raw_mask = mask.values(r, c)
assert set(raw_mask) <= set(range(6)), 'Missing or unrecognised sampled land-type mask'
ice = np.isin(raw_mask, [3, 4, 5])
for layer in LAYERS[1:]:
    rasters[layer].load_rows(np.concatenate((r[ice], y0[ice], y1[ice])))


def sample_field(layer):
    result = np.zeros(len(lat))
    values = rasters[layer]
    # Categorical nearest-neighbour mask first, then interpolate only corners of
    # that same class. Never spread ice thickness into an ocean or a rock pixel.
    for k in np.flatnonzero(ice):
        corners = [(y0[k], x0[k], (1-fy[k])*(1-fx[k])),
                   (y0[k], x1[k], (1-fy[k])*fx[k]),
                   (y1[k], x0[k], fy[k]*(1-fx[k])),
                   (y1[k], x1[k], fy[k]*fx[k])]
        good = [(values.rows[int(yy)][int(xx)], w) for yy, xx, w in corners
                if mask.rows[int(yy)][int(xx)] == raw_mask[k] and w > 0]
        assert good and all(value != values.nodata for value, w in good), f'Missing {layer} over ice at {lat[k]}, {lon[k]}'
        result[k] = sum(value*w for value, w in good)/sum(w for value, w in good)
        if abs(lat[k]) == 90:
            selected = mask.rows[int(r[k])] == raw_mask[k]
            pole = values.rows[int(r[k])][selected]
            assert len(pole) and np.all(pole != values.nodata)
            result[k] = pole.mean()
    return result


thickness, bed, surface = (sample_field(layer) for layer in ('ICE', 'BED', 'SUR'))
assert np.all(thickness[ice] > 0) and np.all(thickness < 5000)
grounded = np.isin(raw_mask, [3, 5])
shelf = raw_mask == 4
classes = np.where(grounded, 'grounded', np.where(shelf, 'shelf', 'noIce'))
grounded_thickness = np.where(grounded, thickness, 0)
shelf_thickness = np.where(shelf, thickness, 0)
assert np.all(grounded_thickness[shelf] == 0) and np.all(shelf_thickness[grounded] == 0)
checks = []
for k, (name, la, lo) in enumerate(POINTS, W*H):
    checks.append({'name': name, 'latitude': la, 'longitude': lo, 'rawMask': int(raw_mask[k]),
                   'class': str(classes[k]), 'thicknessM': round(float(thickness[k]), 2),
                   'productBedrockM': round(float(bed[k]), 2) if ice[k] else None,
                   'productSurfaceM': round(float(surface[k]), 2) if ice[k] else None})
lookup = {p['name']: p for p in checks}
assert lookup['Antarctic inland']['class'] == 'grounded' and lookup['Antarctic inland']['thicknessM'] > 1000
assert lookup['Greenland inland']['class'] == 'grounded' and lookup['Greenland inland']['thicknessM'] > 1000
for name in ('Ross Ice Shelf', 'Filchner-Ronne Ice Shelf'):
    assert lookup[name]['class'] == 'shelf' and 50 < lookup[name]['thicknessM'] < 1500
for name in ('North Pole ocean', 'Arctic Ocean', 'Southern Ocean', 'Tibetan Plateau', 'Himalaya'):
    assert lookup[name]['class'] == 'noIce' and lookup[name]['thicknessM'] == 0


def numbers(a):
    return np.round(a[:W*H], 2).tolist()


samples = {'version': 1, 'grid': {'width': W, 'height': H},
           'source': 'GFZ GDEMM2024, 1 arcmin; Greenland BedMachine v5 and Antarctica BedMachine v3 ice thickness and masks',
           'units': 'metres physical ice thickness conditional on ice class; bedrock relative to EIGEN-6C4',
           'coordinateConvention': 'u=(x+.5)/width; v=y/(height-1); north-to-south rows; east-positive longitude',
           'groundedThicknessM': numbers(grounded_thickness), 'shelfThicknessM': numbers(shelf_thickness),
           'bedrockM': [round(float(bed[k]), 2) if ice[k] else None for k in range(W*H)],
           'sourceSurfaceM': [round(float(surface[k]), 2) if ice[k] else None for k in range(W*H)],
           'class': classes[:W*H].tolist(),
           'rawMask': raw_mask[:W*H].tolist(), 'missing': [False]*(W*H),
           'diagnosticValid': ice[:W*H].tolist(),
           'diagnosticNote': 'bedrockM/sourceSurfaceM are product diagnostics only over ice classes; null outside ice means not sampled'}
sample_text = json.dumps(samples, separators=(',', ':'))
(SCENE/'ice-samples.json').write_text(sample_text, encoding='utf8')

# The existing ETOPO surface DAP is already checked and cached by the terrain
# sampler. Compare measured ice surfaces without mixing their geoid datums.
etopo_path = ROOT/'build/earth-relief/etopo-2022-0.1deg.dods'
comparison = None
if etopo_path.exists():
    blob = etopo_path.read_bytes()
    assert digest(blob) == '57c548870890f8eae5f020f9f143038f2c451f239983de4c7b54d6aedb331a8a'
    body = blob.split(b'Data:\n', 1)[1]
    z = np.frombuffer(body, '>f4', 1800*3600, 8).reshape(1800, 3600)
    ex = ((lon+179.99791666666667)/.1) % 3600
    ey = np.clip((lat+89.99791666666667)/.1, 0, 1799)
    ex0, ey0 = np.floor(ex).astype(int), np.floor(ey).astype(int)
    ex1, ey1 = (ex0+1) % 3600, np.minimum(ey0+1, 1799)
    efx, efy = ex-ex0, ey-ey0
    ez = (1-efy)*((1-efx)*z[ey0, ex0]+efx*z[ey0, ex1])+efy*((1-efx)*z[ey1, ex0]+efx*z[ey1, ex1])
    ez = np.where(lat == -90, z[0].mean(), np.where(lat == 90, z[-1].mean(), ez))
    difference = ez[:W*H][ice[:W*H]]-surface[:W*H][ice[:W*H]]
    comparison = {'label': 'ETOPO2022 surface (EGM2008) minus GDEMM2024 SUR (EIGEN-6C4); includes geoid and source differences',
                  'sampleCount': int(len(difference)), 'meanM': round(float(difference.mean()), 2),
                  'minM': round(float(difference.min()), 2), 'maxM': round(float(difference.max()), 2),
                  'rmsM': round(float(np.sqrt(np.mean(difference**2))), 2)}
    for k, check in enumerate(checks, W*H):
        check['etopoSurfaceM'] = round(float(ez[k]), 2)
        if ice[k]: check['etopoMinusProductSurfaceM'] = round(float(ez[k]-surface[k]), 2)

metadata = {'dataset': 'GFZ GDEMM2024', 'version': '2024 original release, 1 arcmin convenience grids',
            'doi': 'https://doi.org/10.5880/GFZ.1.2.2024.002',
            'sourcePage': 'https://dataservices.gfz.de/10.5880/gfz.1.2.2024.002/gdemm2024-30-arcsec-global-digital-elevation',
            'paper': 'https://www.nature.com/articles/s41597-024-03920-x',
            'readmeURL': BASE+'2024-002_Abrykosov-et-al_readme_GDEMM2024.txt',
            'readmeSha256': 'ee498ddf92e7049442290d02268cc5eb5f095a68a4a00b15ff9de1e44aeffa72',
            'accessed': '2026-10-10', 'license': 'CC BY 4.0',
            'citation': 'Abrykosov, Oleh; Ince, E. Sinem; Foerste, Christoph (2024): GDEMM2024: 30 Arcsec Global Digital Elevation Merged Model 2024, a suite for Earth relief. GFZ Data Services. https://doi.org/10.5880/GFZ.1.2.2024.002',
            'horizontalDatum': 'WGS84 (G1150), EPSG:9055, geographic longitude/latitude, pixel as area',
            'verticalDatum': 'EIGEN-6C4 geoid, metres; thickness is a vertical distance independent of geoid zero',
            'originalResolutionArcSeconds': 30, 'downloadResolutionArcSeconds': 60, 'sourceGrid': [WIDTH, HEIGHT],
            'registration': 'area pixels, centres longitude=-180+(column+.5)/60 and latitude=90-(row+.5)/60',
            'sampleGrid': [W, H], 'sampleCoordinates': samples['coordinateConvention'],
            'sourceDataType': 'Int16, little-endian, uncompressed one-row TIFF strips',
            'nodata': {'LTM': -127, 'ICE': -32767, 'BED': -32767, 'SUR': -32767},
            'rawMaskLegend': {'0': 'ocean', '1': 'dry land', '2': 'inland lake', '3': 'ice-covered land', '4': 'ice-covered shelf', '5': 'ice-covered lake (Vostok)'},
            'classification': '3 and 5 -> grounded inventory; 4 -> independent shelf inventory; 0/1/2 -> no imported ice; no seasonal sea ice supplied',
            'sampling': 'nearest categorical mask; same-class-only bilinear ICE/BED/SUR; poles averaged over matching-class source row; missing over ice throws',
            'checksumScope': 'SHA256 applies to every official header and scanline byte range used; entire 445 MiB TIFFs were not downloaded',
            'samplesSha256': digest(sample_text.encode('utf8')),
            'byteRanges': sorted(RANGES.values(), key=lambda x: x['cacheKey']),
            'gridStatistics': {'groundedSamples': int(np.sum(grounded[:W*H])), 'shelfSamples': int(np.sum(shelf[:W*H])),
                               'missingSamples': 0, 'maxGroundedThicknessM': round(float(grounded_thickness[:W*H].max()), 2),
                               'maxShelfThicknessM': round(float(shelf_thickness[:W*H].max()), 2)},
            'surfaceComparison': comparison, 'checks': checks}
(SCENE/'ice-source.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps({key: value for key, value in metadata.items() if key != 'byteRanges'}, ensure_ascii=False, indent=2))
