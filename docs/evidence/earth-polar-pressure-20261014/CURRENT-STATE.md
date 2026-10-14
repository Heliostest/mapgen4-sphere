# C3 continuation state — 2026-10-14

The user-requested prior checkpoint was committed, merged and pushed to
`origin/main` at `7d37aa2`. C2 evidence is frozen, including its failed strong
polar spatial gate. C3 continues in `codex/polar-pressure-accuracy`.

C3 final selection:

- Fitter: `fit-graph-v4.py`, 24 neighbours, kernel 24.
- Refinement: `c3-fit-near-k24-refinement-v1` (24, 48, 96 rings).
- Independent spatial gate: `c3-spatial-near-audit-v1` (45 checks, 55 cases).
- Coupled gate: `c3-coupled-near-v1`, `coupled-graph-v2.jl` (147 tests).
- Sampled global and polar wave errors improve for all three fields; unequal
  layer momentum exercises nonzero vertical exchange. Shared budgets and
  one-step rebuilt-core restart pass.

Do not promote old exploratory acceptance flags. In particular the wider v3
graph regresses l2/l3 waves and the iterative v2 fit lacks coordinate accuracy.
Use the selected independent audit and coupling SHA bindings.

Next unresolved task: import native winds into graph momentum with explicit
divergence/solenoidal constraints, then native temporal/tracer validation. No
native wind import, complete physical coupling, new long climate run, or formal
default promotion has happened. See `report.md` for exact scope and limits.

Once `manifest.json` exists, keep this entire C3 directory and its raw evidence
immutable. Start subsequent work in a new directory/run namespace.
