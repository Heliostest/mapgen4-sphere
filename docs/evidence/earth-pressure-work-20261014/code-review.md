# C8 independent code and evidence review

A fresh-context reviewer examined the C8 mathematical core and evidence on
base 6a7589687ec075cde17d7d79ef622f96c5520378. The reviewer used separate
scratch scripts and did not edit the implementation or sealed ancestors.
The corrected pressure-core.jl has SHA256
8231625a4a4ed0855150d0047a27a1c55b24324177fff4d47d8adce287168f80.

## Findings and disposition

- Extreme positive-pressure secants and compression energy initially lost
  finite values. Broad-ratio log-domain formulas and the near-equality series
  now pass high-precision regression cases.
- The scalar branch boundary lost accuracy when subtracting two absolute
  pressure logarithms. The stable log ratio passes all 112 independent
  boundary/scale cases; worst derivative relative error is 1.045e-12.
- State commit initially lacked a final finite local-budget check. The
  corrected guard rejects thrown water failure, NaN and excessive residuals
  after genuine transport, preserving all state fields bit for bit.
- The continuum sign is explicitly the negative physical Bernoulli gradient
  under the frozen incidence convention. Missing vortical and vertical
  momentum, rotation and heat remain outside this isolated subsystem.
- Native logs initially retained aggregate nonlinear counts only. Four
  separately bound deterministic replays now record every pressure step,
  match original aggregates exactly and reproduce every stored native final
  pressure/velocity bit pattern. The protocol was not relaxed.

## Independent checks

The core oracle uses a five-cell, eight-edge irregular graph and unequal
layers .07/.21/.72, distinct from the author's six-cell fixture. Its RHS and
BigFloat Jacobian oracle use explicit geometric loops rather than the
production residual/discrete-gradient functions.

- 109 core assertions pass: nonlinear equations/invariants/RK4 31,
  high-precision Jacobian 8, invalid states/checkpoint identity/restart 63,
  and late water rollback 7. A separate unchanged-source assertion passes.
- The independent RK4 .00025/.000125 discrepancy is 1.022e-14; refinement
  ratios are 3.99382, 3.99845 and 3.99961. The 256-bit Jacobian comparisons
  span pressure scales 1e-100 to 1e100 and endpoint ratios 1e-8 to 100;
  worst relative matrix error is 1.687e-13.
- Reversibility, area-weighted mass, graph-cycle velocity and inter-layer
  velocity-difference invariants pass. A separately rebuilt core reproduces
  five additional checkpoint steps bit for bit and rejects changed identity
  inputs.
- 10 independent native restart assertions rebuild all three coarse
  checkpoints and reproduce four further steps with literal p/v/W/time bits.
- 75 native metric assertions independently recompute six final inventories,
  energy, bounds and temporal norms using 160-bit arithmetic. Maximum final
  energy drift is 4.023e-16; maximum absolute air, water and dry drift are
  2.682e-13 kg/m2, 4.472e-13 mm and 6.168e-13 kg/m2. These final high-precision
  quantities are distinct from the original per-run maximum Float64 metrics.
  All adjacent and finest-reference temporal norms agree with the report.

## Provenance and limits

The audit checks exact C1-C7 directory membership and every ancestral bound
byte (222/148/93/133/102/110/151 bindings), the formal default, recursive
current selected source closures, archived sources, inputs, outputs, project
logs and plot provenance. Source hashes are recorded in
review-source-bindings.json; the manifest includes the entire review archive.

All scratch scripts, outputs and failed review-harness drafts are retained in
review/. Early core harness attempts had a numeric-literal parse error and a
Julia world-age issue; the native restart draft also had a harness syntax
error. They are not counted as successful tests or production defects. The
preliminary core/native reports remain historical records; the final reviewer
verdict and bindings supersede their pending-stage statements.

The independent checks establish finite-graph pressure-work properties within
the declared scope. They do not establish a complete atmosphere model,
climate accuracy, exact angular momentum/PV, or production performance. Polar
force errors remain materially larger than global errors, as reported.
