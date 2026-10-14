# C7 compatible momentum coupling implementation plan

Execute natively using the current user authorization. Apply executing-plans
task by task, TDD for numerical components, then independent code review.
Spec: protocol.md. Stack: existing Julia1.12.7/Node, no new dependencies.

- [x] `transport-core.jl`, `test-transport.jl`: failing no-op tests, nodal N
  and its dense reference, metric-adjoint incremental midpoint, kernel and
  energy checks. Interfaces: CompatibleTransport(rotation,lat,lon),
  split_tendency(m,j,F), transport_step(m,j,F;maxiter=400).
- [x] `analytic.jl`, `test-covariance.jl`: frozen grid refinement against
  the explicitly declared split-form continuum operator; rigid rotations.
- [x] `coupled-core.jl`, `test-coupled.jl`: CoupledCore(modal,transport,strength),
  atomic step!(m,state,dt), identity/checkpoints, C5-zero endpoint, late
  rejection and independent full nonlinear RK4 comparison.
- [x] `native-run.jl`, `compare-time.jl`: full six-hour shared budget/time
  matrix and literal-bit rebuilt restarts. Explicitly record nonzero transport.
- [x] source runner, selected-run verification, project checks, independent
  review, report/plot and immutable-seal tooling prepared.

Close-out executes the one-time seal and authorized Git integration. Their
outcomes are recorded by manifest.json and Git without editing sealed bytes.

Review focus: sigma weighting in the adjoint; preserving ker(R) without
assuming R P is identity; divergence half term versus physical momentum;
noncontractive fixed-point rejection; whole-step energy and all-state atomicity.
Each is covered by the owning numerical task's assertions and the report.

Ruling: the full-step energy guard uses 1e-9 E0 plus a roundoff allowance
256 eps (sqrt(Eref)*sqrt(E0)+eps Eref), where Eref is the unsubtracted
reference-pressure quadratic energy. Independent review reproduced false
rejection at exact/near rest under a relative-only guard. This mixed bound
reflects quadratic-energy perturbation scaling; it changes no state values.
Native accumulated-energy acceptance still uses the original 1e-9 relative
gate. Checkpoint identity bumped to v2. RED v1 also exposed the missing new
ledger field; RED v2 cleanly failed 15 assertions with no framework errors.
