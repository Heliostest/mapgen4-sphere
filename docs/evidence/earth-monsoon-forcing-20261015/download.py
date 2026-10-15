"""Download public NOAA PSL monthly normals; keep source bytes outside Git."""
import hashlib,json,sys,subprocess
from pathlib import Path
sys.path.insert(0,str(Path('build/earth-seaice-causal/geo-libs').resolve()))
import netCDF4 as nc

OUT=Path('build/earth-monsoon-forcing/raw');OUT.mkdir(parents=True,exist_ok=True)
EVIDENCE=Path('docs/evidence/earth-monsoon-forcing-20261015')
BASE='https://downloads.psl.noaa.gov/Datasets/ncep.reanalysis.derived/'
VARIABLES={'surface_gauss':['air.2m','skt.sfc','uwnd.10m','vwnd.10m','pres.sfc'],
           'pressure':['uwnd','vwnd','shum']}
records=[]
for directory,names in VARIABLES.items():
    for name in names:
        filename=name+'.mon.ltm.1991-2020.nc';url=BASE+directory+'/'+filename;path=OUT/filename
        if not path.exists():
            pending=path.with_suffix('.partial')
            subprocess.run(['curl','--silent','--show-error','--fail','--location','--retry','2',
                            '--retry-delay','5','--connect-timeout','20','--max-time','120',
                            '-o',str(pending),url],check=True)
            # Reject error pages or truncated data before accepting the cache.
            with nc.Dataset(pending) as ds:assert len(ds.dimensions['time'])==12
            pending.replace(path)
        with nc.Dataset(path) as ds:
            var=ds[name.split('.')[0]]
            assert ds['time'].climo_period=='1991/01/01 - 2020/12/31'
            record={'name':name,'url':url,'path':str(path).replace('\\','/'),'bytes':path.stat().st_size,
                    'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'variable':var.name,
                    'units':var.units,'shape':list(var.shape),'dimensions':list(var.dimensions),
                    'period':ds['time'].climo_period,'title':getattr(ds,'title',''),
                    'minimumValidYears':int(ds['valid_yr_count'][:].min()) if 'valid_yr_count' in ds.variables else None}
        records.append(record);print(name,record['shape'],record['units'],flush=True)
manifest={'product':'NCEP-NCAR Reanalysis 1, monthly climatological means',
          'provider':'NOAA PSL, Boulder, Colorado, USA','accessDate':'2026-10-15',
          'documentation':'https://psl.noaa.gov/data/gridded/data.ncep.reanalysis.html',
          'period':[1991,2020],'files':records}
target=EVIDENCE/'inputs.json'
if target.exists():assert json.loads(target.read_text())==manifest,'Input archive changed; use a new evidence directory'
else:target.write_text(json.dumps(manifest,indent=2)+'\n')
