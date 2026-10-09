# Coupled environment implementation plan

Goal: directly generated, evolving ice/water/heat/vegetation with reviewable comparisons.
Architecture: conservative water and thermal columns plus environment state,
geographic downscaling, UI-only baseline/history snapshots.
Tech stack: TypeScript, existing finite-volume grid and WebGL renderer, DOM/canvas.
Spec: ../specs/2026-10-09-coupled-environment-design.md

Global constraints: preserve terrain and polar sampling, no hidden warm-up,
bounded deterministic steps, checkpoint every evolving field, no external writes.

Review focus: mass/enthalpy accounting; positivity and timestep stability; coastline
and polar rendering; rollback and resets; honest diagnostics and usability.

1. Add failing conservation, phase, ocean, vegetation and runtime integration tests.
2. Add water frozen stores and latent exchange; thermal albedo/exchange accounting;
   implement phase projection and conservative ocean transport.
3. Add vegetation history, direct initialization and geographic surface downscaling;
   integrate fixed steps/checkpoints, runoff and erosion forcing.
4. Add live metrics, comparison maps/profiles/history, baseline capture and CSV.
5. Run focused then full tests/typecheck/build; inspect actual production browser;
   independent review, fix findings, document limits and commit local branch.

## Execution record

- Isolated on codex/coupled-environment in the existing clean checkout, retaining
  the user's localhost server and independent parent repository.
- Tasks 1–3: meaningful RED on absent frozen stores/coupled runtime, then conservation,
  phase, currents, vegetation and checkpoint tests GREEN.
- Task 4: comparison maps/table/history/provenance/export implemented; browser checks
  seven groups GREEN. Legacy table-color conflict reproduced and fixed.
- Task 5: 103 tests, typecheck, build and existing surface/planet/water browser suites
  verified. Independent review findings reproduced and fixed. Validation and evidence
  in docs/validation.md. No pending implementation or deferred findings.
- Ruling: use a single mixed thermal column and fixed-capacity enthalpy plus fine
  geographic display estimates; explicitly excludes empirical ice thickness and
  momentum/salinity. A more detailed physical model would require new state/equations.
- Ruling: keep terrain persistence unchanged, with session-only environment settings
  and comparisons clearly labeled; reload requires regeneration.
