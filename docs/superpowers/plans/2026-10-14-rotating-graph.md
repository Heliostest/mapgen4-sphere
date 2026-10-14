# Rotating graph implementation plan

> Execute inline with superpowers:executing-plans and TDD; fresh independent
> review under superpowers:requesting-code-review before accepting this stage.

Goal: add a verified energy-neutral Coriolis operator and atomic symmetric
coupling to C4's fixed-reference acoustic/shared-water experiment.
Spec: ../../evidence/earth-rotating-graph-20261014/protocol.md
Stack: existing Julia 1.12.7 / SparseArrays / LinearAlgebra; Node evidence runner.

All new experiment files live in docs/evidence/earth-rotating-graph-20261014.
Do not modify C1-C4, source defaults or native source. No new dependencies.

Review focus: graph modes invisible to nodal reconstruction; variable reference
pressure; wrong hemispheric signs; a failure after the first rotation half-step;
checkpoint identity omitting the rotation vector. Each is tested below.

## Task 1: Graph Coriolis
- [x] Write `test-operator.jl`: independent assembly, midpoint solve/energy,
  signs, arbitrary modes, unequal layers, zero/spin reversal and validation.
- [x] Run no-op `rotation-core.jl` stub and preserve RED output.
- [x] Implement `RotationMap(c, lat, lon, omega)`, `reconstruct(m,j)`,
  `coriolis_tendency(m,j)`, `coriolis_step(m,j,h)`; pass operator test.
- [x] `analytic.jl`: frozen 24/48/96 grids, reconstruction/force/balance gates.

## Task 2: Atomic rotating acoustic/FCT step
- [x] Write failing `test-coupled.jl`: independent full matrix exponential,
  second order, zero-spin equivalence, all-field failure rollback and identity.
- [x] Implement `RotatingCore(fct, rotation)`, shared `step!`/energy/mass/identity.
- [x] Pass small independent-reference and checkpoint tests.

## Task 3: Native evidence and review
- [x] Native one-day timestep series and real/constant/sharp q; rebuilt restart.
- [x] Temporal comparison and all prescribed gates; retain failures.
- [ ] Independent code review: four attempts failed at model capacity before
  inspecting code. Author self-review recorded; fresh review remains before merge.
- [x] Preserve frozen sources, run project checks, write report/state/readme,
  verify current-source bindings, archive outputs, seal manifest, commit.

Numerical checkpoint sealed with 103 files; manifest SHA256:
`bccc6cf74351355e7c3c799c4767684b2fa06a2de73b0a2d67ca057ed5e376e8`.
251 Julia assertions, 7 source-binding checks, 278 project tests, typecheck and
build passed. Independent review remains uncompleted as recorded above.

Coupling consumes the exact Task 1 API; native driver consumes RotatingCore
through the unchanged State and checkpoint interface. No interface conflict.
