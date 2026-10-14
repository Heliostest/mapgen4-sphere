# Final independent C8 review verdict

**Completed. No remaining actionable findings.** The corrected implementation
and recorded evidence satisfy the declared acceptance for the isolated C8
barotropic Bernoulli/continuity pressure-work experiment. This review does not
claim that the subsequent one-time seal or Git integration has already run.

The pressure core reviewed here is SHA256
`8231625a4a4ed0855150d0047a27a1c55b24324177fff4d47d8adce287168f80`.
The final report, code-review summary, README, continuation note, protocol,
plan, selected-run list, implementation, tests, runner, sealer, source verifier,
seal verifier and plot source were reviewed and are bound in the accompanying
`review-source-bindings.json`.

## Independent results

- 109 core assertions plus one unchanged-source assertion pass. The independent
  irregular five-cell/eight-edge oracle verifies nonlinear equations,
  second-order temporal convergence, invariants, high-precision Jacobians,
  invalid inputs, identity checks, literal-bit restart and late-water rollback.
- 112 scalar boundary/scale cases have no derivative error above 2e-12; the
  largest measured relative derivative error is 1.045e-12.
- 10 native checkpoint assertions reconstruct all three coarse models and
  reproduce four more steps with literal UInt64 equality in p/v/W/time.
- 75 native metric assertions independently recompute six final inventories,
  energy and bounds plus temporal norms using 160-bit arithmetic. All pass.
- The provenance audit verifies 365 author assertions in 15 selected runs,
  all 31 completed attempts and their original source archives, seven source
  checks, 278 project tests, typecheck/build logs, and plot provenance.
- All four iteration replays have complete 12/24/48/96-step records, iteration
  totals 36/72/101/192, exact original aggregate diagnostics and literal final
  pressure/velocity bits. Native JSON/binary inputs are explicitly bound.
- Exact C1-C7 directory memberships and bound bytes remain intact, with
  222/148/93/133/102/110/151 bindings. The application default matches base
  6a7589687ec075cde17d7d79ef622f96c5520378.

## Resolved findings

The review identified and confirmed correction of positive-extreme scalar
failures, near-branch logarithmic cancellation, the missing pre-commit budget
guard, the continuum-sign wording, and incomplete per-step iteration records.
The latter was resolved with explicitly labeled deterministic replays while
preserving the original selected native sources and results. No predeclared
numerical tolerance was relaxed.

The final prose accurately distinguishes finite-graph energy/invariant
properties, sampled spatial refinement, fixed-graph temporal refinement,
high-precision endpoint checks and original accumulated Float64 diagnostics.
It reports the larger polar-force errors and excludes Coriolis, vortical and
vertical momentum transport, thermal energy, complete-atmosphere and climate
acceptance. Runtime executables are not content-pinned; literal-bit claims
remain limited to the recorded environment.

## Archive status

All review work was confined to `build/c8-independent-review`. Failed harness
drafts are retained and excluded from passing counts: core parse/world-age
issues, native-restart syntax and a Node subprocess output-buffer limit in the
initial provenance harness. The final review and completed binding supersede
pending-stage wording in earlier review notes. After producing the binding,
this scratch directory is immutable and ready to archive unchanged.
