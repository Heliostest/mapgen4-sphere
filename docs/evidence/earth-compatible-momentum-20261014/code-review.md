# Independent C7 review

Reviewer /root/review_c7 assessed the design and implementation from base
b8c0fce in a fresh context, with read-only access to the experimental sources.
Final assessment: no unresolved actionable findings; ready to seal and commit
as a scoped fixed-reference momentum experiment. The application default is
not promoted. Final reviewed bytes are bound in review-source-bindings.json.

The reviewer found two issues, both resolved before final acceptance:

- The original whole-step relative-only energy guard falsely rejected exact
  and near-rest states. RED regressions reproduced the failure. The corrected
  mixed allowance preserves the state arithmetic and includes the pressure
  scale of quadratic-energy roundoff. Independent tests accept rest and small
  perturbations while a finite non-skew rotation defect still triggers energy
  rejection and literal-bit rollback of every state field.
- The ker(R) preservation wording needed to identify the transport substep.
  An independent fixture shows that the complete acoustic update changes
  this component by 0.014627 relative, as expected. Report, README and seal
  acceptance metadata now state the narrower invariant explicitly.

Final independent numerical validation passes 64 assertions: probes-v2 (26),
ode-v2 (3), kernel-scope-v1 (1) and native-audit-v1 (34). The dense construction
uses Cartesian rotations and unequal three-layer sigma weights; H-weighted
SVD isolates edge modes outside the nodal reconstruction. Strengths 0, 0.01,
0.37 and 1 agree with the dense midpoint solve to at most 3.51e-16 relative.
Transport-only kernel residuals remain below 5.13e-17. Tiny transport fields,
zero-strength frozen C5 identity, exact/near-rest states and late rejection
rollback are included.

An independent full nonlinear ODE with strength 0.37 has RK4 reference
discrepancy 2.74e-13 and refinement ratios 1.902, 1.913 and 1.947. Native final
air/water/dry inventories, reference-energy closure, humidity bounds and
pressure/momentum/humidity adjacent differences were independently recomputed.
All three coarse native checkpoints were rebuilt and advanced four steps;
UInt64 views of every array and Float64 time match the saved final states.

The provenance audit checks 10 selected runs and 17 historical run statuses,
including five retained failures: 149 selected/plot source-hash comparisons,
226 input comparisons, 44 output comparisons, 254 source-archive comparisons,
and 348 frozen C4-C6 seal bindings. C3/C2/C1 checks cover 93/148/222 bindings
respectively, plus 105 native sources; the formal default remains unchanged.
The reviewer inspected the selected analytic/covariance/native matrix and
278 project-test/typecheck/build evidence, but did not independently rerun
those full suites. The plot was checked against its inputs and visually read.

Unchanged scripts and JSON results are archived under review/. Original
probes-v1 deliberately records the old guard's rejected near-rest cases;
its passed flag means the diagnostic probe completed, not that those states
were accepted. ODE-v1 and probes-v1 refer to the superseded core. Final
acceptance uses the corrected v2 probes and the selected run matrix.

Reviewer scripts ran from the repository root with their files staged at
build/c7-independent-review; relative includes and output paths assume that
scratch location. Stage the archived bytes there to replay, and restore any
missing native inputs from raw only after verifying hashes. Do not execute
the archived scripts in place or overwrite existing evidence without checking
its bytes.

The reviewer does not certify full actual-mass compressible momentum,
thermodynamic energy, exact angular momentum or potential vorticity, higher
nonlinear order, long climate behavior, production performance, or binary
reproducibility across runtimes. Sealing and Git integration follow this review;
consult manifest.json and Git for those final outcomes.
