# Independent C6 review

Reviewer /root/review_c6 reviewed the changes from base 1fa1cd0 in a fresh
context with read-only access to the experimental implementation and evidence.
The numerical sources remained unchanged during review. Final assessment:
no remaining actionable findings; ready to seal and commit as a scoped
experimental checkpoint, without promoting the formal application default.

Independent validation: 323 assertions passed. Sixty randomized graphs used
mixed signed transfers, unequal masses, an independent three-dimensional
matrix-exponential rotation and dense block solve. Worst velocity difference
was 6.22e-16; independently evaluated energy-identity residual was 6.83e-16.
Additional cases checked pole/coincident-position frame changes, zero velocity,
edgeless geometry, strong circulation rejection and same-column momentum sum.
Three native checkpoints were rebuilt and advanced four steps, then compared
to their archived final states using literal UInt64 views of all arrays and
Float64 time. All three matched bit-for-bit, including signed-zero patterns.

The reviewer verified nine selected source closures, 139 source-archive
bindings, 139 input bindings, 24 output bindings and 235 frozen C4/C5 bindings.
C1-C3/native-source/formal-default preservation passed. The complete selected
numerical matrix and 278 project-test evidence were inspected; those full
suites were not independently rerun by the reviewer.

Two P3 wording findings were fixed before the review hashes were finalized:
an unsupported smoothness claim was removed, and -nabla_U U was correctly
named the covariant advection tendency rather than material acceleration.
No numerical implementation changes were requested.

review-source-bindings.json contains the final 21 reviewed-file SHA-256
bindings and explicit assessment. Unchanged reviewer scripts and result JSONs
are archived under review/. They were executed from the repository root with
scripts located at build/c6-independent-review; relative includes and output
paths assume that scratch location. Do not execute the archived copies in
place. To replay, stage their exact bytes at the original scratch paths and
stage missing input binaries from raw only after verifying their hashes.

The reviewer explicitly declined to certify full C5 edge feedback/coupling,
exact global angular momentum/PV or thermodynamic-energy conservation,
second-order momentum, long-term climate behavior, production performance,
or cross-runtime bitwise reproducibility. Sealing and final Git integration
are performed by the author after review; consult manifest.json and Git for
those outcomes. The later C5 review is recorded in c5-review-addendum.md.
