# C6 continuation state

Base: 1fa1cd0 (C5), on branch codex/covariant-momentum-transport. Consult Git
for later commit/merge status. Once manifest.json exists, preserve this entire
directory byte-for-byte and continue in a new experiment directory.

Implemented: spherical parallel transport for signed nodal momentum, implicit
donor solve with local momentum and dissipative kinetic-energy identity,
nonlinear pressureless self-advection using shared horizontal/sigma-vertical
air and water transfers, atomic rollback and versioned rebuilt-core checkpoints.

Selected Julia assertions: 144; source-binding checks: 7; project tests: 278.
Typecheck/build and C1-C5/native/formal-default preservation checks passed.
Native six-hour runs use 1800/900/450/225-second steps (12/24/48/96 steps),
with three humidity fields at 1800 seconds. Pressure/velocity/humidity adjacent
time-error ratios are about two, as expected for a first-order baseline.
Maximum local budget residual 2.35e-15; momentum residual 5.64e-16;
energy-identity residual 5.59e-16. All three four-step restarts are bitwise equal.

Independent reviewer probes cover 60 random graphs and 305 assertions. Refer
to code-review.md and review-source-bindings.json for final review status and
exact reviewed bytes. The later independent C5 review is recorded separately
in c5-review-addendum.md without rewriting the immutable C5 seal.

Next priority: a compatible coupling between nonlinear momentum and the C5
edge-based pressure/Coriolis subsystem. C5 P R is not identity: native relative
edge feedback error 0.00386, arbitrary-edge error 0.789. Preserve edge modes
and the correct energy metric; no direct nodal overwrite has been implemented.
Then validate higher-order momentum transport, thermodynamic energy and physical
water sources. Exact global angular momentum/PV and full climate acceptance
remain open. No formal-default promotion or complete-atmosphere claim occurred.
