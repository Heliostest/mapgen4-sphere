# C10 positive graph-metric refinement

Read protocol.md for the construction and predeclared gates, report.md for
results and limitations. C10 retains every edge and reuses frozen C8/C9
dynamics with different fixed positive conductances. It is not the default.

Before sealing, use a new name for every run. Existing Julia and Python
runtimes are selected by run.mjs. Python scientific libraries are the
existing build/earth-polar-pressure/python-libs installation; the fitter
introduces no new package. Set PYTHONDONTWRITEBYTECODE=1 for Python commands.

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
node docs/evidence/earth-metric-moments-20261014/run.mjs docs/evidence/earth-metric-moments-20261014/fit-run.py c10-replay-fit-48-01 48
```

The canonical graphs are c10-fit-24/48/96-v1-graph.json. Bind every generated
graph read by a Julia run using semicolon-separated VC_INPUT_FILES. Native
runs use the 48-ring graph plus VC_DT, VC_CASES and VC_RESTART. Clear unrelated
VC_* variables first. compare-time.jl takes four native run names in
1800/900/450/225 order and requires all JSON/final.bin plus graph inputs bound.

After sealing, run.mjs and seal.mjs refuse another mutation. Verify exact
filesystem and Git bytes with:

```powershell
node docs/evidence/earth-metric-moments-20261014/verify-seal.mjs EXPECTED_SHA HEAD
```

Archive exploratory files are historical probes, not source-bound acceptance
runs. Canonical source archives/raw statuses distinguish no-op RED and selected
successful runs. Review scripts retain their original build/c10-independent-review
paths; restore archived bytes to those paths before replay. Check hashes
before restoring graph/raw inputs. Runtime executables are not content-pinned;
bitwise restart claims apply to the recorded environment.
