# Independent C2 review

Read-only reviewer `review_c2`, 2026-10-13. Review scope: modal-core.jl,
fct-transport.jl, fct-core.jl, native-fct-v2.jl, run-accuracy-v2.mjs, tests,
protocol and verification layer. Base/head stayed
80414dc6ee18670993cc5f01820a0efc1c5632f9; changes are new experimental files.

No new must-fix findings. The reviewer checked the modal pressure/momentum
evolution and time-integrated flux signs, Lipschitz interval positivity bound,
shared sigma transfer signs, FCT capacities and restarted GMRES implementation.
They independently verified all 222 C1 snapshot bindings, with no mismatch.
Observed test logs: modal 281, FCT 1898, coupled 253 checks.

One inherited limitation was reproduced independently: C1 `advance!` commits
each accepted substep immediately. A later failure at minimum dt leaves the
state at the last accepted time; the entire requested interval is NOT atomic.
The two-cell example with p=[1,1], j=[2], dt=2pi/sqrt(2), minimum_dt=.01 throws
after reaching time 0.5532587838487308 and p approximately [0.0029765,1.9970235].
Individual C2 `step!` rejections remain atomic. A caller needing interval-level
rollback must retain and restore a checkpoint. Final native runs separately
record accepted steps/rejections; this distinction must not be hidden.

The numerical analyzer is not the final provenance gate. verify-results.mjs
requires passed status, exit code0, unchanged source/input records, archive
hashes and current implementation hashes. Final acceptance is conditional on
that verifier succeeding after all jobs finish.

Declined scope: full atmospheric coupling, strong polar pressure accuracy,
climate validation and general scalability. These require evidence beyond the
experimental fixed-reference operators and are explicitly unaccepted.
