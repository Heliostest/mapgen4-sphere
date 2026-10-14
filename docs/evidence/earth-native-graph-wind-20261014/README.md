# C4 native graph-wind experiment

Read [report.md](report.md) for results and limits, [protocol.md](protocol.md)
for the import contract, and [verification.json](verification.json) for the
selected runs. The directory becomes immutable when `manifest.json` is sealed.
It does not change the application climate model.

## Files and execution

- `graph-wind.jl`: native pressure-weighted east/north samples to C3 momentum;
  diagnostic kinetic-metric Hodge decomposition.
- `common.jl`: frozen C1/C2 includes and C3 graph identity checks.
- `test-import.jl`, `test-covariance.jl`: signs, units, frame covariance, shape
  validation, input preservation and graph cycle retention.
- `analytic-fields.jl`: independent continuum divergence on 24/48/96-ring graphs.
- `native-run.jl`: explicit fixed-time-step native pressure/water runs and
  independent acoustic final reference; optional rebuilt-core four-step restart.
- `rotation.jl`: imported prescribed graph flux and shared air/tracer rotation.
- `compare-time.jl`: compare four native real-humidity final states on one grid.
- `run.mjs`: unique run reservation, source snapshots, immutable input/output
  hashing, log and exit-status capture (including failed runs).
- `source-bindings.mjs`: seal only the selected script/include closure that was
  actually tested; `test-source-bindings.mjs` exercises stale-source rejection.
- `check-frozen.mjs`, `seal.mjs`: frozen evidence and selected numerical gates.

Run from the repository root. The runner uses Julia 1.12.7, the existing
`docs/evidence/earth-speedyweather-20261012/julia-env` project and
`build/earth-speedyweather/depot`. Julia has two threads, BLAS one. Dense modal
preparation and sparse tracer LU are experimental implementation costs.

Every attempt needs a fresh run name. Existing results are never overwritten.
For example, in PowerShell:

```powershell
node docs/evidence/earth-native-graph-wind-20261014/run.mjs docs/evidence/earth-native-graph-wind-20261014/test-import.jl c4-replay-import-01
$env:WIND_DT = '900'
$env:WIND_CASES = 'real'
$env:WIND_RESTART = 'false'
node docs/evidence/earth-native-graph-wind-20261014/run.mjs docs/evidence/earth-native-graph-wind-20261014/native-run.jl c4-replay-native-900-01
```

For analytic/rotation runs, declare all three consumed graph JSON paths in
`WIND_INPUT_FILES`, separated by semicolons. They are
`build/earth-native-graph-wind/c4-graphs-v1-{24,48,96}-graph.json`.
They are exported without refitting from the SHA-bound C3 NPZ files.
For `compare-time.jl`, supply the four run names in 1800/900/450/225 order and
declare each result JSON and `-real-final.bin` file in `WIND_INPUT_FILES`.
The runner binds the frozen native/C3/Julia project inputs automatically.
Clear unrelated `WIND_*` variables before each experiment.

`raw/` holds portable output/log/status copies. `raw/inputs/` holds the native
input binary, its metadata and original geometry. Restore copies to their
declared original build paths only when missing; verify an existing file's
SHA instead of overwriting it. `verification.json` maps portable input copies.
C3 NPZ/audit/graph copies remain in the frozen C3 directory. Runtime binaries,
Python/BLAS binaries and a clean machine's package installation are not bundled.

Earlier failed-attempt source bytes are retained under `source-archives/<sha>/`.
Use those snapshots when examining failures; current source contains the fixes.
`step!` commits a full state atomically. No stronger transaction promise is made
for the inherited adaptive `advance!`, which this experiment does not call.
