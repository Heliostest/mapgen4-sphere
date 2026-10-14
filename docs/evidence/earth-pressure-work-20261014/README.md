# C8 pressure-work experiment

An isolated barotropic Bernoulli/continuity subsystem with actual-pressure
kinetic energy, a symmetric discrete-gradient solve, and shared water FCT.
It retains every imported edge component without projection. It does not
transport vortical or vertical momentum and does not include Coriolis or
thermodynamic heat. Read protocol.md, report.md and code-review.md for scope.

Run from the repository root before sealing. Existing Julia 1.12.7, project
and depot paths are specified in run.mjs; Julia threads=2, BLAS threads=1.
Each attempt requires a new name. No new dependencies are installed.

```powershell
node docs/evidence/earth-pressure-work-20261014/run.mjs docs/evidence/earth-pressure-work-20261014/test-energy.jl c8-replay-energy-01
$env:PW_DT='900'
$env:PW_CASES='real'
$env:PW_RESTART='false'
node docs/evidence/earth-pressure-work-20261014/run.mjs docs/evidence/earth-pressure-work-20261014/native-run.jl c8-replay-native-900-01
```

Clear unrelated PW_* variables first. Native duration is 21600 seconds.
compare-time.jl takes four run names in 1800/900/450/225 order; bind their JSON
and -real-final.bin files through semicolon-separated PW_INPUT_FILES.
PW_RED_ONLY is used only by the intentionally failing step stub.

iteration-trace.jl takes one native run name and replays its pressure solver
from the same initial state. Bind that run's JSON and all case-final binaries
through PW_INPUT_FILES. Its per-step trace must exactly match original
aggregate diagnostics and literal final pressure/velocity bits; it does not
repeat water transport or claim the trace was recorded in the original run.

run.mjs binds the recursive literal include closure, runner, protocol, inputs,
environment and output hashes. Source archives retain failures and superseded
implementations. Selected runs must match current bytes. The runtime binary
itself is not content-pinned, so bitwise claims are within this environment.

After manifest.json exists, the runner refuses further execution and seal.mjs
refuses a second seal. Continue work in a new experiment. Verify filesystem
and committed Git bytes with:

```powershell
node docs/evidence/earth-pressure-work-20261014/verify-seal.mjs EXPECTED_SHA HEAD
```

plot.py uses C:\Python314\python.exe with build/plot-deps on PYTHONPATH. The
solver does not depend on plotting. Reviewer scripts retain their original
build/c8-independent-review paths; stage those exact archived bytes there
before replay. Restore missing input binaries from raw only after checking
their hashes. Never overwrite existing evidence without verifying its bytes.
