# Planet physics foundation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans in this session. Steps are verified before progressing.

**Goal:** Implement stage A: physical units and diagnostics, an analytical solar clock, optional day/night and insolation layers, and location inspection without changing authored terrain.

**Architecture:** Keep the original generator, artist geometry and renderer. Pure SI math supplies a small render snapshot; a separate panel owns the clock and physical configuration. Physical elevation snapshots remain distinct from decorative folds.

**Tech Stack:** Existing TypeScript, WebGL2, gl-matrix, Node tests, esbuild; no new product dependencies.

**Spec:** The assessment approved by the user's “你逐步做吧”: `C:/Users/helio/.codex/visualizations/2026/10/08/01a11acd-4a72-78b2-8fce-19e2ddcb936d/planet-physics-assessment.md`, sections 4–8, stage A only.

## Global Constraints

- Work only in the dedicated `mapgen4-sphere` clone, on `codex/planet-physics`; do not touch the original repository.
- No merge/push. Keep changes reviewable in this checkout.
- Default: original layer, paused, surface-following view, existing terrain appearance unchanged.
- Separate physical radius (m) and scene radius (100–1000). Physical edits never regenerate terrain.
- Density mode only in this first increment; constant-mass and linked display-size modes are deferred controls, not hidden behavior.
- Earth preset: R=6371008.4m, density=5513.4kg/m³, relief=10000m, bathymetry=11000m, sidereal period=86164.09054s, obliquity=23.43928°, orbit=1AU, Bond albedo=.3. Solar GM and luminosity are fixed and documented.
- UI labels include units. Teq explicitly says radiation equilibrium, not surface temperature.
- Preserve body-coordinate brush edits; painting/inspection and hidden tabs pause the analytical clock.
- Add versioned configuration interfaces, not a save-file feature or a fluid/rigid-body engine.

## Review Focus

- Changing scene radius, physical radius, relief or density while there are painted edits must preserve those edits (browser test).
- Spin in space view must transform picking as well as rendering; polar/antimeridian picks must still recover body coordinates (Node/GPU/browser).
- Hidden/resumed tabs and speed changes must not silently jump the clock; equivalent elapsed time at 30/60/144Hz must agree (Node/browser).
- Original mode must retain colors and alpha/outline semantics; cached passes must invalidate after painting, reset and river changes (baseline image/browser/GPU).
- Invalid numeric input, synchronous/retrograde/zero-tilt limits, stale worker snapshots, and inspection without painting must not corrupt the model (Node/browser).

### Task 1: SI planet, astronomy and deterministic clock

**Files:** create `planet.ts`, `astronomy.ts`, `simulation-clock.ts`, `tests/planet.test.ts`; modify `scripts/test.mjs`.

**Interfaces:** `derivePlanet(config)`, `physicalHeight(e,config)`, `deriveOrbit(planet,orbit)`, `sunState(planet,orbit,timeS)`, `incidentFlux(direction,sun,flux)`, `localSolarHour(direction,sun)`, `SimulationClock` with `setPlaying`, `setSpeed`, `seek`, `tick`.

- [x] Write independent tests: Earth g≈9.82 and escape≈11.19km/s; double R at constant density gives M×8/g×2; 1AU year≈365.256d, flux≈1361W/m², Teq≈255K; zero-tilt quarter spin puts sun west; solstice declination equals tilt; polar day/night and retrograde are finite; integrated insolation→S/4; frame-rate invariance and pause/speed boundaries.
- [x] Run `npm test`. Expected RED for missing functions, then named assertions on stubbed interfaces.
- [x] Implement pure bounded SI interfaces and analytical phases. No DOM or mesh mutation.
- [x] Run `npm test`. Expected all tests pass.
- [x] Record results in the plan ledger; no commit required in this phase.

### Task 2: Renderer/picking and physical elevation snapshot

**Files:** modify `sphere-view.ts`, `render.ts`, `worker.ts`, `mapgen4.ts`; create `planet-render.ts`, `tests/gpu-insolation.ts/html`; extend Node and GPU fixtures.

**Interfaces:** typed `PlanetView` with body sun direction, optional model matrix, layer and flux; `Renderer.updatePlanet(view)`, `Renderer.sampleTerrain(coords)`; `sphereProjection(param, model?)`; ray hit includes original barycentric location and physical elevation can be sampled independently.

- [x] Add RED tests for model-rotated body picking and GPU layer/sun invariants; extend actual radial fixture with model rotations.
- [x] Implement optional model transform in shared CPU/GPU projection, a small actual shader snippet, and fold-free elevation snapshot from Worker.
- [x] Cache land/river atlas and picking positions; invalidate on appropriate map/height/radius/outline changes. Keep depth/drape clears per frame.
- [x] Run Node tests/typecheck/build and actual GPU fixtures. Expected PASS; original layer exactly restores baseline on this GPU within existing tolerance.
- [x] Record evidence in ledger.

### Task 3: Controls, probing and compatibility

**Files:** create `planet-controls.ts`; modify `mapgen4.ts`, `painting.ts`, `embed.html`; create `scripts/planet-browser-check.mjs`; update `scripts/browser-check.mjs` base URL and legacy-control selector only.

**Interfaces:** panel drives pure config/clock and `Renderer.updatePlanet`; existing render controls remain independent. Painting has `inspecting` and `onBeforePaint` hooks. Worker results attach matching physical elevation snapshots.

- [x] Write browser assertions before integration: defaults, scaling without generation, layer changes, play/pause, background pause, inspect without paint, space-view paint, original image restoration and mobile layout.
- [x] Observe RED missing panel behavior, then implement the panel using existing compact control styling.
- [x] Use a dedicated local preview on port 8002, preserve existing browser pages.
- [x] Run all browser/GPU checks, full `npm test`, `npm run typecheck`, `npm run build`, `git diff --check`.
- [x] Document scientific assumptions and evidence in README/validation; obtain one independent read-only final review, address actionable findings and verify fixes.
