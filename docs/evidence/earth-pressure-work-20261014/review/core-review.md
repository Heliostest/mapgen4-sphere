# C8 independent core review

Reviewed the corrected implementation on the requested base
`6a7589687ec075cde17d7d79ef622f96c5520378`. No production or sealed evidence
files were edited by this reviewer. This report covers the mathematical core,
its scalar formulas, nonlinear solver and state/checkpoint boundary. Native
matrix acceptance and the final provenance/sealer audit are still pending.

## Findings and dispositions

1. **Resolved: valid-positive extreme secants and compression energy.** The
   first implementation rounded `(b-a)/a` to -1 or overflowed its ratio.
   Broad-ratio log-domain formulas now return finite representable values.
2. **Resolved: secant branch cancellation.** Subtracting `log(lo)-log(hi)`
   immediately outside the series branch gave derivative errors up to
   1.324e-9 relative in independently tested cases. `logratio(lo,hi)` reduces
   the worst error in 112 boundary/scale cases to 1.045e-12; none exceed
   2e-12. Pre-fix results and the independent script are retained.
3. **Resolved: commit before final budget validation.** C8 now checks finite
   local air/water/dry residuals and bottom closure before committing state.
   Runtime-only fault injection confirms exact rollback after the genuine
   transport solve, including thrown failure, NaN and excessive residuals.
4. **Resolved: continuum sign wording.** With positive-from/negative-to
   incidence, G is the negative physical gradient. The protocol now states
   negative Bernoulli gradient and retains the isolated subsystem scope.

No remaining actionable core finding was found in this review.

## Independent numerical checks

The independent graph has five irregular-area cells, eight edges and unequal
sigma thicknesses .07/.21/.72. It is separate from the implementation tests'
six-cell fixture. The RHS and high-precision residual oracle are written as
explicit loops over geometry and do not call production residual or discrete
gradient routines.

- 109 assertions passed: nonlinear/invariants/dense ODE 31; independent
  BigFloat Jacobian 8; invalid states/checkpoint identity/restart 63; late
  water fault/rollback 7. A separate unchanged-source assertion also passed.
- Independent RK4 references at .00025/.000125 over .3 differ by 1.022e-14.
  C8 errors at .075/.0375/.01875/.009375 are .0002859278,
  .0000715925, .0000179051, .0000044767, with ratios
  3.99382, 3.99845, 3.99961.
- Twelve nonlinear sweeps over velocity/pressure amplitude .01/.1/.6 and
  dt .01/.1/.5/1 passed the original equations and positivity checks.
- The analytic Jacobian matched 256-bit centered differences across
  pressure scales 1e-100, 1, 1e5, 1e100 and endpoint ratios from 1e-8 to
  100. Worst relative matrix error: 1.687e-13; worst scaled entry error:
  4.454e-13.
- Reversibility of the pressure-only step, area-weighted mass, graph-cycle
  velocity and interlayer velocity-difference invariants passed.
- Invalid state shapes/values and invalid timestep/iteration values were
  rejected with literal-bit state preservation.
- Checkpoints reject altered pref, ds, c2, G, h, S, cell areas and radius.
  Independently rebuilt restart matched five further steps bit for bit.

The exact successful review source is `independent-review.jl`. Two draft
harness attempts are retained: v1 had a Julia numeric-literal parse error;
v2 needed `invokelatest` for runtime method injection under Julia world-age
rules. Neither failure was a production defect, and the final harness
verifies that the injected method executed three times.

## Binding and limits

The six source/protocol hashes in `source-before.json` equal those in
`source-after.json`. The reviewed pressure core is SHA256
`8231625a4a4ed0855150d0047a27a1c55b24324177fff4d47d8adce287168f80`.
`core-review-bindings.json` binds the review scripts, outputs and read sources.

Energy preservation and these checks establish properties of the finite graph
Bernoulli/continuity subsystem. They do not establish missing Coriolis,
vorticity transport, vertical momentum advection, thermal or climate physics.
Spatial force errors were diagnosed separately and decrease in the sampled
graph sequence; scalar-potential accuracy alone would not imply that result.
