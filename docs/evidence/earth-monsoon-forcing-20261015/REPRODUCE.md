# Reproduce the exploratory monsoon forcing diagnosis

Run commands from the repository root. Production files and the formal Earth save
are not edited. Node dependencies are the repository's existing dependencies;
Python needs NumPy, netCDF4 and Matplotlib. Scripts first try the existing local
dependency directories, then normal Python imports. Chinese plot labels use
`C:/Windows/Fonts/msyh.ttc` (choose an installed CJK font on other systems).

## Re-run the exact archived program

```powershell
node docs/evidence/earth-monsoon-forcing-20261015/run.mjs --archived
```

This decompresses `audit.mjs.gz`, prints its SHA-256 and runs the six independent
profiles. Results go to ignored `build/earth-monsoon-forcing/`, not this evidence
directory. The archived `forcing.json.gz` contains the exact remapped fields; no
download or observation credentials are needed. Add profile names after
`--archived` to run a subset. Up to six Node processes run concurrently.

Results contain raw monthly grid diagnostics compressed as `*-grid.json.gz` and
13 matched-support regional summaries as `*.json`. Preserve the corresponding
bundle hash if running newly built code. Ordinary runtime snapshots do not encode
the external forcing; these are scientific run outputs, not production saves.

## Rebuild input fields from public source data

```powershell
python docs/evidence/earth-monsoon-forcing-20261015/download.py
python docs/evidence/earth-monsoon-forcing-20261015/test_remap.py
python docs/evidence/earth-monsoon-forcing-20261015/derive.py
node --experimental-strip-types docs/evidence/earth-monsoon-forcing-20261015/test-forcing.ts
```

The download script verifies NetCDF readability, source period and dimensions;
the derivation verifies every frozen input hash, valid-year counts, units and
masks. It refuses to replace the archived forcing with different derived bytes.
Downloads are stored only in `build/earth-monsoon-forcing/raw`. NOAA PSL provides
the data at the URLs in `inputs.json`. THREDDS returned HTTP 429 during discovery;
the publicly listed NOAA download archive was accessible.

## Build a new experimental program

```powershell
node node_modules/esbuild/bin/esbuild docs/evidence/earth-monsoon-forcing-20261015/audit.ts --bundle --platform=node --format=esm --outfile=build/earth-monsoon-forcing/audit.mjs
node docs/evidence/earth-monsoon-forcing-20261015/run.mjs
```

Do not replace that bundle while its runs are active. New source revisions should
use a fresh evidence directory. `analyze.py` reads only archived results here;
`verify.py` checks source/bundle hashes, identical stocks, exact baseline rainfall
and common diagnostics, water/heat/routing ledgers, monthly coverage, precipitation
components and supports. Its manifest seals the evidence and rejects later changes.

```powershell
python docs/evidence/earth-monsoon-forcing-20261015/analyze.py
python docs/evidence/earth-monsoon-forcing-20261015/verify.py
```

## Prechecks that changed the experiment

The first, incomplete integrations were stopped rather than used as results:

1. A midpoint pressure quadrature incorrectly used a below-ground pressure sample
   for the above-ground part of an intersected layer. At surface pressure 800 hPa
   it used the 850 hPa value. The corrected implementation assigns zero weight to
   all underground samples and extends the lowest valid level (700 hPa in this
   example) to the surface. A regression test and an independent review checked it.
2. Prescribing cold sea-ice skin temperatures to the model's liquid mixed layer
   produced repeated freezing and excessive external cooling (about −344 W/m²
   over the first 180 days). The corrected observation operator uses the model
   freezing point as the lower bound of the liquid-ocean target. This does not
   turn skin temperature into a validated SST product.

The final six integrations all start again from day zero with the same corrected
forcing archive and program. The counterfactual is global and coupled: wind changes
evaporation and ocean heat transport as well as vapor advection. Energy from thermal
relaxation is external and fully reported. `externalAbsJm2` accumulates the absolute
**net per-cell** imposed sensible-energy change, after summing reservoirs; it is not
the sum of absolute heating and cooling in each individual reservoir.
