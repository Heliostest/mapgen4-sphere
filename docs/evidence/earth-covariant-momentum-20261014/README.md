# C6 covariant momentum experiment

This directory contains an isolated pressureless nonlinear self-advection
baseline using the frozen C3 graph, C4 native inputs and C2 shared water
transport. It is not the coupled C5 atmospheric model. Read report.md for
measured results and limitations, protocol.md for predeclared gates,
code-review.md for independent review and c5-review-addendum.md for the review
completed after the preceding immutable C5 seal.

Run from the repository root before sealing. The existing Julia 1.12.7 runtime
is build/earth-speedyweather/runtime/julia-1.12.7/bin/julia.exe; environment and
depot paths are pinned in run.mjs. Julia threads=2, BLAS threads=1. No dependency
or formal-default changes are required. Each invocation needs a fresh name:

```powershell
node docs/evidence/earth-covariant-momentum-20261014/run.mjs docs/evidence/earth-covariant-momentum-20261014/test-momentum.jl c6-replay-momentum-01
$env:MOM_DT='900'
$env:MOM_CASES='real'
$env:MOM_RESTART='false'
node docs/evidence/earth-covariant-momentum-20261014/run.mjs docs/evidence/earth-covariant-momentum-20261014/native-run.jl c6-replay-native-900-01
```

Clear unrelated MOM_* variables before each run. compare-time.jl takes four
run names in 1800/900/450/225 order; bind every corresponding .json and
-real-final.bin file in semicolon-separated MOM_INPUT_FILES. The declared
duration is 21600 seconds and each native run executes all required steps.
Finer runs use real humidity; 1800 seconds also tests constant and sharp fields.

The runner hashes the anchored literal Julia include closure, runner, protocol,
frozen input data and environment. Selected runs must match current sources.
Historical no-op RED and failed syntax-run snapshots are kept in source-archives.
The seven source-binding tests include tampering with a transitive dependency.
The runtime executable itself is not content-pinned; no cross-runtime bitwise
reproducibility claim is made.

Once manifest.json exists, run.mjs refuses execution against this directory.
Create a new experiment/runner for subsequent work; do not edit sealed bytes.
seal.mjs is a one-time writer. Verify filesystem and committed Git bytes with:

```powershell
node docs/evidence/earth-covariant-momentum-20261014/verify-seal.mjs EXPECTED_SHA HEAD
```

plot.py uses C:\Python314\python.exe with build/plot-deps on PYTHONPATH. Plot
inputs are the selected result JSONs; plot execution records their hashes.
The numerical simulation does not depend on plotting.
