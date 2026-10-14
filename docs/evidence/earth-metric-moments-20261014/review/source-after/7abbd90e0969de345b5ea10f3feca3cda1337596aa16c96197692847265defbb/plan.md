# C10 graph-metric refinement implementation plan

Use superpowers:executing-plans inline, with one fresh independent reviewer.
Spec: protocol.md. Julia, Python NumPy/SciPy and Node use existing runtimes.
Keep this numerical evidence ledger; preserve every frozen ancestor byte.

- [x] Task 1: metric-fit.py supplies fit_metric(graph, penalty=.01,
  floor=.01, maxiter=30) -> (graph, report). Test no-op RED then implement the
  positive-floor dual solve and explicit guards. test-metric.py owns bounds,
  topology, malformed data, covariance, deterministic and exhaustion tests.
- [x] Task 2: fit-run.py exports all three complete graphs and histories.
  spatial.jl compares common-metric force components and held-out fields;
  harmonic.jl audits scalar Laplacian proxies. common.jl resolves new graph
  inputs while importing the exact C9 modules. No new dynamical core.
- [x] Task 3: native-run.jl and compare-time.jl reuse C9 validation logic;
  add explicit old-metric checkpoint rejection. Run complete native matrix,
  source-binding tests and 278 project tests/typecheck/build.
- [ ] Task 4: report/plot/continuation state, fresh code/evidence review,
  archive and one-time seal. Commit, verify Git bytes, merge, check, push.

Pre-flight interface: fitter outputs unchanged edge ordering and positive
conductance; graph_core consumes conductance*distance. Common error norms
use original h and original physical samples, not candidate normalization.
Native new 48-ring geometry must equal the old native geometry in all fields
except conductance. Existing checkpoint identity binds those conductances.

Review focus: objective/floor bookkeeping in the dual solve; basis covariance
and near-zero weights; finite validation and failure before output; common
norms/held-out comparisons; new-metric checkpoint and solver invariants.

Execution ruling: continue standing authorized improvement/integration work
in this checkout on codex/polar-metric-refinement. No repeated approval menu.
This metric correction leaves the C9 physical equations unchanged; all
numerical results remain specific to the changed graph. Preserve research
history rather than delete failed probes or the plan.

As of the final documentation freeze, Tasks 1-3 and Task 4's report/plot and
numerical review are complete: 12 selected runs, 141 Julia assertions,
seven Python test groups, 14 source-binding checks, 278 project tests,
typecheck and build. The initial spatial harness failed on vector/matrix
addition; corrected broadcasting passed the full v2 matrix. No parameter
or acceptance gate changed. Independent numerical and final evidence
audits pass. Receipt of final review bindings, archive/seal and authorized
Git integration follow this freeze; Git records their completion without
rewriting this immutable plan.
