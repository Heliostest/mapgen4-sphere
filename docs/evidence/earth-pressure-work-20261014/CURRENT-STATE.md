# C8 continuation state

Base 6a7589687ec075cde17d7d79ef622f96c5520378, branch
codex/pressure-work-discrete-gradient. Consult Git for later integration status.
After manifest.json exists, preserve this entire directory byte-for-byte and
continue in a new experiment directory.

Implemented: actual-pressure edge kinetic energy, barotropic compression
potential, exact endpoint discrete chain rule and symmetric nonlinear Newton
solve for pressure/edge velocity. Shared integrated mass transfers drive
water FCT. State fields commit only after finite energy, equation and local
budget checks. Checkpoints bind the graph, reference, layers and scheme.

Review-driven fixes include extreme positive pressure/logarithm handling,
divided-difference branch accuracy in physical pressure units, and late
water-budget rollback. Failing tests and native diagnostic traces are retained.
Selected final runs are listed in selected-runs.json; report.md and code-review.md
state measured results and independent review scope. verification.json and
manifest.json record final sealing without rewriting this continuation note.

C8 is an isolated pressure-work subsystem. It does not integrate C7 Coriolis
or nonlinear transport, and does not advect vortical or vertical momentum.
All native edge components are retained, but circulation and inter-layer
velocity differences stay fixed under this gradient-only force. The declared
second order applies to its pressure/velocity ODE, not the full atmosphere.

Next priority: derive a compatible vorticity/vertical momentum and rotation
coupling under the evolving pressure metric. Then extend thermodynamic energy
and physical moisture sources. Preserve inherited C1-C7 and the formal default;
do not splice C7's fixed-metric operators into this model without a new energy
and consistency derivation.
