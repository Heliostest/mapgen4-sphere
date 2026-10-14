# C2 recovery complete; atmospheric repair still open, 2026-10-13

Prior chat 01a130db-6cad-78d1-97e1-878e9ceb34ac stopped repeatedly on remote
context-compaction stream errors. It wrote the C2 plan/design, no implementation.
The C1 manifest was not actually created; its older evidence and source remain
unchanged. This chat continues in the nested mapgen4-sphere repository.

Implemented modal-core.jl (281 checks), FCT transport (1898 checks after the
iterative solve), and their shared-sigma coupling (253 checks). Sphere rotations
passed axial/tilted cases on 12/24/48 rings. Native-shaped tilted error fell from
C1 0.2585 to C2 0.00891. This geographic-face test is not a polar-pressure proof.

All jobs finished. Final native runs passed: c2-final-1800 (real/constant/sharp), c2-final-900 and
c2-final-450 (real), all three days; scripts native-fct-v2.jl/run-accuracy-v2.mjs.
Exact c2 comes from frozen C1 native JSON; gravity from frozen geometry. Earlier
development native runs used 287.04*288 instead of native 82671.64740772452;
their within-operator temporal tests passed, but they are NOT the same-parameter
C1 comparison and must not be substituted for final evidence. Earlier FCT native
runs were stopped for this correction and the direct-solve performance issue.
All outcomes/logs and their exact archived sources are preserved.

No product code, native installed physics, or formal default changed. npm test:
278 passed. No commit/push. Full atmospheric physics, strong polar pressure
accuracy, and climate validation remain open. Dense modal preparation applies
only to the fixed linear operator (about 166 MB core), not a scalable general
nonlinear atmosphere. Re-run with unique names; the harness reserves names
atomically and writes live logs, source snapshots, and input hashes.

Final analyzer c2-final-analysis passed25 checks; fixed-linear pressure time
errors9.55e-10/9.12e-10/8.49e-10Pa at1800/900/450s; no rejected or hidden steps.
Humidity adjacent differences decrease by3.92. Final verifier passed193 archived
source bindings and106 input bindings across24 runs. Preservation verified1352
old bindings,105 installed native source files,222 frozen C1 files and default.
Independent review found no new must-fix issue; inherited advance! can preserve
partial accepted progress on a later failure, while individual step! is atomic.

Next: address strong/polar pressure accuracy. New exact-time spatial benchmark
still shows strong tilted-l1 errors.06014/.06899/.07847 at12/24/48 rings and
polar max errors.510/.947/1.764 despite improving whole-wave error. Do not spend
another turn rediscovering pressure time damping or FCT diffusion: those C2
gates now have reproducible passing evidence. Full nonlinear momentum/Coriolis,
baroclinic thermal physics and spectral/grid coupling must follow, then climate
validation. Read report.md and verification.json. Preserve all old failures.
