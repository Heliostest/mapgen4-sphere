# Seasonal temperature implementation plan

> Use superpowers:executing-plans, inline implementation and one independent final review.

**Goal:** Continue the approved planet roadmap with an optional, time-evolving seasonal energy-balance model. Original terrain, brushes and default appearance stay intact.

**Architecture:** A pure Float64 thermal solver on a 48×24 equal-area spherical grid; generated region elevations supply land fractions. A synchronous bounded controller shares the astronomical clock. One small RGBA texture supplies the optional temperature layer. No new dependency or worker is needed unless measured cost warrants it.

**Tech stack:** Existing TypeScript, WebGL2, Node tests and Playwright.

**Spec:** Stage B of the previously approved planet-physics assessment, refined below. User requested continued improvement after stage A; implement locally on `codex/seasonal-temperature` without repeating approval gates. Commit/merge/push remain separate delivery actions.

## Model and acceptance rules

- Daily-mean solar forcing, not hourly weather: `C dT/dt = (1-a)Qdaily - emissivity*sigma*T^4 + diffusion`. No lapse rate, ice feedback or changes to generated rainfall/rivers/biomes.
- Latitude coordinate is `x=sin(latitude)`; each cell has solid angle `4pi/N`. Periodic longitude, zero flux at poles. Each edge transfers equal and opposite energy. Conductance uses the finite-volume spherical metric; fixed physical transport scales with `(EarthRadius/R)^2`.
- Default land heat capacity 2e6 J/(m² K); ocean 10m mixed layer at 4.2e6 J/(m³ K); effective emissivity .61; Earth-scale diffusion coefficient .55 W/(m² K). These are exposed model assumptions, not derived atmosphere properties.
- Initial state is spatially uniform global greybody equilibrium, not a spun-up climate. Reset explicitly restarts that transient. Land fraction is region-count sampling in equal-area cells, with nearest-region fallback for empty cells; no claim of conservative remapping of an existing climate.
- Stable explicit fixed substeps, at most 1800s and 1/720 year, bounded by the sum of diffusion and radiative derivatives. At most 32 substeps per animation update; cap simulated clock advance rather than accumulating an unreported backlog. Temperature timestamp is shown; its discretization lag is under one substep.
- Pause restores the last presented clock and the corresponding thermal state from a checkpoint retained until presentation is acknowledged. Multiple unpresented updates must not replace it. Manual time/season/config edits or new terrain reset thermal state at that time. Scene radius/artist height/camera edits preserve state.
- Daily averaging is unavailable when the mean solar day exceeds 1/20 year, including synchronous spin. Explain this in the panel; astronomy remains usable.
- Thermal model is off by default. Selecting Temperature enables it. It runs with existing Play/speed and has reset/enable controls, mean/range/budget/time readouts, a °C legend and cell temperature in inspection. Disable restores the original layer if necessary.
- No saved state, weather, atmospheric circulation, latent heat, physical ice or erosion in this increment.

## Review focus

- Pause after a queued thermal update, then resume: displayed time/field must agree and no spurious reset occur.
- Parameter edits, paint/reset and old terrain data: only corresponding generated terrain may initialize the model; no physics update calls generation.
- Fast speeds, tiny radii and slow/synchronous spin: bounded main-thread work, honest time, finite temperature and visible unsupported-state explanation.
- Seam/poles and camera rotations: temperature stays in body coordinates; original pixels/coverage/brush behavior remain compatible.
- Energy accounting, frame-rate independence and dt convergence: pair exchanges cancel and accumulated heat agrees with integrated radiation.

### Task 1: Grid, forcing, solver and state controller

Files: `thermal.ts`, `thermal-runtime.ts`, `tests/thermal.test.ts`, `scripts/test.mjs`, `simulation-clock.ts`.
Interfaces: `makeThermalGrid`, `dailyMeanInsolation`, `landFractions`, `ThermalModel.advanceTo`, `.checkpoint/.restore`, `.diagnostics`; `ThermalRuntime.sync/.invalidate/.setTerrain/.maxAdvanceS`.
- [x] Add tests and observe missing-module RED: equal area and closed topology, daily mean analytic limits/global S/4, uniform diffusion/no-source conservation, sea/land inertia, parameter bounds, deterministic partitioned time, dt convergence, budget closure, checkpoint rollback and clock cap.
- [x] Implement SI math, fixed stable stepping and bounded synchronization; run Node suite/typecheck.

### Task 2: Temperature layer and controls

Files: `thermal-panel.ts`, `planet-controls.ts`, `planet-render.ts`, `render.ts`, `mapgen4.ts`, fixtures and browser script.
- [x] Add a browser check that fails on missing Temperature option.
- [x] Integrate optional model controls, small texture and thermal probing. Keep numeric/config resets explicit and shader branch disabled by default.
- [x] Verify actual shader temperature endpoints/body UV, presented-frame pause including thermal state, painting/no-regeneration, old layer restoration and mobile layout.

### Task 3: Verification and handoff

- [x] Run Node/typecheck/build; planet+thermal browser/GPU checks and legacy brush regression. Measure solver batch costs, not a whole-app FPS claim.
- [x] Record assumptions and measurements in README/validation; one independent read-only review; repair actionable findings with regression evidence.

References: [CLIMLAB EBM](https://climlab.readthedocs.io/en/stable/api/climlab.model.ebm.html), [daily insolation implementation](https://climlab.readthedocs.io/en/stable/_modules/climlab/solar/insolation.html). Our greybody radiation and 2D finite-volume implementation are explicit simplifications, not CLIMLAB output.
