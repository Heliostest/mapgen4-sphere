# C10 continuation state

Base a3a6934b6c9135ddfd912b86197f54026b615e05, branch
codex/polar-metric-refinement. Git records subsequent integration status.
When manifest.json exists, preserve this entire experiment byte for byte.

The kinetic-sampling defect motivates a new fixed positive graph metric.
All original cells, areas, coordinates, edge indices, distances and velocity
degrees of freedom remain; only conductances change. Low moments reproduce
coordinate and isotropy conditions, cubic moments are penalized with lambda
.01, and weights have the positive lower bound .01 times their old value.
The one-way pinning/refit heuristic is not a certified optimum.

The exact C8 pressure work and C9 rotation/sigma momentum code is reused.
Its energy and water identities use the new metric consistently. Version9
checkpoint identity already binds geometry and rejects cross-metric loads.
Common original edge weights measure spatial force errors, preventing an
apparent gain from changing the error norm. Held-out fields and pressure
operator proxies are explicitly reported, including regressions.

All predeclared numerical gates passed. The 96-ring worst degree3 polar
error is 0.07499363 versus C9's 0.1234337 on the original common norm, a
39.24% reduction. All 72 potential and 36 primary force pairs improve in
both global and polar metrics. Scalar L2 and polar maxima improve in all
90 rows; 42 Rayleigh errors increase, by at most 0.81% relatively. Native
six-hour time refinement, three rebuilt bitwise restarts, 141 selected
Julia assertions, seven Python groups and 278 project tests all passed.
The failed no-op RED and initial spatial-harness attempt remain archived.

Outstanding physics remains thermodynamic pressure/geopotential, thermal
energy and physical water sources. Outstanding numerics includes general
curl-grad/PV/angular-momentum compatibility and nonuniform-layer vertical
spatial accuracy. No full atmosphere, general stability, climate or formal
default promotion is claimed. Consult the report for the measured residual
polar error before selecting the next experiment.
