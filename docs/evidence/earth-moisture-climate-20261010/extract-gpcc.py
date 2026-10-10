"""Read the pinned official GPCC classic NetCDF using Python's standard library.

Run from repository root: python docs/evidence/earth-moisture-climate-20261010/extract-gpcc.py
This only generates observational evidence; it never changes model state.
"""
import gzip
import hashlib
import json
import math
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'gpcc-normals-1991-2020-v2022-2p5.nc.gz'
URL = 'https://opendata.dwd.de/climate_environment/GPCC/gpcc_normals_v2022/normals_1991_2020_v2022_25.nc.gz'
data = gzip.decompress(SOURCE.read_bytes())
assert data[:4] == b'CDF\x01', 'Expected classic NetCDF CDF-1'
position = 4
types = {1: ('b', 1), 2: ('c', 1), 3: ('h', 2), 4: ('i', 4), 5: ('f', 4), 6: ('d', 8)}

def uint():
    global position
    value = struct.unpack_from('>I', data, position)[0]
    position += 4
    return value

def name():
    global position
    size = uint()
    result = data[position:position + size].decode('utf-8')
    position += (size + 3) // 4 * 4
    return result

def attributes():
    global position
    tag, count = uint(), uint()
    assert tag in (0, 12)
    result = {}
    for _ in range(count):
        key, kind, size = name(), uint(), uint()
        code, item_size = types[kind]
        raw = data[position:position + size * item_size]
        values = struct.unpack('>' + code * size, raw)
        result[key] = raw.decode('utf-8') if kind == 2 else (values[0] if size == 1 else list(values))
        position += (size * item_size + 3) // 4 * 4
    return result

records = uint()
tag, count = uint(), uint()
assert tag == 10
dimensions = []
for _ in range(count):
    dimensions.append((name(), uint()))
global_attributes = attributes()
tag, count = uint(), uint()
assert tag == 11
variables = {}
for _ in range(count):
    key = name()
    dims = [uint() for _ in range(uint())]
    attrs = attributes()
    kind, size, begin = uint(), uint(), uint()
    variables[key] = {'dimensions': dims, 'attributes': attrs, 'kind': kind, 'size': size, 'begin': begin}
record_size = sum(v['size'] for v in variables.values() if v['dimensions'] and dimensions[v['dimensions'][0]][1] == 0)

def values(key, record=0):
    v = variables[key]
    dims = v['dimensions']
    is_record = bool(dims and dimensions[dims[0]][1] == 0)
    count = math.prod(dimensions[d][1] for d in dims[1:] if is_record) if is_record else math.prod(dimensions[d][1] for d in dims)
    code, item_size = types[v['kind']]
    start = v['begin'] + (record * record_size if is_record else 0)
    return struct.unpack_from('>' + code * count, data, start)

lat, lon = values('lat'), values('lon')
assert records == 12 and len(lat) == 72 and len(lon) == 144
probes = [
    ('Amazon / Manaus control', -3, -60), ('Congo central rainforest', 0, 23),
    ('Sahara central', 24, 15), ('Sahel', 13, 10),
    ('Western Eurasia', 50, 30), ('Central Eurasia', 45, 75), ('East Asian monsoon / Beijing', 40, 116),
    ('India interior', 22, 78), ('Himalaya south foot', 27, 86), ('Tibet interior', 33, 88),
    ('Andes eastern slope', -12, -71), ('Atacama interior', -24, -69),
    ('Australia interior', -25, 134), ('Australia east coast', -30, 152),
    ('Australia north', -15, 133), ('Australia south', -34, 138), ('Australia southwest', -32, 116),
]
samples = []
for label, latitude, longitude in probes:
    row = min(range(len(lat)), key=lambda i: abs(lat[i] - latitude))
    col = min(range(len(lon)), key=lambda i: abs(lon[i] - longitude))
    index = row * len(lon) + col
    monthly = [values('precip', month)[index] for month in range(12)]
    assert all(math.isfinite(v) and v >= 0 for v in monthly), (label, monthly)
    seasonal = {season: sum(monthly[i] for i in indices) for season, indices in {'DJF': (11, 0, 1), 'MAM': (2, 3, 4), 'JJA': (5, 6, 7), 'SON': (8, 9, 10)}.items()}
    sample = {'name': label, 'requestedLat': latitude, 'requestedLon': longitude,
              'observationalCellLat': lat[row], 'observationalCellLon': lon[col],
              'annualMm': sum(monthly), 'monthlyMmJanToDec': monthly, 'seasonalMm': seasonal}
    for key in ['numgauge', 'interpolation_error', 'gpcc_systematic_gauge_error']:
        if key in variables:
            sample[key + 'JanToDec'] = [values(key, month)[index] for month in range(12)]
    samples.append(sample)
result = {'product': 'GPCC Climatology Version 2022; normals 1991-2020; 2.5 degrees',
          'sourceUrl': URL, 'doi': '10.5676/DWD_GPCC/CLIM_M_V2022_250',
          'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
          'method': 'Nearest 2.5 degree observational land grid cell. No interpolation or model calibration.',
          'dimensions': dimensions, 'globalAttributes': global_attributes,
          'variableAttributes': {key: v['attributes'] for key, v in variables.items()}, 'probes': samples}
(ROOT / 'gpcc-observations.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
for sample in samples:
    s = sample['seasonalMm']
    print(f"{sample['name']}: {sample['annualMm']:.1f} mm/year; DJF/MAM/JJA/SON {s['DJF']:.1f}/{s['MAM']:.1f}/{s['JJA']:.1f}/{s['SON']:.1f}")
