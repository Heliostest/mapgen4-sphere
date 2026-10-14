# C5 implementation ledger

Plan: docs/superpowers/plans/2026-10-14-rotating-graph.md. Base 56922fa.
Ruling: continue the user's authorized improvement direction inline, with a
bounded rotating-subsystem gate; do not label this full nonlinear C5 dynamics.
Existing clean checkout uses a separate feature branch and new experiment
directory, avoiding copies of the installed Julia runtime and frozen data.

Task 1: operator RED 9 failures / 10 passes, then GREEN 19 / 19. Independent
Cartesian dense assembly rejects a no-op. Analytic GREEN 138 / 138 on all three
frozen grids. Maximum global reconstruction errors .0491794/.0137082/.00397993.

Task 2: coupling RED 3 failures / 19 passes (missing rotation and identity),
then GREEN 22 / 22. Independent full-system exp errors decrease by
4.00183/4.00046/4.00011. Zero-spin bitwise compatibility, failed-step rollback,
reconstructed-core restart and mismatched spin rejection pass.

Task 3: all native one-day runs passed, 1800s three humidity cases and rebuilt
four-step restarts, 900/450/225s real humidity. Temporal-v1 failed because the
invocation omitted four run arguments; unchanged script passed as temporal-v2.
All p/j/q adjacent differences decrease at approximately fourfold per halving.
Covariance10, source binding7 and project278/typecheck/build also passed.

Review ruling: four fresh-context reviewer attempts failed before execution
with model capacity errors. Author self-review recorded explicitly; no claim
of independent approval, and do not merge this checkpoint pending fresh review.
Numerical and source evidence can still be sealed as an experimental checkpoint.
The originally chosen reviewers and fallback results are in code-review.md.
