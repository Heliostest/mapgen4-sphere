# Terrain rivers, lakes and wetlands

Enable **Ice, ocean & vegetation → Terrain rivers, lakes & wetlands** after generating terrain. Changing the switch regenerates climate. Play moves real surface water among 53,834 triangle reservoirs on the default mesh. Natural surface uses their discharge to size connected rivers, reconstructed standing water for lakes, and soil saturation/standing water/slope for wet ground. Original map retains its original artistic rivers. Inspect reports the nearest terrain reservoir's mean depth in metres and outflow in m³/s.

Rain, snowmelt, soil drainage and evaporation modify the existing conservative water ledger. Fine reservoir volumes partition that ledger; they are not counted as extra water. Pair transfers are donor limited and respect physical bed levels and edge sills. Closed depressions remain closed until water reaches an outlet. Unresolved coastal storage stays in the ledger and is reported by the panel.

The routing and shoreline reconstruction consume the authored mesh's actual ridge/valley topology. During independent review, a 10→5 m visible valley was found to be incorrectly blocked by a 100 m region-edge sill. The regression failed before repair; the fixed shared valley split gives a 7.8215 m crossing and positive discharge. Independent stress checks up to 27,000 regions found finite bed patches, positive weights and normalized areas.

Complete simulation saves include fine volumes, receiver sides and fluxes. Restore validates graph membership and agreement with coarse stores before replacement. A pending fine partition cannot advance through coarse routing before terrain attaches. Older version-1 complete files without the optional routing fields still use coarse routing. Visible-frame rollback includes fine state.

## Acceptance — 2026-10-09

- `npm test`: **120/120**. Includes depression/spill, empty/ocean/all-land, unresolved coast, source/sink reconciliation, positivity, partition closure, corruption rejection, exact continued evolution, visible rollback, legacy decoding and the valley topology reproduction.
- Typecheck, production build and `git diff --check`: passed.
- [Terrain-water browser report](evidence/terrain-water-report.json): five groups; no runtime/shader errors. Real UI evolved beyond 12 days, saved, restored exact runtime fields and globe pixels, rejected inconsistent fine/coarse water without replacement, and restored Original pixels exactly. Final water residual **−9.66247171163559×10⁻⁹ mm**.
- Existing simulation (7), environment (7), application (6), surface (6), planet (8) and water (5) browser groups passed. GPU surface/solar checks: 87; polar checks: 116. The complete-save regression again continued to step 7,665 with identical fields and pixels after reload.
- [Controlled basin GPU fixture](../tests/terrain-water-render.html): dry/drained lake pixels 0; low-volume lake 339,753 pixels; high-volume lake 1,384,148 pixels. Saturated ground changes separately from lake coverage. Screenshots preserve the actual GPU framebuffer; the synthetic reservoir inputs are explicitly labelled and are not a rainfall forecast.
- Independently reviewed; the topology finding was fixed and re-reviewed. Globe, basin and mobile screenshots inspected in the implementation session.

![Evolved terrain water](evidence/terrain-water-evolved.png)

![Controlled basin](evidence/terrain-water-basin.png)

## Playback performance — 2026-10-09

CPU profiling of the all-enabled default planet identified shoreline reconstruction as the main playback stall: every water step sorted bed heights, allocated temporary arrays and repeated atlas seam/pole clipping. Static bed coefficients, wetland slopes and atlas coordinates are now cached per routing network. Each update computes current water levels and fills an independent typed render buffer. The reservoir solver, timestep, shoreline equation and rendering resolution are unchanged; terrain regeneration creates a new network and cache.

The opt-in `node scripts/terrain-water-benchmark.mjs` checks the real shoreline path on 23,996 triangles against a 50 ms median budget. On this machine the median fell from **170.26 ms to 13.46 ms**. Separate full-page traces recorded **105 animation callbacks above 50 ms in 32.37 s** before and **0 in 26.87 s** after; maximum callback duration fell from **111.46 ms to 20.03 ms**. These are CPU callback timings, not GPU presentation times or a device-independent frame-rate guarantee. [Measurement record](evidence/live-planet-performance.json).

Validation: 139 numerical tests, typecheck and build passed. Added shoreline tests cover sloping/equal-height beds, independent queued buffers, wet/dry transitions and rollback. The controlled basin GPU fixture retained identical dry, saturated, low-lake and high-lake pixel counts.

## Model limits

This is a head-based reservoir model without momentum, calibrated flood depths, channel hydraulics or subgrid groundwater. Mean reservoir columns route water; volume-weighted piecewise bed reconstruction supplies a draped shoreline approximation. Lakes are not separate horizontal 3D water meshes. Fine sources inherit the coarse climate and unresolved coast cells are retained rather than assigned an invented outlet. River widths are exaggerated for readability; wetland colors indicate a diagnostic proxy, not a vegetation species simulation. Verification uses this machine's Chrome/WebGL2 and emulated mobile viewport.
