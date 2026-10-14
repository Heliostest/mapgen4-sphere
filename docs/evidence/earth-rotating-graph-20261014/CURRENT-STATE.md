# C5 continuation state

Base main/origin/main: 56922fa. Branch: codex/rotating-graph-core.
Consult Git for any later branch/merge changes. Once manifest.json exists,
keep this entire directory byte-identical and start future work elsewhere.

Implemented: metric-adjoint edge-to-node reconstruction, energy-neutral graph
Coriolis, implicit midpoint rotation, atomic Strang acoustic/shared-FCT coupling.
251 selected Julia assertions + 7 source-binding checks passed. Project tests
278, typecheck and build passed; C1-C4/native sources/formal default unchanged.

Selected runs: operator-v1 (19), analytic-v1 (138), coupled-v1 (22),
covariance-v1 (10), native-1800-v1 (26), native-900/450/225-v1 (9 each),
temporal-v2 (9), all prefixed c5-. No numerical process remains running.
Native one-day time ratios are about 4 for p/j/q, reference energy max drift
4.34e-14, local shared budget residual max5.39e-14.

Independent reviewer service failed at capacity on four attempts. Only author
self-review is available. Fresh independent review remains before merge.

Next numerical work: nonlinear momentum advection/vertical momentum exchange
with compatible budgets, then thermodynamics and physical sources. Do not call
this complete C5 atmospheric dynamics. R is not a left inverse of P; ker(R)
modes persist under pure Coriolis. Fixed-reference energy is not nonlinear
total energy. No PV/angular-momentum or exact time-split balance claim.
No formal default or long climate acceptance promotion occurred.
