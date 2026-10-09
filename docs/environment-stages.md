# Coupled environment: five stages

All work is isolated in `mapgen4-sphere` on `codex/coupled-environment`. Start the local preview with the existing server, select **Generate climate**, then open **Ice, ocean & vegetation**. The optional systems share the same physical clock. Changing a physical mode restarts climate; changing the weather display does not.

| Stage | Result | Details and evidence |
|---|---|---|
| Complete simulation files | Terrain, clock, physical fields, compensation terms, vegetation, ice, circulation and comparison state restore atomically; resumed evolution is deterministic | [Save/restore](simulation-save.md) |
| Terrain water | Conserved surface water routes over the authored triangle topology, fills depressions, spills over sills and drives visible river widths, lake masks and wet ground | [Terrain water](terrain-water.md) |
| Grounded ice | Finite snow compaction, ice flow and melt, conservative abrasion/sediment candidate, explicit reversible terrain application | [Glaciers](glaciers.md) |
| Evolving circulation | Temperature-driven wind perturbations, signed Coriolis and drag, wind-driven ocean-loop memory with conservative heat transport | [Circulation](circulation.md) |
| Weather display | Moisture-derived cloud shading and actual liquid/frozen precipitation glyphs, wind orientation, exact pause and restored pixels | [Clouds and precipitation](weather.md) |

The Original layer preserves the artistic map. Complete simulation files retain all active optional systems and the weather view preference. Older complete files migrate optional fields safely; older terrain files still start with climate off. Invalid files are validated against independent candidate models and generated terrain before replacing the current world.

These are bounded illustrative models. Climate and grounded ice use a 48×24 equal-area grid by default, so narrow valley glaciers and detailed weather systems remain unresolved. Terrain water uses much finer authored triangles but is reservoir routing, not a flood solver. Ocean transport is a conservative surface closure, not a deep-ocean/GCM calculation. Cloud shading is a surface diagnostic, not 3D cloud microphysics. The linked stage documents describe these limits and measured numerical budgets.

Acceptance combines numerical tests, real browser download/upload and exact resumed-state/pixel comparisons, controlled production-GPU fixtures, mobile checks and independent phase reviews. The final weather acceptance also enables terrain routing, glaciers, evolving circulation and weather together and verifies a complete-world restore. Evidence is recorded under `docs/evidence/`; repeatable scripts are under `scripts/`.

Final acceptance on 2026-10-09: **137/137 numerical/document tests**, typecheck/build, and **46 browser acceptance groups across eight suites** pass. The [combined final regression report](evidence/environment-final-regression.json) includes all suite results and GPU checks. Each phase received independent review; all actionable findings were fixed and no review findings remain deferred.

![All optional environment systems enabled](evidence/environment-all-systems.png)
