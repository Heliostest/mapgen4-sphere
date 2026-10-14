# C9 rotating sigma momentum implementation plan

Use superpowers:executing-plans inline, with one independent fresh-context
review before sealing. Spec: protocol.md. Goal: close C8's missing rotational
and layerwise horizontal-momentum tendencies without sacrificing its energy
chain rule or shared air/water transfers. Existing Julia and Node environment.

Global constraints: preserve sealed C1-C8 and formal defaults; full edge state;
no new dependencies, hidden timesteps, clipping or energy correction. Work on
codex/rotating-sigma-momentum from 0041b1e. Keep this evidence ledger and all
original failed sources, rather than deleting the numerical experiment.

- [x] Create vector-core.jl: VectorCore(pw,lat,lon,omega),
  neutral_tendency(m,p,v), neutral_step(m,p,v,tau;maxiter=400).
  test-vector.jl derives an independent loop oracle and watches the no-op
  stub fail nonzero rotation/vertical exchange and energy-work assertions.
  Implement actual-metric reconstruction, weak curl, signed sigma interface
  rates and paired layer-gradient/vertical tendency; run RED then GREEN.
- [x] Complete step!(m,s,dt;maxiter=400,pressure_maxiter=30), energy/mass,
  identity_hash, save/load version9. test-coupled.jl verifies dense RK4,
  midpoint reversal, invalid/near-rest inputs, failure rollback, checkpoint
  identities and literal-bit restart. Observe missing-step RED then GREEN.
- [x] analytic.jl tests declared force/vertical/covariance refinement.
  native-run.jl records every explicit step and all solver counts, water
  budgets and four-step restart; compare-time.jl binds and compares finals.
  Run complete source-bound spatial/native matrix and project checks.
- [x] Review the full branch under requesting-code-review; produce
  report/plot/continuation notes and preserve independent review artifacts.
  The final verdict and exact reviewed hashes are in code-review.md and
  review-source-bindings.json; no implementation finding remains.

Post-seal integration: seal once, verify Git bytes, commit and merge, rerun
project checks, push and confirm remote/clean state. These operations occur
after this immutable evidence snapshot; use Git and the thread completion
record for their resulting commit ids and verification status.

Review focus: actual versus reference density in the adjoint; curl and
vertical-transfer signs; unequal layer weights and metric interpolation;
nonlinear solver rejection/near rest; literal state rollback after late
water or second-momentum failure. Each is owned by the first two test files.

Design ruling: layer kinetic-gradient correction and vertical material
advection must be implemented as a pair because their works cancel. A
standalone skew vertical operator would remove required physical terms.
The cost of a wrong derivation is a conserved but incorrect momentum model;
independent loop and continuum tests, followed by review, are required.

Execution ruling: continue the user's authorized improvement/commit/merge/
push workflow in this checkout on a new branch. Native execution and one
fresh final reviewer preserve the established workflow; no repeated approval
menu. A separate worktree would duplicate access to the large local runtime.
