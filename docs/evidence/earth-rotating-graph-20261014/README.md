# C5 rotating graph experiment

Read report.md for results/limitations, protocol.md for the predeclared gates,
code-review.md for the outstanding independent review, selected-runs.json for
accepted runs, and verification.json/manifest.json for byte bindings.

Run from the repository root. Existing Julia 1.12.7 lives at
build/earth-speedyweather/runtime/julia-1.12.7/bin/julia.exe, project at
docs/evidence/earth-speedyweather-20261012/julia-env, depot under
build/earth-speedyweather/depot. The runner fixes Julia threads2 and BLAS1.
No package/dependency changes are needed.

Every execution reserves a fresh unique run name. These are the pre-seal
invocations used during development; after sealing, set up a new evidence
directory and runner first, rather than executing against this sealed folder:

```powershell
node docs/evidence/earth-rotating-graph-20261014/run.mjs docs/evidence/earth-rotating-graph-20261014/test-operator.jl c5-replay-operator-01
$env:ROT_DT='900'
$env:ROT_CASES='real'
$env:ROT_RESTART='false'
node docs/evidence/earth-rotating-graph-20261014/run.mjs docs/evidence/earth-rotating-graph-20261014/native-run.jl c5-replay-native-900-01
```

Clear unrelated ROT_* variables before each experiment. For compare-time.jl,
pass four run names after the new comparison name (1800/900/450/225 order),
and declare all corresponding JSON and -real-final.bin files, semicolon
separated, in ROT_INPUT_FILES. Check source hashes before selecting results.
The final native binaries can be copied from raw to the declared build paths
only when missing; verify existing bytes instead of overwriting them.

All frozen input data are read directly from C3/C4 raw directories. C1/C2
source includes and the Julia environment remain explicit external dependencies
within this repo. Historical source snapshots for every run are retained under
source-archives, including the intentional RED stubs.

The plot uses existing C:\Python314\python.exe and build/plot-deps via
PYTHONPATH; numerical simulation does not depend on plotting. All plotting
inputs are selected result JSONs. raw/convergence.png was visually checked.

seal.mjs is a one-time writer. Do not rerun it after sealing. Use
`node docs/evidence/earth-rotating-graph-20261014/verify-seal.mjs EXPECTED_SHA HEAD`
to verify both filesystem and committed Git bytes. Once sealed, replay work
requires a new evidence directory/runner, never modification of this one.
