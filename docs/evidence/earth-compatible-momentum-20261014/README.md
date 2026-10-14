# C7 compatible momentum experiment

This is a fixed-reference, first-order split-form coupling of nonlinear
momentum transport with C5 pressure, Coriolis and shared water transport.
Its transport substep preserves unresolved edge modes and has a reference-energy
dissipation identity; the acoustic update can change those modes. It is not a
full actual-mass atmospheric momentum/energy model.
Read protocol.md, report.md and code-review.md before using the results.

Run from the repository root before sealing. Existing Julia1.12.7, its project
and depot paths are specified in run.mjs; Julia threads=2 and BLAS threads=1.
No dependency or formal-default changes are needed. Every run needs a new name:

```powershell
node docs/evidence/earth-compatible-momentum-20261014/run.mjs docs/evidence/earth-compatible-momentum-20261014/test-transport.jl c7-replay-transport-01
$env:CMP_DT='900'
$env:CMP_CASES='real'
$env:CMP_RESTART='false'
node docs/evidence/earth-compatible-momentum-20261014/run.mjs docs/evidence/earth-compatible-momentum-20261014/native-run.jl c7-replay-native-900-01
```

Clear unrelated CMP_* variables before running. Native duration is21600s.
Strength is fixed at1 in accepted native runs, with an explicit C5 baseline
at1800s. compare-time.jl takes four native run names in1800/900/450/225 order;
bind their .json and -real-final.bin files in semicolon-separated CMP_INPUT_FILES.
Only test-coupled.jl uses CMP_RED_ONLY during the intentionally failing stub.

run.mjs records the literal Julia include closure, runner, protocol, external
inputs, environment and output SHA hashes. Selected runs must match the final
source bytes. Source archives retain stubs, failed tests and superseded runs.
The executable binary itself is not content-pinned; no cross-runtime bitwise
reproducibility claim is made.

Once manifest.json exists, run.mjs refuses to execute. Continue in a new
experiment/runner rather than modifying any sealed file. seal.mjs is a one-time
writer. Verify filesystem and committed Git bytes with:

```powershell
node docs/evidence/earth-compatible-momentum-20261014/verify-seal.mjs EXPECTED_SHA HEAD
```

plot.py uses C:\Python314\python.exe with build/plot-deps on PYTHONPATH and
records the selected JSON input hashes. The numerical solver does not depend
on plotting. Archived independent reviewer probes document their original
scratch paths; stage them there for replay instead of executing archived
copies in place. Never overwrite an existing result without verifying bytes.
