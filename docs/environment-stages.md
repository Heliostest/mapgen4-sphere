# Coupled environment: five stages

The five systems live in the independent `mapgen4-sphere` repository. Start the local preview with the existing server, select **Generate climate**, then open **Ice, ocean & vegetation**. The optional systems share the same physical clock. Changing a physical mode restarts climate; changing the weather display does not.

| Stage | Result | Details and evidence |
|---|---|---|
| Complete simulation files | Terrain, clock, physical fields, compensation terms, vegetation, ice, circulation and comparison state restore atomically; resumed evolution is deterministic | [Save/restore](simulation-save.md) |
| Terrain water | Conserved surface water routes over the authored triangle topology, fills depressions, spills over sills and drives visible river widths, lake masks and wet ground | [Terrain water](terrain-water.md) |
| Grounded ice | Finite snow compaction, ice flow and melt, conservative abrasion/sediment candidate, explicit reversible terrain application | [Glaciers](glaciers.md) |
| Evolving circulation | Temperature-driven wind perturbations, signed Coriolis and drag, wind-driven ocean-loop memory with conservative heat transport | [Circulation](circulation.md) |
| Weather display | Moisture-derived cloud cover, exact pause and restored pixels | [Cloud cover](weather.md) |

Normal startup enables all of these coupled environment systems, selects Natural surface / From space, and plays at one simulated hour per second after the terrain is ready. The **Live planet** button restores this display while preserving authored terrain; it regenerates climate if enabling a previously disabled system. Terrain erosion capture and application remain manual. Complete saves still restore paused with their own flags. Use `embed.html?mode=editor` for the historical paused editor; the individual subsystem browser suites use that explicit starting state, while `tests/live-planet.html` checks the default live startup.

The Original layer preserves the artistic map. Complete simulation files retain all active optional systems and the weather view preference. Older complete files migrate optional fields safely; older terrain files still start with climate off. Invalid files are validated against independent candidate models and generated terrain before replacing the current world.

These are bounded illustrative models. Climate and grounded ice use a 48×24 equal-area grid by default, so narrow valley glaciers and detailed weather systems remain unresolved. Terrain water uses much finer authored triangles but is reservoir routing, not a flood solver. Ocean transport is a conservative surface closure, not a deep-ocean/GCM calculation. Cloud shading is a surface diagnostic, not 3D cloud microphysics. The linked stage documents describe these limits and measured numerical budgets.

Acceptance combines numerical tests, real browser download/upload and exact resumed-state/pixel comparisons, controlled production-GPU fixtures, mobile checks and independent phase reviews. The final weather acceptance also enables terrain routing, glaciers, evolving circulation and weather together and verifies a complete-world restore. Evidence is recorded under `docs/evidence/`; repeatable scripts are under `scripts/`.

The initial release recorded **137/137 numerical/document tests** and **46 browser groups across eight suites** in the [historical combined report](evidence/environment-final-regression.json). Subsequent stage rechecks added numerical regressions and fixes. The [current stage-five and coupled recheck](weather-stage5-recheck.md) has the latest source fingerprints, actual visual evidence and results. It distinguishes a reproduced strict pixel failure from later passing runs: physical state continuation and budgets close, but occasional 1/255 GPU differences are still an open rendering stability issue. This limitation is not a solved cloud-model error.

![All optional environment systems enabled](evidence/environment-all-systems.png)
