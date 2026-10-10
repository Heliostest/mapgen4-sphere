# Mapgen4 — editable spherical terrain

A spherical adaptation of [Red Blob Games' Mapgen4](https://www.redblobgames.com/maps/mapgen4/), based on upstream commit `c1d8cb0`. It retains the original WebGL2 renderer, biome palette, terrain folds, river curves, and parameter UI.

## Run

With Node.js 22+ and pnpm 11:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Open [localhost:8000](http://localhost:8000/embed.html). `npm install`, `npm run build`, and `npm start` also work. The server binds to loopback and disables caching. The sphere generates its mesh at startup; old planar point files are not used.

The default view is a **live planet**: after terrain generation, Natural surface and From space start automatically at one simulated hour per second. Climate, water, vegetation, ice feedback, grounded glaciers, evolving winds/ocean currents, terrain rivers/lakes and cloud cover are enabled together. **Live planet** restores this combination at any time, preserving authored terrain. Clouds remain a soft overlay without rain or snow symbols. Geological erosion capture/application stays manual. Open `embed.html?mode=editor` for the original paused editing start.

- Left drag paints Ocean, Water, Valley, or Mountains. The four original brush sizes and keyboard shortcuts still work.
- Right drag or Alt-drag rotates. The wheel zooms.
- **Drag: Paint / Rotate** switches one-finger touch behavior.
- `render → sphere_radius` changes the sphere's geometric radius from 100 to 1000 (default 300), with a live value readout. Mountain height stays absolute, so its proportion to the planet changes. Existing terrain and brush edits are preserved.
- `x` and `y` select longitude and latitude; `rotate_deg` rolls the view, and `tilt_deg` adds latitude tilt. Other render controls keep their original purpose.
- `zoom` remains independent of radius. Zoom out for larger spheres; both the slider and wheel now reach 0.05.
- Reset restores the current seed's terrain, clearing painting and applied erosion. Painting or an applied erosion layer disables seed/island controls until Reset.

## Planet physics — stage A

The **Planet physics** panel adds SI diagnostics and an analytical solar clock. Normal startup selects **Natural surface / From space** and plays once terrain is ready. The explicit editor URL starts paused in **Original map / Follow surface**. Loading a saved world pauses playback and honors that world's own settings.

- **Physical size:** radius in km and mean density in kg/m³ determine spherical mass, surface gravity and escape speed. This physical radius is independent of the existing `render → sphere_radius` scene geometry control and zoom. Neither regenerates terrain.
- **Physical terrain scale:** calibrated land/seafloor heights are separate from artistic `mountain_height`. The panel reports the current vertical exaggeration; inspection samples generated elevations before decorative mountain folds. The displayed ocean remains at sea level.
- **Display layer:** Original map, Day / night, Solar energy, temperature, water, estimated surface wind and terrain change. Solar energy is top-of-atmosphere W/m²; diagnostic palettes retain terrain shading. Night brightness in the day/night layer is an editing aid, not incoming heat.
- **View:** Follow surface keeps the map fixed while the Sun moves. From space shows actual spin/axial tilt through a separate model transform; navigation still works in either mode.
- **Time:** Play/Pause, elapsed days, spin phase, season phase and four speed settings. The epoch is northern spring equinox; season 90° is northern summer solstice. Rotation & solar orbit exposes sidereal period, retrograde spin, tilt, circular orbit distance and Bond albedo. The year is derived from the fixed solar mass and orbital distance.
- **Inspect:** select a point for body latitude/longitude, mapped elevation/seafloor depth, local solar time and irradiance. Inspection does not paint. Painting pauses at the presented frame; hiding the tab also pauses until Play is pressed again.
- **Reset time** changes only the clock/phases. **Earth preset** restores physical parameters and time. Terrain **Reset** clears painting and applied erosion without resetting physical settings.

The **Radiative Teq** value is global blackbody radiation equilibrium with full heat redistribution, not surface air temperature. Rapid spin and very large relief are outside the accurate range of the spherical approximation. Terrain and physical settings can be explicitly downloaded and loaded; runtime climate fields are not saved.

Physics uses `M=4πρR³/3`, `g=GM/R²`, `v_escape=sqrt(2GM/R)`, a circular two-body year, and `Q=S max(0,n·sun)` on the reference sphere. References: [JPL constants](https://ssd.jpl.nasa.gov/astro_par.html), [JPL physical parameters](https://ssd.jpl.nasa.gov/planets/phys_par.html), [NASA Kepler laws](https://science.nasa.gov/learn/basics-of-space-flight/chapter3-3/), [CLIMLAB insolation](https://climlab.readthedocs.io/en/stable/_modules/climlab/solar/insolation.html), and [NASA GISS on equilibrium versus surface temperature](https://www.giss.nasa.gov/pubs/abs/de06700y.html).

## Seasonal temperature — stage B

Click **Generate climate now** to see **Natural surface (ice & vegetation)**, or select **Temperature (daily mean)** to inspect temperature bands. Both appear immediately at the selected date, while paused. There is no hidden warmup or clock advance. Latitude, seasonal insolation, land/sea heat capacity, nearby ocean and physical altitude determine a generated reference state. Manual season/tilt/time or terrain edits regenerate it immediately. Play is optional and evolves that state; **10 days / second** makes seasonal changes easier to see. Switching to Original map hides the colors while an enabled model continues with the clock. Uncheck **Enable thermal model** to turn it off.

The natural surface uses a 96×49 geographic annual reference to distinguish tundra, forests, grassland, desert and other potential cover, including both poles. With water enabled, snow and sea ice are actual finite water reservoirs; their phase changes exchange latent heat with the thermal column and their coverage changes albedo. Vegetation cover and composition evolve gradually, and prescribed coast-bounded ocean gyres transport heat conservatively. The initial state is generated directly at the selected date; Play advances it. These are illustrative models, not measured ice thickness or calibrated ecosystems. [Surface classification](docs/natural-surface.md) · [Coupled environment methods](docs/coupled-environment.md).

The **Seasonal temperature** panel shows the global mean, range, actual sampled time, time since thermal reset, discretization lag and energy-accounting residual. Inspection adds the underlying cell's daily-mean temperature. The fixed color scale is −80°C blue, 0°C cream, +60°C red; values outside it saturate, and terrain shading remains visible. Interpolated colors are for display; probe values refer to a single cell.

The model solves `C dT/dt = (1−albedo) Qdaily − emissivity σ (T/f)⁴ + heatTransport` on 1,152 equal-area cells. The generated altitude factor `f` (0.55–1) is an illustrative effective radiation adjustment, preserving cooler highlands during evolution; it is not a vertical atmospheric column. Daily insolation is integrated over latitude bands and normalized to global interception `S/4`; neighboring cells exchange equal and opposite heat. The stability bound includes the altitude factor's radiation derivative. Heat transport scales with inverse physical radius squared. Artist mountain height, scene radius and camera do not affect this state. [Generation methods and assumptions](docs/generated-climate.md).

Defaults are an effective infrared emissivity of 0.61, land heat capacity of 2 MJ/m²/K, a 10m ocean mixed layer with volumetric heat capacity 4.2 MJ/m³/K, and Earth-scale heat transport coefficient 0.55 W/m²/K. These are adjustable model parameters. They do not infer atmospheric composition or a greenhouse effect from planet density. Land fractions come from the generated region elevations, before artistic folds. Empty coarse cells use the nearest region; this is a classification approximation, not a conservative remapping of previous climate energy.

**Reset temperature & water** regenerates the geographic reference climate at the current astronomical time; it does not erase painting. Terrain regeneration, physical/thermal parameter changes, or manual time/phase changes also restart it. The energy budget starts from the actual generated field. Pausing freezes the presented state; resuming preserves its history. Stable substeps are at most 30 minutes and 1/720 year. Each animation update runs at most 32 substeps, limiting actual time advancement. The sampled field can trail the clock by less than one substep, displayed in the panel.

This is a seasonal daily-mean approximation, not hourly temperature or weather. Day/night illumination already responds instantly to spin phase. Daily averaging remains unavailable for slow/synchronous rotation when the mean solar day exceeds 1/20 of the orbital year. There is no pressure-driven circulation, resolved vertical atmosphere or cloud feedback. Ice/latent-heat feedback and prescribed ocean transport are active with the water model. Original map rainfall, rivers and biomes remain independent. Generated climate is not a spun-up equilibrium and runtime fields are not saved on reload.

Method references: [CLIMLAB energy-balance models](https://climlab.readthedocs.io/en/stable/api/climlab.model.ebm.html) and [daily-mean solar geometry](https://climlab.readthedocs.io/en/stable/_modules/climlab/solar/insolation.html). This implementation uses its own two-dimensional finite-volume grid and greybody radiation closure, rather than CLIMLAB's calibrated linear outgoing-radiation model.

## Water cycle — stage C, first increment

Choose **Precipitation**, **Soil moisture** or **Surface outflow**, or click **Generate climate now**. Generated initial rain, humidity, soil and routing estimates are available before Play. Play evolves their inventories with the water solver; the status switches from initial estimates to simulated step fluxes. The panel reports rain/evaporation in mm/day, inventories in global mm water equivalent, budget residual and cell outflow in m³/s. These coarse diagnostics remain independent of the artistic river lines.

The 48×24 equal-area grid holds vapor, soil, standing-surface, snow and sea-ice columns in kg/m² of whole cell. A finite ocean inventory defaults to 1,000m times ocean coverage, independently of the seafloor scale. Soil capacity defaults to 150mm per land area. Initial humidity/soil/surface stores follow estimated wetness from latitude, season, upwind ocean and terrain ascent/descent. Initial routing is diagnosed from these stores without changing inventories or time, and the budget is anchored to these actual initial stores. Terrain classification uses the generated pre-fold region snapshot; empty cells use the nearest region. External edits start a new budget.

Evaporation draws from available water, capped by absorbed daily solar energy times an efficiency divided by 2.45MJ/kg. Liquid availability and vapor deficit limit demand. Illustrative vapor capacity is `20 exp(.06*(clamp(T,250,330)-288.15))` kg/m². A seasonal east/north wind template and diffusion transport vapor conservatively across grid edges. The shared time-step bound remains safe when winds reverse. **Surface wind (estimated)** shows direction arrows and a 0–30m/s color scale; probes report signed east/north components. Default wind-belt strength is 10m/s, with weaker land winds and seasonal/retrograde effects. These winds are generated from geographic rules, not a pressure/momentum solver. Supersaturation rains out over six hours; warm land rain fills soil then standing water, while cold precipitation accumulates as snow. Soil above70% capacity drains over three days. Actual evolved rainfall follows this solver, not a prescribed initial rain map.

Surface water follows the lowest adjacent hydraulic head, including stored depth, with a bounded reservoir transfer and default travel speed 1m/s. Closed depressions fill before spilling; there is no forced carved outlet. A mixed coastal cell has separate land and sea destinations, each limited by its area fraction, so a sea-level outlet cannot lift water onto elevated land. All-land has no ocean sink; all-ocean has no soil or river discharge. Sea level remains fixed even as the finite ocean inventory changes. This is a reservoir-routing approximation, not a shallow-water solver.

Water and temperature are coupled through vaporization/condensation and freezing/melting energy. Snowmelt enters the surface reservoir before routing, so **Capture current water** can pass melt-driven discharge to erosion. Separate water and combined enthalpy residuals expose accounting errors. Groundwater, ice drift, glacier flow and sea-level change are absent. Physical/terrain/manual date edits regenerate histories; display edits preserve them. Their fixed shared substeps and acknowledged-frame checkpoints include frozen stores, vegetation memory and compensated energy accumulators.

Layer scales are fixed: precipitation 0–20mm/day; soil 0–100% of land capacity with ocean blue; outflow `log10(1+Q)/7`, about 0–10⁷m³/s. Higher values saturate. A 48×24 RGBA8 texture carries these diagnostics and land fraction; bilinear color interpolation is for display, while inspection and budgets use the Float64 cell values. An initially dry outflow layer can remain dark until enough water accumulates.

Method references: [USGS water cycle](https://www.usgs.gov/water-science-school/water-cycle), [FAO latent heat and water-depth conversion](https://www.fao.org/4/X0490E/x0490e04.htm). This is not an implementation of FAO evapotranspiration.

## Ice, ocean, vegetation and comparison

**Surface resolution** adds experimental balanced/high local surface reservoirs for mountains, mixed coasts and polar land. They evolve separate temperatures, snow, ice and liquid water while retaining the 48×24 atmosphere. Quality changes and terrain rebuilds preserve heat, water and elapsed time; refined **Generate climate now** rebuilds the mapping. **Reset time** explicitly initializes a new state. The Earth scene remains classic at day 0, with the shared-moisture experiment off: regional precipitation and visible snow boundaries have not passed realism validation. [Part 5 evidence and limits (中文)](docs/evidence/earth-climate-refinement-20261011/REPORT.md).

**Ice, ocean & vegetation** controls ocean circulation strength (zero disables transport), vegetation evolution/feedback and ice/snow albedo feedback. Changing these settings regenerates at the current date. Vegetation initially follows annual climate and responds over years; one cold day cannot turn a forest into tundra.

Open **Compare environment…** beneath Generate climate to see baseline/current maps for natural surface, temperature, snow, sea ice, vegetation and current arrows. The panel includes north/south polar ocean coverage, water and enthalpy budgets, metric deltas, latitude profiles, and a coverage history. Play/Pause works inside it. The first generation is the initial baseline; **Use current as baseline** explicitly replaces it. Parameter edits retain the baseline. **Export comparison CSV** includes immutable planet/orbit/thermal/water/environment configurations and the measured deltas. The comparison and runtime switches are session-only; terrain files keep their existing format. [Model details and limits](docs/coupled-environment.md).

## Erosion and deposition — stage D

Choose **Terrain change (erosion)** to enable water and open **Erosion & deposition preview**. **Capture current water** freezes generated initial discharge estimates before Play, or the latest simulated discharge afterward; the source label distinguishes them. **Evolve terrain** advances a separate geological clock, default request100,000 years per click with actual advancement/work limit reported. Astronomy Play continues climate only. Dry captures have no stream incision but may smooth slopes. Neither a generated initial estimate nor a captured instantaneous discharge is mean annual flow.

The model conserves solid volume at an assumed common bulk density: land bed volume, mobile sediment and retained ocean sediment. Incision follows `E = K sqrt(Q / 1000m³/s) slope`, with default K=1m/year. Pairwise land-only diffusion uses an illustrative broad-scale smoothing coefficient of 10⁴m²/year. Mobile sediment travels downhill and settles using a 10,000-year relaxation parameter. These are uncalibrated controls, not measurements of soil creep or validated planetary erosion rates. Land/sea outlets are separate; closed basins retain sediment. There is no uplift, porosity change, sea-level movement or submarine geometry change. Ocean arrivals remain accounted for even though the visible seafloor stays fixed.

Each click runs at most 32 stable substeps, bounded by diffusion, incision and sediment timescales, never more than 2,500 years each. Small planets or strong coefficients may therefore advance far fewer years than requested. A request shorter than one stable substep advances zero years and reports how to increase it. Geological time never follows wall time, and hidden tabs cannot accumulate erosion work.

**Preview geometry** compares evolved and original geometry. **Undo last evolve** restores the entire preceding click, including sediment inventories and time; **Reset erosion preview** discards the experiment. Preview applies land-weighted coarse height ratios to the retained fine terrain and decorative folds. GPU vertices, picking and physical height probes share these preview elevations, while original author constraints and buffers sent to the worker remain unchanged. The coarse solid-volume budget does not claim a conservative fine-mesh remapping. The change layer uses fixed −100…+100m blue/cream/red colors, saturating outside that range; probes retain cell values.

New terrain, physical/environment parameter changes, manual time resets and disabling water invalidate the preview experiment. Re-capture starts from the current generated terrain, including any applied erosion. While previewing, live climate and artistic rivers continue to describe its source terrain.

**Apply erosion to terrain** becomes available after evolving a visible preview, once terrain generation finishes. It projects the evolved bed height onto the current physical triangles, clamps normalized heights to [−1,1], and stores an independent offset from the raw procedural baseline. Generation adds this layer before reconstructing region heights, generated rainfall, drainage, river geometry and decorative folds. Reconstructed geometry can therefore differ from the preview. The thermal and water models restart on the accepted terrain at the current astronomical time. Rivers retain the original artistic drainage model; this does not turn them into physically calibrated hydrological channels.

**Undo last application**, in **Terrain document**, restores the preceding applied layer while preserving any later painting and generator settings. It supports one application undo; preview undo remains separate. **Reset** clears both painting and applied erosion. The application report records geological time, source day, clipped triangles and coarse sediment inventories. Only bed height is applied: mobile/ocean sediment is archival report data, and each new capture starts a fresh budget. Fine-mesh projection, clipping and river carving do not claim solid-volume conservation across applications.

**Download terrain JSON** saves acknowledged terrain only: author constraints, applied offsets/report, generator and display parameters, physical/solar settings, astronomical time and camera mode. The versioned file is limited to 8 MiB and must match this build's mesh identity. **Load terrain JSON** fully validates before replacement, pauses time, selects Original map and resets thermal/water parameters to disabled defaults. It does not restore preview, dynamic climate or undo history. Download/load is explicit; there is no automatic browser persistence. A newer edit cancels an unfinished file read, and obsolete worker replies cannot overwrite newer terrain requests.

Method references: Landlab [stream power](https://landlab.csdms.io/generated/api/landlab.components.stream_power.stream_power.html) and [linear diffusion](https://landlab.csdms.io/generated/api/landlab.components.diffusion.diffusion.html). This is an independent illustrative solid-volume model; its transport/settling closure is not an implementation of Landlab.

## Rendering preserved

| Original component | Spherical adaptation |
| --- | --- |
| `colormap.ts` elevation/rainfall palette | Unchanged |
| River barycentric curves, widths, antialiasing and blue | Same fragment shader; primitives wrap the longitude seam and retain barycentric values at poles |
| Land elevation texture and river-bank depression | Same pass and formula, in a periodic 4096×2048 surface atlas |
| Valley/ridge quadrilateral folds | Same selection and mountain-fold formula, on a closed spherical dual mesh |
| Slope/flat/ambient/overhead lighting | Same custom shading; finite differences account for physical distance at each latitude |
| Depth-based ridge/coast outlines | Same elevation comparison; ridge samples follow the projected local vertical, coast samples remain symmetric |
| Mountain profiles | Fixed radial height along each surface normal, independent of camera orientation |
| Outer silhouette | Coverage-based outline in the final pass, including mountain peaks against the background |
| Final texture composition | Original smoothing offset, plus silhouette ink controlled by `outline_depth` and `outline_strength` |

No scene lights, physical materials, or vertex-color palette replacement are used.

## Necessary geometry and generation changes

`sphere-mesh.ts` builds a closed Delaunay halfedge mesh from well-spaced spherical points: 26,919 regions and 53,834 triangles at the default spacing. There are no ghost boundaries or duplicated seam regions. Mountain spacing, the elevation mixture, rainfall and river accumulation retain the original algorithms; noise is sampled in 3D and wind ordering uses a continuous spherical direction. The `island` parameter adjusts ocean coverage because a globe has no rectangular edge. An all-land world drains to its lowest point.

`spherical-constraints.ts` measures brushes by angular distance, so strokes cross the date line and poles. `sphere-view.ts` picks the actual displaced terrain and recovers its original surface coordinates. Painting never hits empty space or an occluded far-side triangle.

Generation uses a fixed reference radius of 300 for mesh density, edge lengths, and peak spacing. The live radius control stretches the existing angular map instead of regenerating it; mesh counts, mountain locations, river layout, and angular brush sizes stay stable. Rendered radius, slope distances, and picking update together.

The new landscape is not the same seeded planar island wrapped into a globe. Geometry and noise change to cover a closed surface; the cartographic rendering stays Mapgen4's. Extreme polar closeups retain the sampling limits of a longitude/latitude atlas.

## Verification

```sh
pnpm test
pnpm typecheck
pnpm build
node scripts/build-reference.mjs
```

The reference command reconstructs and builds the original source only inside `build/reference/`. Compare it at [the original reference page](http://localhost:8000/build/reference/embed.html).

`pnpm test` also builds the GPU regression fixture. With the server running, open [the mountain projection check](http://localhost:8000/tests/gpu-radial.html): WebGL2 transform feedback checks the actual depth/drape displacement shader against fixed body positions and CPU picking geometry across four camera orientations, three heights, radii 100/300/1000 and three planet model transforms (648 checks). Its browser result must say `PASS`; the Node test command does not execute this browser check.

The [outline sampling check](http://localhost:8000/tests/gpu-outlines.html) must also say `PASS`. It samples the renderer's actual outline texture at 771 fractional positions to detect pixel snapping that would cause stationary diamond-shaped bands during rotation.

The [silhouette check](http://localhost:8000/tests/gpu-silhouette.html) checks background/sea coverage and the actual final shader: all eight edge directions, identical foreground/background colors, unchanged interior pixels, opaque output, and disabling either outline control. Like the other GPU fixtures, run it in the browser after `pnpm test` builds it.

The [planet light check](http://localhost:8000/tests/gpu-insolation.html) exercises the actual production lighting snippet: original colors, day/night floor, incidence angles, energy/temperature/water/erosion palettes, texture orientation/seam and opaque coverage (32 checks).

For automated screenshots and browser interactions, install Playwright in a separate tooling environment (or locally) and have Chrome installed:

```sh
node scripts/browser-check.mjs
```

`PLAYWRIGHT_MODULE` can point to that environment's `playwright/index.mjs` as a `file:` URL. Results and screenshots go to `build/validation/`. The runner checks painting/reset, camera controls, seams/poles, shading controls, seed reproducibility, touch emulation, and browser errors. See [validation notes](docs/validation.md).

`node scripts/planet-browser-check.mjs` additionally checks SI scaling without regeneration, reversible layers, clock/visibility handling, inspection, spin-view painting and mobile controls, and runs all four GPU fixtures. Its [controls fixture](http://localhost:8000/tests/planet-controls.html) deterministically checks that Pause freezes the last presented frame and Resume advances from it. Painted terrain is checked after physical size/density/relief changes and a scene-radius round trip. Set `BASE_URL` for either runner when using another port; the planet runner defaults to `http://localhost:8002`. Planet screenshots and reports go to `build/validation/planet/`.

Original documentation and credits are in [README.org](README.org). Apache-2.0; original Mapgen4 and helper code copyright Red Blob Games.

The [Earth scene](scenes/earth-land-sea/index.html) now uses source-labelled endorheic reference drainage and finite inland-lake stores. Its fused river threshold (m³/s), width coefficient, edge-length cap and visibility affect rendering only. See the [Chinese acceptance report](docs/evidence/earth-endorheic-rivers-20261011/REPORT.md) for matched screenshots, conservation, save/restore, GPU checks and unresolved lake levels/ice.

Earth drainage incorporates licensed HydroSHEDS v1 / HydroBASINS v1.c data, copyright World Wildlife Fund, Inc. (2006–2022), and public-domain Natural Earth data. The mesh classifications are distributed as part of this application; original data rights are not replaced by the software license. [Sources, attribution, conditions and disclaimer](docs/evidence/earth-endorheic-rivers-20261011/DATA-SOURCES.md).

Complete evolving-world files are documented in [simulation save/restore](docs/simulation-save.md). Optional physical extensions include [terrain rivers, lakes and wetlands](docs/terrain-water.md), [grounded ice and glacial erosion](docs/glaciers.md), and [evolving wind/ocean circulation](docs/circulation.md), with [clouds and precipitation](docs/weather.md) derived from their moisture fields. See the [five-stage overview](docs/environment-stages.md). Each has an independent browser acceptance script under `scripts/` and checked-in evidence under `docs/evidence/`.

`node scripts/thermal-browser-check.mjs` checks a 90-day thermal transient, pause/probing, terrain and configuration resets, display-scale independence, unsupported spin, exact original restoration and mobile controls. `node scripts/thermal-benchmark.mjs` measures batches of the isolated solver on the current Node runtime; it is not a browser-frame or cross-device benchmark. Both save reports in `build/validation/thermal/`.

`node scripts/water-browser-check.mjs` checks a 90-day paired thermal/water transient, closed water budget, three layers, probe units, terrain/config resets, disable rules, exact original restoration and mobile layout. `node scripts/water-benchmark.mjs` measures paired advancement, checkpoints and texture encoding on the current Node runtime, excluding browser rendering. Reports are saved in `build/validation/water/`. Node tests include dry/ocean/land limits, conservative vapor transport, basin filling/spilling, coastal head constraints, discharge units, convergence and complete checkpoint rollback. The actual-DOM fixture additionally tests water rollback after multiple unpresented updates and hidden-tab pause.

`node scripts/geomorph-browser-check.mjs` verifies real terrain deformation, comparison/undo/reset, independent geological time, budget/units, source invalidation, preserved painting, invalid duration and mobile controls. Its [renderer fixture](http://localhost:8002/tests/geomorph-render.html) reads the actual GPU vertex buffer, compares CPU picking across display radii/heights and probes under rotation, then detaches live worker buffers and verifies preview/restoration still work (19 checks). `node scripts/geomorph-benchmark.mjs` measures the isolated 32-step numerical kernel, excluding terrain-atlas reconstruction and rendering. Reports go to `build/validation/geomorph/`.

`node scripts/application-browser-check.mjs` verifies apply/undo, preserved later brushwork, environment restart, exact portable-file geometry/active-river/pixel round trips, invalid files, delayed file reads, coalesced worker revisions, Apply→Reset and edit→Load races, and mobile layout. Reports go to `build/validation/application/`; Node tests also cover projection/clipping, real-generator ordering, copied offsets, strict document validation and revision gating.

`node scripts/climate-browser-check.mjs` verifies structured reference climate before Play, paused season/tilt/altitude edits, wind arrows and retrograde probes, initial rain/soil/erosion capture, continuation from the generated state, view-only history preservation and mobile layout. Results go to `build/validation/climate/`. Numerical tests cover geographic dependencies, rain shadow, vector transport and extreme-radius/altitude/albedo conservation.

`node scripts/environment-browser-check.mjs` verifies generated inventories, both polar caps, all six comparison maps, live playback, budget closure, CSV provenance, baseline replacement and mobile layout. Reports and screenshots are written to `build/validation/environment/`.
