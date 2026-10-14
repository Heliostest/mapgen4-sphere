# Independent C11 whole-branch review

Reviewed branch `codex/pressure-wave-validation` against base
`9fcc89a92c8c8fe3aa41e019827af3a219244ecf`, including the uncommitted frozen
C11 source/evidence state identified by `review-source-bindings.json`.
The reviewer read the complete protocol, plan, numerical implementation,
inherited equations, execution/sealing tools, reports and recorded results.
This was an independent review; no implementation or Git state was changed.
All reviewer-created files are confined to `build/c11-independent-review`.

## Strengths

- The diagnostic preserves the inherited sign convention and reference-pressure
  factors. With `D = G' diag(h)`, the linear operator is skew-adjoint in
  `diag(c2 M, H)`. Independent endpoint/edge assembly agrees with the stored
  operators. The eliminated midpoint step agrees with a dense block Cayley
  solve to `1.1323e-15` on a nonuniform, varying-reference-pressure graph.
- The pressure and velocity reference is independent of midpoint stepping.
  A separately assembled full block exponential, including constant pressure
  and arbitrary edge circulation, agrees with modal pressure plus integrated
  velocity to `2.2345e-15`. Both state components show second-order time
  convergence. The sole constant null mode, reversibility, finite/shape
  rejection, overflow rejection, and lack of input mutation were checked.
- The full frozen C9 splitting has the claimed linearization. A centered
  derivative of its actual one-step map at amplitudes `1e-2/1e-3/1e-4`
  converges approximately 100-fold per decade to the direct block midpoint
  map, for both pressure and velocity, with unequal layer thicknesses and
  varying reference pressure. Rotation is zero and the three initial layer
  velocities agree, as required by the protocol.
- Standing phase correctly uses `-r_t/omega`; traveling phase correctly
  follows `f cos(omega t) + g sin(omega t)` with initial velocity
  `-c2 Gg/omega`. Common graph geometry, pressure samples and edge velocities
  are preserved across metrics. The report distinguishes modal amplitude
  from energy conservation and quantifies all 36 traveling initial pressure
  derivative discrepancies without calling them point-vector errors.
- Every saved endpoint was independently reconstructed and compared with
  its reported pressure, phase, amplitude, leakage and energy diagnostics.
  The 10 actual nonlinear endpoints also reproduce their normalized pressure
  and velocity discrepancies. The smallest reported normalized discrepancy
  is `1.3045150093462848e-4`; the largest measured Newton residual divided by
  amplitude is `1.1094098729957924e-12`. This comparison, the observed 10-fold
  amplitude scaling, and the full-source derivative check give no indication
  that Newton tolerance controls the measured nonlinear limit.
- The evidence audit reconstructs all 108 paired CSV rows and all 198 strict
  metric-specific regressions: 63 phase, 39 amplitude, 63 pressure and 33
  leakage. It checks every one of 64,728 linear trace samples and 768 actual
  nonlinear step ledgers, all aggregation gates, all 12 coarse modal-reference
  rows, the summary, and source/input/output fingerprints. The report openly
  retains the 48-ring aggregate regression and individual leakage regressions.
- All seven Julia attempts, including the two no-op RED runs and the failed
  exact-equality test, retain matching historical sources and immutable
  inputs. The `1e-14` stationary tolerance is a justified roundoff allowance,
  not a changed scientific acceptance gate. The legacy C2 sealer correction
  correctly limits directory inventory comparison to local bindings while
  continuing to hash every external binding; both attempts are retained.

## Verification

Independent reviewer attempts, all passed on their first execution:

| Audit | Evidence | Result |
| --- | --- | --- |
| Direct operator / block exponential / full C9 derivative | `numerical-v1.json` and log | 34 Julia assertions |
| Every endpoint and common initialization | `endpoints-v1.json` and log | 1,582 Julia assertions; 216 wave and 10 nonlinear endpoints |
| Trace, paired data, provenance and preservation | `evidence-v1.json` | 407,287 assertions, including 64,728 samples |
| Exact current sealer prefix before review receipt and writes | `tooling-v1.json` | 284 selected Julia assertions, 216 cases, nine ancestor manifests |

The large audit assertion count includes per-field arithmetic checks; it is
not a claim of that many independent physical experiments. The complete
216-case simulation was not needlessly rerun. All audit attempts preserve
their before/after source, input and experiment-output hashes, logs, scripts
and result files. `before.json` records the initial review state;
`frozen-before.json` and `frozen-after.json` bind the final documentation and
tooling state. Initial-to-final differences are the author's disclosed
document/tooling completion, not reviewer implementation edits.

The exact final sealer prefix passed independently through all numerical,
source, project, summary and plot checks, including the mixed-scope ancestor
fix. The final archive/review-receipt/manifest-writing section was inspected
without running its mutations. The figure was inspected visually; its
plotted series agree with `plot.py` and the bound inputs. The third panel
uses the C10 varying-reference-pressure subset of the tabulated modal results.

The existing project result is 278 tests passed, typecheck passed and build
passed; logs and hashes were inspected rather than duplicating those runs.
All C1-C10 bindings/default checks passed. The C10 manifest remains
`22c04edfa46f742bec47ada6eb1cdf70dc8cd9e839198238be1f7ca2f883de8f`.
The only existing tracked-file change is the C11 binary-byte preservation
rule in `.gitattributes`; the remaining branch addition is C11 evidence.

## Issues

Critical: none. Important: none. Minor: none.
Actionable findings: **0**.

## Recommendations

Use the existing one-time seal and Git-byte verification workflow after
copying these exact review artifacts. Keep future fitting or expanded wave
physics in a new experiment, with the current regressions retained.

## Declined to judge

- Rotating-wave accuracy, stratified/internal-gravity waves, arbitrary
  wavepacket group velocity, long-term climate behavior and default promotion:
  these are explicit protocol exclusions, and the report makes no claim to
  have validated them.
- Bitwise reproducibility on another runtime/platform: executables are
  identified by path/version rather than content-pinned. The report states
  this limitation and confines this numerical evidence to the recorded
  Julia 1.12.7 environment.

No behavior required by the C11 protocol was declined.

## Assessment

**Ready to merge: Yes, for the exact reviewed source/evidence state, after
the already planned one-time seal and Git-byte verification.** The required
numerical gates and provenance checks pass; no unresolved correctness or
evidence-integrity defect was found. This review does not claim that the
subsequent seal, commit, merge or push has already occurred.
