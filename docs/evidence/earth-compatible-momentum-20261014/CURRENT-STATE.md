# C7 continuation state

Base: b8c0fce (C5 and C6 integrated), on branch
codex/compatible-momentum-coupling. Consult Git for later commit/merge status.
Once manifest.json exists, preserve this whole directory byte-for-byte and
continue numerical development in a new experiment directory.

Implemented: a metric-adjoint, incremental split-form momentum substep coupled
to frozen C5 pressure/Coriolis and shared air/water transfers. The transport
substep preserves the H-orthogonal ker(R) component of edge momentum; the
acoustic update can change it. The coupled model dissipates C5 reference
energy by the measured transport jump sum. It is a first-order nonlinear
composition with atomic rollback and versioned rebuilt-core checkpoints.

Independent review found a false rejection of exact and near-rest states by
the original relative-only whole-step energy guard. The corrected mixed
relative/roundoff allowance changes no state values and has 75 regression
assertions. The reviewer also verified rejection and complete rollback after
injecting a finite non-skew rotation defect. Accepted native runs retain the
original independent relative-energy threshold and use transport strength 1.

See selected-runs.json, report.md and code-review.md for the final numerical
matrix, independent review scope and counts. verification.json records all
successful, failed and superseded runs; manifest.json binds the sealed files.
Existing C1-C6 evidence, native source inputs and application defaults are
preserved. No full-physics acceptance or formal-default promotion occurred.

Next priority: derive a pressure-dependent kinetic metric and compatible
compressible momentum/pressure-work coupling, with independent energy and
refinement tests. Then extend thermodynamic energy and physical moisture
sources. The current half-divergence term is a consequence of the fixed
reference metric, not the full physical momentum tendency. Exact global
angular momentum/PV, higher-order nonlinear integration, long climate
behavior and production performance remain open.
