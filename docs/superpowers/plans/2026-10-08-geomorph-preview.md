# Geomorphology preview implementation plan

> Use superpowers:executing-plans inline, with one independent final review.

**Goal:** Begin stage D with a conservative erosion/deposition model, separate geological years, and reversible terrain preview/undo.
**Architecture:** A pure coarse-grid solid-volume model captures the current water discharge and source terrain. A small runtime owns the captured source identity, preview, and one-step undo. Renderer projects relative coarse land-height changes onto its retained source vertex buffers, using the same elevations for GPU geometry and CPU picking. Authored constraints and worker-owned geometry remain untouched.
**Tech stack:** Existing TypeScript, WebGL2, Node tests and Playwright; no dependency or worker added.
**Spec:** Stage D in the existing planet-physics assessment, delivered as the preview increment below. Continued user authorization covers implementation without another approval gate. Persisting/applied terrain and recoupled climate/river geometry are later increments.

## Model and product rules

- Preserve completed stage C in a local checkpoint; work in `codex/geomorph-preview`, independent sphere clone. No merge/push, no reload of existing user tabs.
- `GeomorphModel` owns bed height in metres per land area, mobile sediment volume per whole-cell area, ocean sediment volume per global area, and geological years. Equal bulk density/no porosity change: total solid volume `mean(land*height + mobile) + ocean` is closed. No uplift, negative bed height, sea-level change or fabricated outlet on an all-land closed surface.
- Captured discharge is a frozen latest-step field in m³/s. New hydrology capture restarts the geological experiment. It is explicitly not mean annual discharge or a dynamic coupled climate. Thermal/water source replacement (terrain/config/time reset or disable) invalidates the experiment. Ordinary climate advancement leaves the captured forcing unchanged and labelled with its date.
- Current bed gradients route to the steepest lower adjacent land or sea outlet, including a local sea outlet in mixed cells. Land/sea destinations are separate and outlet fractions bound transport. Closed depressions retain sediment, which deposits and can change future gradients. No forced pit filling.
- Stream-power-inspired incision: `E = K sqrt(Q / 1000 m³/s) slope`, with K in m/year; default K=1, allowed0..100. Empirical illustrative parameters, not planetary calibration. Cut material enters mobile sediment, never disappears. Incision obeys bed and gradient bounds.
- Pairwise land-only diffusion uses grid conductance times diffusivity (default1e4m²/year, range0..1e7) and minimum land fraction; transfer is conservative in solid volume. This broad-scale smoothing coefficient is an illustrative control, not calibrated soil creep.
- Mobile sediment moves to the lower outlet with relaxation timescale `tau/sqrt(Q/1000)`; it settles into local bed with tau (default10000 years, range1..1e6). Ocean arrivals enter a retained inventory, not a changed seabed or sea level.
- Fixed substep is bounded by 2500 years, .2*tau, .2*tau/max(sqrt(Q/1000)), land diffusion outgoing rates and incision gradient response. Each click advances at most32 steps and reports actual years/limiting; never pretend a requested large duration finished. Remainders below a fixed step can be ignored explicitly with guidance to increase requested duration. Default requested100000 years.
- Preview projects a bilinearly interpolated ratio of current/base coarse land heights (land-weighted) onto existing positive authored elevations and decorative folds. Negative ocean elevations stay unchanged. This visualization preserves fine authored detail and uses consistent GPU/CPU geometry; coarse model budgets do not assert conservative fine-mesh remapping.
- Capture, advance, undo and reset pause astronomy at its presented state first. Geology only advances by explicit buttons. Undo restores the entire preceding click state; reset removes preview and leaves authorship untouched. Checkbox compares original and evolved terrain. Painting uses current preview picking, then the resulting worker snapshot invalidates preview. No edits to transferred arrays or stale worker-result adoption.
- Optional `erosion` display layer encodes signed net bed-height change in metres (fixed−100..+100m diverging colors, saturating). Probe reports coarse net change and mobile sediment depth as well as rendered physical height. Source climate still describes source terrain; preview does not recouple it. No apply/persist button until conservative application and regenerated flow are implemented.

## Review focus

- Source replacement, in-flight worker geometry and preview toggles must never mutate/detach authored buffers, use stale geomorphology, or erase painting.
- CPU picking and physical probe heights must match the previewed GPU surface under camera rotation and artist radius/height changes; coast/seam/pole interpolation must stay finite and nonnegative.
- Dry/all-land/all-ocean/mixed/coastal cases must conserve solid volume and never cut uphill, create negative stores or deposit onto high coastal land via a sea-level outlet.
- Tiny radius, extreme coefficients and huge requested durations must have bounded work, explicit actual geological time and stable finite stores.
- Capture/undo/reset/hidden-tab and multiple queued astronomical updates must freeze at the presented state; ordinary climate playback must not advance geological time or silently change frozen discharge.

### Task 1: Conservative kernel and projection

Files: `geomorph.ts`, `terrain-preview.ts`, `tests/geomorph.test.ts`, `scripts/test.mjs`.
- [x] RED tests for no-forcing equilibrium, dry smoothing, discharge incision, closed sediment/sea inventory, coast/closed-basin behavior, bounds, convergence, scale and complete undo data; projection identity/coast/seam/poles.
- [x] Implement kernel `step()`, `advance(years,maxSteps=32)`, checkpoint/restore/diagnostics and projection helper.
- [x] Node suite GREEN; preserve earlier tests.

### Task 2: Reversible runtime, controls and actual terrain rendering

Files: `geomorph-runtime.ts`, `geomorph-panel.ts`, `planet-controls.ts`, `planet-render.ts`, `render.ts`, browser/DOM/GPU fixtures.
- [x] Browser RED missing geomorph panel.
- [x] Capture current acknowledged water state; invalidate by source identity; frozen forcing, one-click undo, compare/reset, status and legends.
- [x] Retain independent base vertex buffers and rebuild preview atlas/picking together; worker buffers remain original. Add diagnostic texture at unit6.
- [x] Verify deformation, exact restoration, paused geology, rollback/capture, painting and reset, artist scale, invalid/unsupported state and mobile controls.

### Task 3: Validation and review

- [x] Node/typecheck/build, affected browser/DOM/GPU and legacy regressions; benchmark bounded kernel and record actual visual evidence and scientific limits.
- [x] One independent final read-only review, one test-driven fix pass if needed, final documentation and local handoff.

References: Landlab [stream power](https://landlab.csdms.io/generated/api/landlab.components.stream_power.stream_power.html) and [linear diffusion](https://landlab.csdms.io/generated/api/landlab.components.diffusion.diffusion.html). This code is its own conservative illustrative model, not Landlab or a validated erosion forecast.
