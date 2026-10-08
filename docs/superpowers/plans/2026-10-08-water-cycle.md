# Water budget and runoff implementation plan

> Use superpowers:executing-plans, inline execution and one independent final review.

**Goal:** Continue stage C with a closed, finite water-inventory model driven by the optional seasonal temperature simulation, with precipitation, soil moisture and runoff diagnostics/layers.

**Architecture:** Pure water state on the existing 48×24 equal-area grid, advanced after each stable thermal substep. Environment checkpoints retain temperature and all water reservoirs/fluxes together. UI and one additional small RGBA texture expose fields without changing procedural terrain or artistic river generation.

**Tech stack:** Existing TypeScript/WebGL2/Node/Playwright. No dependency or new worker.

**Spec:** The approved planet assessment's stage C, delivered first as the explicit water-tracer increment below. User said continue; follow the established inline workflow, without repeating approval gates. Stage B is preserved as a local checkpoint commit; no merge or remote push in this increment.

## Global constraints and model rules

- Work only in the independent sphere clone, `codex/water-cycle`. Preserve the user's current browser tab/painting. Default original layer with both environmental models disabled.
- A one-way diagnostic tracer: thermal temperature and absorbed daily solar radiation drive evaporation and moisture capacity; latent heat is NOT fed back to temperature. No weather prediction, pressure model, snow/ice, groundwater, sea-level movement or erosion.
- Columns of atmospheric water, soil water and standing surface water use kg/m² of whole cell (numerically mm water equivalent). Ocean inventory is global-mean kg/m²; finite initial ocean depth (default 1000m) times ocean fraction. Global sum is closed between resets.
- Land/ocean fractions and mean normalized land elevation come from the same pre-fold generated region snapshot. Soil capacity is 150mm per land area, initially half full. Vapor starts at half the empirical column capacity. Surface store starts empty. All-land has no hidden ocean outlet; all-ocean has no soil or river discharge.
- Illustrative vapor capacity: `20 exp(.06*(clamp(T,250,330)-288.15)) kg/m²`; this is an explicit model curve, not a retrieved humidity profile. Evaporative demand is at most an adjustable fraction (default .5) of absorbed sunlight divided by 2.45MJ/kg, multiplied by nonnegative vapor deficit and a liquid-water availability ramp from 273.15K to278.15K. It cannot remove more water than exists.
- Vapor undergoes conservative paired diffusion (default diffusivity1e6 m²/s) and prescribed eastward zonal drift (default10m/s). Stable donor-cell advection and diffusion have a combined outgoing-rate bound; cap the shared fixed substep accordingly. Signed wind and zero transport supported; longitude wraps, polar boundaries do not leak.
- Excess vapor precipitates with a6-hour relaxation timescale. Ocean share enters ocean inventory; land share first fills soil then standing water. Local soil above70% capacity drains into the surface reservoir on a3-day timescale. No flux is an external water source.
- Surface routing sends a bounded fraction toward the adjacent lowest hydraulic head, including stored lake depth, using a prescribed1m/s travel speed. Flow uses pre-routing heads and a destination-head equilibrium cap, with a simultaneous delta buffer. Depressions retain water until their level permits spilling. Coastal cells expose separate land and sea destinations with area-fraction-limited outlets, preventing an ocean transfer from lifting water onto elevated land; no forced carved drainage path.
- Discharge is actual transferred volume per second: `columnTransfer * cellArea / waterDensity / dt`; report m³/s. Rain/evaporation rates convert kg/m²/s to mm/day. Radius alters cell area and travel distances, not display size. Config/terrain/manual-time edits explicitly reinitialize environmental state rather than claiming conservation across external edits.
- Enabling water also enables thermal simulation. Disabling thermal disables water. Thermal/environment resets and last-presented-frame pause/rollback keep both histories aligned. Original map, temperature and existing art remain reversible.

## Review focus

- Multiple unpresented advances, speed changes and pause/hidden tab must restore every water inventory and flux alongside temperature/time.
- Empty ocean, all-land/all-ocean and filled depressions must conserve mass, keep stores nonnegative, and never fabricate ocean outflow.
- Wind/advection/diffusion at poles/seam, radius endpoints and high speed must remain stable with bounded work and honest time.
- Disabled/unsupported thermal state, parameter changes, painting and reset must invalidate matching state, preserve authored terrain, and never show stale water texture/probe values.
- Units and accounting: soil versus whole-cell depth, instantaneous discharge versus runoff production, ocean global mean and local fractions must be distinguished; all layers retain original coverage semantics.

### Task 1: Conservative water kernel and shared terrain sampling

Files: create `water.ts`, `tests/water.test.ts`; extend `thermal.ts` terrain sampling and absorbed forcing; `scripts/test.mjs`.
- [x] Write tests and observe RED: finite bounds, initial/global inventories, evaporation limitation, conservative seam/polar vapor transport, water budget, soil overflow, closed basin filling/spilling, all-land/all-ocean, physical area/discharge scaling, dt convergence.
- [x] Implement `WaterModel.step(dt,temperatureK,absorbedWm2)`, `.checkpoint/.restore/.diagnostics`, stable step bound and paired grid transport; preserve existing terrain classification tests.
- [x] Run Node/typecheck. Expected PASS.

### Task 2: Environment lifecycle, controls and visualization

Files: `thermal-runtime.ts`, `planet-controls.ts`, `water-panel.ts`, `planet-render.ts`, `render.ts`, DOM/GPU fixtures, `scripts/water-browser-check.mjs`.
- [x] Write browser assertions before integration and observe missing-layer RED.
- [x] Integrate coupled advancement/checkpoints, enable/reset rules, precipitation/soil/runoff layers, legends and probe values. Water pixels pack rain, soil saturation and log-scaled discharge into RGB.
- [x] Test queued updates/rollback, physical/display independence, painting without data loss, invalid controls, unsupported slow spin, reversibility and mobile layout.

### Task 3: Verification and review

- [x] Run all meaningful Node/typecheck/build and browser/GPU regressions; measure full paired solver cost; document scientific limits and evidence.
- [x] Independent final read-only review, reproduce/fix actionable findings, final checks and local handoff.

References: [USGS water cycle](https://www.usgs.gov/water-science-school/water-cycle), [FAO latent heat and water-depth units](https://www.fao.org/4/X0490E/x0490e04.htm). Numerical closures and initial stores above are deliberately chosen illustrative parameters, not implementations of FAO evapotranspiration or an observed Earth water cycle.
