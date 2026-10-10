# Complete simulation save and resume

Use **Save & restore world → Download complete simulation** to capture the visible paused world. The file includes authored terrain and applied erosion, planet/orbit and display settings, clock/speed, thermal and water options, every prognostic field, initial budget values and compensation terms, geographic reference fields, vegetation mixture, and comparison baseline/history. Loading restores a paused world; Play continues from that moment.

`mapgen4-sphere-simulation` version 1 embeds the unchanged terrain document version 1. Arrays use JSON numbers (Float64 roundtrips), dimensions are explicit, and the UTF-8 file limit is 32 MiB. A representative evolved world is about 3.0 MB. Unknown versions, wrong mesh, wrong dimensions, nonfinite/out-of-range data, inconsistent times/steps/active states and mismatched terrain are rejected. Derived textures and ocean diagnostics are rebuilt; climate is not regenerated on resume. Both geographic poles retain the original 96×49 surface sampling.

The loader constructs an independent model and generates candidate terrain in a temporary worker before replacing the complete live world. Edits, new loads or advancing time during preparation cancel an older request. Pause before loading a complete file. A failed load leaves the existing world intact.

**Download terrain JSON** remains available for the smaller terrain-only version-1 format (8 MiB limit). It keeps its earlier behavior: loading reconstructs terrain, pauses and switches climate off. Unapplied geological previews and undo stacks are intentionally excluded from both file formats; the controls explain this. Apply erosion before saving to retain its terrain effects.

Optional `terrain.drainage` holds a source string and mesh-triangle `basinId`, `terminal` and optional `inlandLakeId` arrays. IDs are nonnegative Int32-compatible integers; terminal values are 0/1 and require a positive basin ID. The decoder checks lengths and values against the saved mesh. Files without these fields remain valid. Derived reference channels and lake vertex masks rebuild from the restored terrain; prognostic water volumes are still in the existing runtime ledger.

Render parameters `fused_rivers`, `fused_river_min_flow` (m³/s), `fused_river_width` and `fused_river_max_width` (edge-length ratio) roundtrip independently of physical routing. An older document that omits them restores enabled / 300 / 0.07 / 0.85. [Earth browser roundtrip](evidence/earth-endorheic-rivers-20261011/browser-roundtrip.json) checks actual evolved downloads against complete restored runtime, terrain/drainage and view fields.

## Acceptance, 2026-10-09

- 110 Node tests, TypeScript check and production build passed.
- Real browser save at step 3832 (~49 days), restore, then continue to step 7665 (~98 days): all runtime and terrain fields exactly match uninterrupted execution; both restored and continued globe PNGs are byte-identical to their controls.
- Baseline, history, parameters and comparison CSV survive; final water residual −1.9313301891088486e−7 mm and enthalpy residual 1.773238182067871e−6 J/m². Existing thresholds were not relaxed.
- Malformed versions/arrays/nonfinite fields and a climate terrain mismatch preserve the current world. A delayed candidate canceled after a new edit. Legacy, climate-off, applied erosion and subsequent brush painting all roundtrip.
- Environment, surface/poles, application, planet and water browser regressions ran against the actual preview. Main-session visual inspection covered restored globe, comparison, authored terrain and mobile controls. Independent code review found missing active-state validation; a failing regression reproduced it and the decoder now rejects it. Inconsistent saved albedo is also rejected.
- Expanded authored-terrain testing found an existing snow seeding roundoff bug: subtracting `(soil + surface) - surface` could leave a tiny negative soil store. Each donor is now capped and subtracted separately, preserving nonnegative storage and the existing water budget tolerance.

Evidence: [report](evidence/simulation-report.json), [comparison](evidence/simulation-comparison.png), [restored globe](evidence/simulation-restored.png), [mobile controls](evidence/simulation-mobile.png), [CSV](evidence/simulation-comparison.csv). Run `scripts/simulation-browser-check.mjs` with the repository's `PLAYWRIGHT_MODULE` and `BASE_URL`; full transient documents and branch captures are written to `build/validation/simulation/`.
