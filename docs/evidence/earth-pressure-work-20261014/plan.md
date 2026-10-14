# C8 native execution plan and ledger

Spec: protocol.md. Continue within the standing user authorization using
design/planning, TDD and native execution, followed by fresh independent
review and authorized commit/merge/push. No dependency changes.

- [x] Energy and discrete gradient: pressure-core.jl defines PressureWorkCore,
  BarotropicState(p,W,v,time), energies, discrete_gradient and scalar secants.
  test-energy.jl first fails against a fixed-metric/no-op stub, then verifies
  high-precision chain rules and kinetic-pressure derivative.
- [x] Nonlinear solve and shared water: pressure_step(m,p,v,dt;maxiter=30)
  returns p,v,integratedJ and solve diagnostics; step! commits atomically.
  test-step.jl first fails against a no-op and covers residual, dense RK4,
  rest, invalid input, all-state rollback and rebuilt checkpoints. Jacobian
  tested by independent finite differences before native acceptance.
- [x] Spatial and native evidence: analytic.jl samples the predeclared graph
  sequence. native-run.jl imports all edge winds and advances the four native
  timestep cases, records budgets and literal-bit rebuilt restarts.
  compare-time.jl reads final native states and checks temporal differences.
- [x] Source runner and one-time sealer implement current selected closures,
  ancestral seals, project tests and review bindings. Produce report/plot,
  and independent review records. The final commands archive unchanged review
  scripts and seal once; verification.json records their execution. Git
  records the subsequent commit, merge and push without rewriting this ledger.

Review focus: the factor 1/8 in the kinetic discrete gradient, density-dependent
flux and Jacobian signs, stable divided differences near rest, graph metric
continuum meaning, missing vortical/vertical momentum terms, nonlinear failure
atomicity and immutable evidence. Each has an owning test or explicit scope.

Pre-flight: pressure_step consumes the same discrete_gradient that test-energy
checks; step! consumes its integratedJ without recomputing the mass flux.
Native/restart/temporal readers all use BarotropicState, not C7 State.j.
Ruling: use a dedicated branch in the existing checkout and a new evidence
directory; never modify sealed C1-C7. Preserve failures and review records
instead of deleting the experimental ledger after completion.

Ruling: a broad-ratio logarithmic branch is required when pressure ratios
underflow or (p1-p0)/p0 rounds to -1; retain near-equality series. Independent
review reproduced these failures; extremes RED-v2 failed 16 assertions and
the correction passed 26. A later native Newton stall exposed cancellation
at the branch boundary in physical pressure units: use logratio(lo,hi) instead
of subtracting their logarithms. Boundary RED failed 29 of 48 assertions;
the corrected run passed all 48, without relaxing Newton tolerance.

Ruling: explicitly reject finite excessive or nonfinite shared water/dry/air
budget residuals before committing any state. Runtime-only fault injection
gave four failures before the guard and nine passes after it; frozen FCT
sources were not modified. Earlier RED-v1 parse/serialization errors are
retained and superseded by clean assertion-failure RED runs.

Review ruling: the native driver retained total/max iterations and sparse
progress logs, while protocol item 5 requires every nonlinear iteration count.
Add a bound pressure_step replay at all four timesteps, record every step,
and require exact aggregate equality plus literal-bit final p/v equality to
the original selected binaries. Water has no feedback; the coarse replay
must match all three tracer endpoints. Preserve the original native source
and results, and label the new traces as deterministic replays.
