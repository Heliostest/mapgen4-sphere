# C4 continuation state — 2026-10-14

Base main/origin/main: c483edab5127103866384ef385bd7ca5c7ef3d03.
C4 working branch: codex/native-graph-wind. All changes belong to this new
experimental evidence directory. Consult actual Git state for later merges.

Selected runs:

- Import contract: c4-import-v4 (18 checks); covariance: c4-covariance-v1 (8).
- Analytic vector refinement: c4-analytic-v1 (234 checks, 60 cases, 24/48/96 rings).
- Imported-wind rotation: c4-rotation-v1 (36 checks, two axes, eight phases).
- Native 1-day real/constant/sharp: c4-native-1800-v3 (39 checks).
- Native 1-day real humidity at 900/450/225 seconds:
  c4-native-900-v1, c4-native-450-v1, c4-native-225-v1 (18 checks each).
- Temporal comparison: c4-temporal-v2 (8 checks), adjacent humidity error
  reduction factors 3.9675 and 4.0271 on timestep halving.
- Source-binding regression: c4-binding-v2 (five checks).
- Project tests 278, typecheck and build passed.

The import maps all native pressure-weighted east/north samples onto the C3
effective graph, preserving its explicitly defined Gaussian weak divergence
and both mapped Hodge components. It does not assert exact native spectral
divergence or continuum vorticity preservation. The imported native state is
strongly solenoidal in the graph metric; discarding that component is invalid.

C1/C2/C3 remain frozen. C3 manifest SHA:
cb95e9a55efac60795367edebe119e601bc984d941c2f7b76f595f483070eb8e.
After C4 manifest.json is sealed, keep this entire directory byte-identical.
Start subsequent experiments in a new directory with unique run names.

Next unresolved integration: complete momentum, Coriolis, thermodynamics and
physical source coupling, followed by appropriate long climate validation.
No formal default upgrade has occurred. Current results cover the fixed
reference acoustic/shared-water subsystem for one native initial state over
one day, plus the declared analytic tests. Dense modal and sparse tracer solves
are still experimental-scale costs. step! is atomic; no interval-transaction
claim is made for the inherited advance!, which these runs do not call.

Independent review's source-to-current-implementation sealing gap was repaired
and tested RED -> GREEN. All failed attempts are retained and explicitly
excluded from selection. See report.md, code-review.md and verification.json.
