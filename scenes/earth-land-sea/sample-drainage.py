"""Sample HydroBASINS closed catchments on the exact Earth triangle mesh.

Only the integer catchment labels and terminal-sub-basin membership are shipped.
The original GIS archives remain an ignored build cache. Requires numpy and curl.
Run make-world.ts --coordinates first; --check compares the committed sample.
"""
import argparse
import hashlib
import json
import shutil
import struct
import subprocess
import urllib.request
import zipfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SCENE = ROOT / 'scenes/earth-land-sea'
CACHE = ROOT / 'build/earth-relief/drainage'
BASE = 'https://data.hydrosheds.org/file/hydrobasins/standard/'
# Exact official level-4 standard archives; pinned after checking the download.
SOURCES = {
    'af': '60c84487460d4e5113408a66e5daed79a3089de4ebd9b5f9ef320417a2e8e6cd',
    'ar': 'b2e1c46b1391ed7acf9b1b3ad448c6334548df6d13ca0e860c34a39dead16878',
    'as': '1c14c471cbf0cd7620fded95ee134e88fd787504da3ac54b36ccc994b5466804',
    'au': 'e5b3d47c5832ae2e31fdf72862738c6f98043519beba6559cf41355b0ac8b394',
    'eu': '7262467d58647eb339bb8af4046433f4827e9b32ed4fa81bb3954b4c7dd2e938',
    'gr': 'e5d1ea6b1e499556b9d49f89cd6612074ceab236769662073d922708ef4afb9e',
    'na': '071aaed3095c3459bf95dbf77f299d3ea42c811cf222e3c72413dc293a8fbe57',
    'sa': '669cc29224ea8a8b5b85508884de2a9e6d7436f71bcbc3a93794343b201675dc',
    'si': 'a83518285c0662ac03055c23b3fa67c9e165c9fc8186e3ddaf81a9d4aadfda7d',
}
LAKES_URL = 'https://naturalearth.s3.amazonaws.com/50m_physical/ne_50m_lakes.zip'
LAKES_SHA = 'f28d42c286d96b57a17aac2cbeb432f8c65532c20063495711fbc64e24666df3'


def dbf_records(data):
    count, header_size, record_size = struct.unpack_from('<IHH', data, 4)
    fields, offset = [], 1
    for start in range(32, header_size - 1, 32):
        field = data[start:start + 32]
        if field[0] == 13:
            break
        name = field[:11].split(b'\0')[0].decode('ascii').upper()
        fields.append((name, offset, field[16]))
        offset += field[16]
    assert offset == record_size
    records = []
    for i in range(count):
        record = data[header_size + i * record_size:header_size + (i + 1) * record_size]
        assert len(record) == record_size and record[0] == 32, 'Deleted/truncated DBF record'
        records.append({name: record[start:start + length].decode('utf-8', errors='replace').strip()
                        for name, start, length in fields})
    return records


def shp_records(data):
    assert struct.unpack_from('>i', data)[0] == 9994
    assert struct.unpack_from('>i', data, 24)[0] * 2 == len(data)
    assert struct.unpack_from('<ii', data, 28) == (1000, 5)
    offset, records = 100, []
    while offset < len(data):
        number, words = struct.unpack_from('>ii', data, offset)
        record = data[offset + 8:offset + 8 + words * 2]
        offset += 8 + words * 2
        assert number == len(records) + 1 and struct.unpack_from('<i', record)[0] == 5
        bounds = struct.unpack_from('<dddd', record, 4)
        parts, count = struct.unpack_from('<ii', record, 36)
        starts = list(struct.unpack_from('<' + 'i' * parts, record, 44)) + [count]
        points = np.frombuffer(record, dtype='<f8', count=count * 2,
                               offset=44 + parts * 4).reshape(-1, 2)
        assert np.isfinite(points).all()
        rings = [points[a:b] for a, b in zip(starts, starts[1:])]
        assert all(len(r) >= 4 and np.array_equal(r[0], r[-1]) for r in rings)
        records.append((bounds, rings))
    assert offset == len(data)
    return records


def inside_polygon(longitude, latitude, rings):
    """Even/odd point-in-polygon includes holes, using exact mesh latitudes."""
    result = np.zeros(len(longitude), dtype=bool)
    # Work in bounded point batches so large basin outlines cannot allocate an
    # unbounded points x edges matrix. Horizontal edges never cross the ray.
    edges = np.concatenate([np.column_stack((r[:-1], r[1:])) for r in rings])
    x0, y0, x1, y1 = edges.T
    active = y0 != y1
    x0, y0, x1, y1 = x0[active], y0[active], x1[active], y1[active]
    batch = max(1, min(128, 1_000_000 // max(1, len(x0))))
    for start in range(0, len(longitude), batch):
        y, x = latitude[start:start + batch, None], longitude[start:start + batch, None]
        crosses = ((y0 > y) != (y1 > y)) & (x < x0 + (y - y0) * (x1 - x0) / (y1 - y0))
        result[start:start + batch] = np.count_nonzero(crosses, axis=1) % 2 == 1
    return result


def fetch_archive(name, url, sha):
    path = CACHE / name
    if not path.exists():
        partial = path.with_suffix('.part')
        curl = shutil.which('curl.exe') or shutil.which('curl')
        if curl:
            subprocess.run([curl, '--fail', '--silent', '--show-error', '--location',
                            '--max-time', '120', '--max-filesize', '40000000',
                            url, '--output', str(partial)], check=True)
        else:
            with urllib.request.urlopen(url, timeout=120) as response:
                blob = response.read(40_000_001)
            assert len(blob) <= 40_000_000, 'Unexpected source archive size'
            partial.write_bytes(blob)
        assert hashlib.sha256(partial.read_bytes()).hexdigest() == sha, (
            f'{name} checksum changed; inspect the upstream dataset before regenerating')
        partial.replace(path)
    blob = path.read_bytes()
    assert hashlib.sha256(blob).hexdigest() == sha, (
        f'{name} checksum changed; inspect the upstream dataset before regenerating')
    return path, len(blob)


def download(region):
    name = f'hybas_{region}_lev04_v1c.zip'
    path, size = fetch_archive(name, BASE + name, SOURCES[region])
    with zipfile.ZipFile(path) as package:
        stem = f'hybas_{region}_lev04_v1c'
        attributes = dbf_records(package.read(stem + '.dbf'))
        polygons = shp_records(package.read(stem + '.shp'))
        projection = package.read(stem + '.prj').decode('ascii').strip()
    assert 'WGS_1984' in projection and len(attributes) == len(polygons)
    return list(zip(attributes, polygons)), size, projection


def sample_inland_lakes(identity, longitude, latitude, heights):
    neighbors_file = json.loads((ROOT / 'build/earth-relief/mesh-neighbors.json').read_text(encoding='utf-8'))
    assert neighbors_file['mesh'] == identity, 'Lake adjacency mesh mismatch'
    neighbors = np.asarray(neighbors_file['neighbors'], dtype=np.int32).reshape(-1, 3)
    assert neighbors.shape == (identity['triangles'], 3)
    assert neighbors.min() >= 0 and neighbors.max() < len(heights)
    path, size = fetch_archive('ne_50m_lakes.zip', LAKES_URL, LAKES_SHA)
    with zipfile.ZipFile(path) as package:
        attributes = dbf_records(package.read('ne_50m_lakes.dbf'))
        polygons = shp_records(package.read('ne_50m_lakes.shp'))
        lake_version = package.read('ne_50m_lakes.VERSION.txt').decode('utf-8').strip()
        projection = package.read('ne_50m_lakes.prj').decode('ascii').strip()
    assert lake_version == '5.0.0' and 'WGS_1984' in projection
    assert len(attributes) == len(polygons)
    negative = heights <= 0
    candidates = np.zeros(len(heights), dtype=np.int32)
    features = []

    def add_polygon(bounds, rings, source, scanline=False):
        xmin, ymin, xmax, ymax = bounds
        assert xmax - xmin <= 180
        rows = np.round(latitude * 10) / 10 if scanline else latitude
        eligible = np.flatnonzero(negative & (longitude >= xmin) & (longitude <= xmax)
                                  & (rows >= ymin) & (rows <= ymax))
        matches = eligible[inside_polygon(longitude[eligible], rows[eligible], rings)]
        if len(matches):
            features.append(source)
            candidates[matches] = len(features)

    for attributes, (bounds, rings) in sorted(zip(attributes, polygons), key=lambda pair: int(pair[0]['NE_ID'])):
        if attributes['FEATURECLA'] in ('Lake', 'Alkaline Lake'):
            add_polygon(bounds, rings, {'source': 'ne_50m_lakes', 'sourceId': int(attributes['NE_ID']),
                                       'name': attributes['NAME'], 'featureClass': attributes['FEATURECLA']})
    land_source = json.loads((SCENE / 'source.json').read_text(encoding='utf-8'))
    land_path = ROOT / 'build/earth-land-sea/ne_50m_land.zip'
    if not land_path.exists():
        cached, _ = fetch_archive('ne_50m_land.zip', land_source['sourceURL'], land_source['archiveSha256'])
        land_path = cached
    assert hashlib.sha256(land_path.read_bytes()).hexdigest() == land_source['archiveSha256']
    with zipfile.ZipFile(land_path) as package:
        land_polygons = shp_records(package.read('ne_50m_land.shp'))
    hole_index = 0
    for _, rings in land_polygons:
        for ring in rings:
            signed_area = .5 * np.sum(ring[:-1, 0] * ring[1:, 1] - ring[1:, 0] * ring[:-1, 1])
            if signed_area > 0:  # ESRI polygon interior rings run counterclockwise.
                hole_index += 1
                bounds = (float(ring[:, 0].min()), float(ring[:, 1].min()),
                          float(ring[:, 0].max()), float(ring[:, 1].max()))
                add_polygon(bounds, [ring], {'source': 'ne_50m_land interior ring', 'sourceId': hole_index,
                                            'name': '', 'featureClass': 'enclosed water hole'}, scanline=True)
    components, visited = [], np.zeros(len(heights), dtype=bool)
    for seed in np.flatnonzero(negative):
        if visited[seed]:
            continue
        component = [int(seed)]
        visited[seed] = True
        for t in component:
            for to in neighbors[t]:
                if negative[to] and not visited[to]:
                    visited[to] = True
                    component.append(int(to))
        components.append(np.asarray(component, dtype=np.int32))
    ocean = max(range(len(components)), key=lambda i: len(components[i])) if components else -1
    ids, lakes, rejected = np.zeros(len(heights), dtype=np.int32), [], []
    for i, component in enumerate(components):
        matches = np.unique(candidates[component])
        confirmed = [int(k) for k in matches if k > 0]
        if not confirmed:
            continue
        reason = 'connected to the main ocean component' if i == ocean else (
            'negative component extends outside the confirmed lake/hole polygon' if 0 in matches else '')
        if reason:
            rejected.append({'componentSeed': int(component[0]), 'triangles': len(component), 'reason': reason})
            continue
        lake_id = len(lakes) + 1
        ids[component] = lake_id
        lakes.append({'id': lake_id, 'triangleCount': len(component), 'componentSeed': int(component[0]),
                      'sourceFeatures': [features[k - 1] for k in confirmed]})
    return ids, lakes, {
        'dataset': 'Natural Earth 1:50m Lakes + Reservoirs v5.0.0 and existing Land interior rings',
        'lakeSourcePage': 'https://www.naturalearthdata.com/downloads/50m-physical-vectors/50m-lakes-reservoirs/',
        'lakeSourceURL': LAKES_URL, 'lakeSha256': LAKES_SHA, 'lakeSourceBytes': size,
        'landSourceURL': land_source['sourceURL'], 'landSha256': land_source['archiveSha256'],
        'landVersion': land_source.get('version'), 'coastlineExplanation': 'https://www.naturalearthdata.com/downloads/50m-physical-vectors/50m-coastline/',
        'license': 'Public domain', 'licenseURL': 'https://www.naturalearthdata.com/about/terms-of-use/',
        'projection': 'WGS84 geographic longitude/latitude',
        'method': 'Negative-height triangle connected components are accepted only when every member is inside a non-reservoir Lake/Alkaline Lake polygon or an interior land ring and the component is not connected to the main ocean. Interior rings use the existing coastline 0.1-degree latitude scanline so the classification matches the imported coastline. No place-name or coordinate exceptions.',
        'negativeComponents': len(components), 'confirmedLakeTriangles': int(np.count_nonzero(ids)),
        'confirmedLakes': lakes, 'rejectedComponents': rejected,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    mesh = json.loads((ROOT / 'build/earth-relief/mesh.json').read_text(encoding='utf-8'))
    elevation = json.loads((SCENE / 'elevation-samples.json').read_text(encoding='utf-8'))
    assert mesh['mesh'] == elevation['mesh'], 'Drainage/elevation mesh mismatch'
    identity = mesh['mesh']
    n = identity['triangles']
    xyz = np.asarray(mesh['xyz'], dtype=float).reshape(-1, 3)
    assert len(xyz) == n
    latitude = np.degrees(np.arcsin(xyz[:, 1] / np.linalg.norm(xyz, axis=1)))
    longitude = np.degrees(np.arctan2(xyz[:, 0], xyz[:, 2]))
    source_sink = np.zeros(n, dtype=np.int64)
    terminal = np.zeros(n, dtype=np.uint8)
    records_by_sink, archives, endo_polygon_count = {}, [], 0
    for region in SOURCES:
        records, size, projection = download(region)
        selected = 0
        for attributes, (bounds, rings) in records:
            endo = int(attributes['ENDO'])
            if endo == 0:
                continue
            selected += 1
            sink = int(attributes['NEXT_SINK'])
            basin = int(attributes['HYBAS_ID'])
            assert endo in (1, 2) and sink > 0
            entry = records_by_sink.setdefault(sink, {'sourceNextSink': sink, 'terminalBasinIds': [],
                                                     'sourceRegions': [], 'sourcePolygonCount': 0})
            entry['sourcePolygonCount'] += 1
            if region not in entry['sourceRegions']:
                entry['sourceRegions'].append(region)
            if endo == 2:
                entry['terminalBasinIds'].append(basin)
            xmin, ymin, xmax, ymax = bounds
            assert xmax - xmin <= 180, 'A closed polygon crosses the antimeridian; split before sampling'
            candidates = np.flatnonzero((longitude >= xmin) & (longitude <= xmax)
                                        & (latitude >= ymin) & (latitude <= ymax))
            matches = candidates[inside_polygon(longitude[candidates], latitude[candidates], rings)]
            assert np.all((source_sink[matches] == 0) | (source_sink[matches] == sink)), 'Overlapping closed groups'
            source_sink[matches] = sink
            if endo == 2:
                terminal[matches] = 1
        endo_polygon_count += selected
        archives.append({'region': region, 'url': BASE + f'hybas_{region}_lev04_v1c.zip',
                         'bytes': size, 'sha256': SOURCES[region], 'polygonCount': len(records),
                         'closedPolygonCount': selected, 'projectionWkt': projection})
    represented = sorted(int(sink) for sink in np.unique(source_sink) if sink > 0)
    labels = np.zeros(n, dtype=np.int32)
    groups = []
    for group_id, sink in enumerate(represented, 1):
        selected = source_sink == sink
        labels[selected] = group_id
        group = {'id': group_id, **records_by_sink[sink], 'sampledTriangleCount': int(selected.sum()),
                 'terminalTriangleCount': int(terminal[selected].sum())}
        assert group['terminalBasinIds'], 'NEXT_SINK has no Endo=2 record in the global source'
        groups.append(group)
    inland_lake_id, inland_lakes, lake_metadata = sample_inland_lakes(
        identity, longitude, latitude, np.asarray(elevation['heightsM']))
    sample = {'version': 1, 'mesh': identity, 'basinId': labels.tolist(),
              'terminal': terminal.tolist(), 'groups': groups,
              'inlandLakeId': inland_lake_id.tolist(), 'inlandLakes': inland_lakes}
    encoded = json.dumps(sample, separators=(',', ':')).encode()
    metadata = {
        'dataset': 'HydroBASINS standard, level 4, version 1.c',
        'sourcePage': 'https://www.hydrosheds.org/products/hydrobasins',
        'technicalDocumentation': 'https://data.hydrosheds.org/file/technical-documentation/HydroBASINS_TechDoc_v1c.pdf',
        'license': 'HydroSHEDS version 1 license; free scientific, educational and commercial use; source archives are not redistributed',
        'licenseURL': 'https://data.hydrosheds.org/file/technical-documentation/HydroSHEDS_TechDoc_v1_4.pdf',
        'attribution': 'HydroBASINS: Lehner, B. and Grill, G. (2013), Hydrological Processes 27(15), 2171–2186; data available at www.hydrosheds.org; copyright World Wildlife Fund, Inc.',
        'dataRights': 'HydroSHEDS/HydroBASINS source rights remain under the linked license, including its incorporated-derivative distribution, attribution, end-user protection and no-standalone-GIS conditions; this application-specific mesh sample is not licensed as an unrestricted standalone HydroBASINS product.',
        'copyrightNotice': 'This product mapgen4-sphere incorporates HydroSHEDS version 1 data, copyright World Wildlife Fund, Inc. (2006–2022), used under license.',
        'sourceDisclaimer': 'WWF未评估本应用修改并纳入的数据，不对其准确性、完整性、时效性或特定用途适用性作保证。原HydroSHEDS v1部分数据权益属于USGS、NASA、ESRI、CIAT、UNEP-WCMC、WWF、澳大利亚联邦以及英国王室；详见原许可附录B。',
        'accessed': '2026-10-11', 'sourceVersionDate': '2014-07',
        'projection': 'Geographic longitude/latitude, WGS84', 'underlyingResolutionArcSeconds': 15,
        'sampling': 'Exact triangle-centre point-in-polygon, even/odd rings including holes; includes enclosed lake triangles despite negative ETOPO/coastline sign; no DEM height, sill, water store or channel is changed by sampling',
        'fields': {'basinId': '0 outside closed catchments; positive Int32 label grouped by NEXT_SINK, mapped in groups',
                   'terminal': '1 inside an ENDO=2 sink sub-basin, not an observed lake shoreline or water-level seed',
                   'inlandLakeId': '0 outside confirmed enclosed negative-height lake components; positive Int32 labels mapped in inlandLakes'},
        'termination': 'ENDO=1/2 classify closed catchments; ENDO=2 terminates reference routing even when NEXT_DOWN is a virtual connection; NEXT_SINK keeps independently closed sub-catchments separate',
        'mesh': identity, 'sampleSha256': hashlib.sha256(encoded).hexdigest(),
        'sampledClosedTriangles': int(np.count_nonzero(labels)), 'sampledTerminalTriangles': int(terminal.sum()),
        'negativeElevationClosedTriangles': int(np.count_nonzero((labels > 0) & (np.asarray(elevation['heightsM']) <= 0))),
        'representedClosedGroups': len(groups), 'sourceClosedGroups': len(records_by_sink),
        'sourceClosedPolygons': endo_polygon_count, 'archives': archives,
        'inlandLakeSource': lake_metadata,
        'limitations': [
            'HydroBASINS and ETOPO are different DEM lineages; polygons supply closed-catchment identity, not a replacement height or a physical outlet.',
            'Level 4 can omit small nested closed catchments; source polygons smaller than the mesh may have no triangle-centre sample.',
            'The ETOPO 15-second source is sampled at 0.1 degrees, then on 215348 sphere triangles; physical catchment/outlet compatibility must be validated on the actual mesh.',
            'Earth import floors below-sea-level land to +1 m to preserve the coastline sign convention; Lake Eyre and low Caspian shore land remain unresolved, while existing negative Caspian bathymetry is retained.',
            'ENDO=2 marks a sink sub-basin area, not an exact sink point, lake level, storage volume, evaporation rate or calibration.',
            'No observational lake water level is imported, and no initial water is added by this file.',
            'HydroSHEDS source quality north of 60N is lower; Antarctica is outside the source coverage.',
        ],
    }
    sample_path, source_path = SCENE / 'drainage-samples.json', SCENE / 'drainage-source.json'
    if args.check:
        assert sample_path.read_bytes() == encoded, 'Committed drainage sample differs from source regeneration'
        assert json.loads(source_path.read_text(encoding='utf-8')) == metadata, 'Committed drainage provenance differs'
    else:
        sample_path.write_bytes(encoded)
        source_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'check': args.check, 'sourceBytes': sum(a['bytes'] for a in archives),
                      'closedTriangles': metadata['sampledClosedTriangles'],
                      'terminalTriangles': metadata['sampledTerminalTriangles'],
                      'closedGroups': len(groups), 'sampleSha256': metadata['sampleSha256']}, indent=2))


if __name__ == '__main__':
    main()
