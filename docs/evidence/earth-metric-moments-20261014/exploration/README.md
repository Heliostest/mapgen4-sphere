# Historical exploratory probes

These files preserve pre-protocol investigation. They were run from
build/c10-diagnosis using frozen C9 code and the existing Julia/Python runtime.
They were not surrounded by the later source-before/after runner; do not count
them as source-bound acceptance runs. The source-bound c10-diagnosis-v1
subsequently reproduces the baseline decomposition with the frozen protocol.

- diagnose.jl -> diagnosis.json: original C9 error decomposition, 24/48/96.
- moment-probe.py 24: hard nine-moment target, negative-edge elimination;
  final residual about .358 and force regression, rejected.
- soft-moment-probe-v1.py 24: soft penalty1, original positive graph; modest
  improvement. This is the exact source for soft-24 files.
- soft-moment-probe.py 24 0.01 p001: coarse penalty selection, zero floor and
  edge elimination. compare.jl with C10_PROBE=soft-001 evaluates that graph.
- soft-moment-probe.py 48 0.01 p001: generated before final design, without
  inspecting its force errors. It is not the accepted 48-ring graph.
- compare.jl with C10_PROBE=first: original24, hard24, soft-penalty1-24.

Final C10 fitting retains every edge at a strictly positive floor and uses
the declared trace-scaled ridge. Final force comparisons use a common
original metric; the exploratory comparisons used each graph's own metric.
Only source-bound final runs support the report's acceptance claims.
