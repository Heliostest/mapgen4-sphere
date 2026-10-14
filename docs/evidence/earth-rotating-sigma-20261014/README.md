# C9 rotating barotropic sigma momentum

C9 pairs the layer kinetic-gradient correction with centered vertical
advection of horizontal momentum, and adds an actual-pressure-adjoint
absolute-vorticity force. Symmetric midpoint/pressure-work composition keeps
C8's energy and full edge state. Read protocol.md and report.md for its
limited barotropic scope; this is not a full atmospheric model or default.

Before sealing, run from the repository root using the existing Julia 1.12.7
environment, two Julia threads and one BLAS thread configured by run.mjs.
Every attempt requires a fresh name; all failed and superseded sources remain.

```powershell
node docs/evidence/earth-rotating-sigma-20261014/run.mjs docs/evidence/earth-rotating-sigma-20261014/test-vector.jl c9-replay-vector-01
$env:VC_DT='900'
$env:VC_CASES='real'
$env:VC_RESTART='false'
node docs/evidence/earth-rotating-sigma-20261014/run.mjs docs/evidence/earth-rotating-sigma-20261014/native-run.jl c9-replay-native-01
```

Clear unrelated VC_* variables first. Duration is six hours. compare-time.jl
takes four native names in 1800/900/450/225 order; bind every native JSON and
real-final.bin via semicolon-separated VC_INPUT_FILES. VC_RED_ONLY selects
the retained intentionally missing-step test. Each native trace records both
momentum half-step counts/residuals and the pressure solve on every step.

After manifest.json exists the runner refuses further runs and the sealer
refuses a second seal. Continue in a new experiment. To verify filesystem
and committed Git bytes:

```powershell
node docs/evidence/earth-rotating-sigma-20261014/verify-seal.mjs EXPECTED_SHA HEAD
```

Plotting uses C:\Python314\python.exe with build/plot-deps on PYTHONPATH;
the solver has no plotting dependency. Review scripts preserve their original
build/c9-independent-review paths: stage those exact archived bytes before
replay and restore missing raw inputs only after hash verification. The Julia
runtime executable is not content-pinned; bitwise claims apply to this
recorded environment, not arbitrary future platforms.
