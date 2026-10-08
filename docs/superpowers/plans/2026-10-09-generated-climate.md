# Generate climate before playback

User intent: opening a climate layer or editing physical/geographic parameters must immediately show geographic structure at the selected date, without Play or hidden simulation warmup. Play then evolves that initialized state. Continue within the user's authorized development workflow using planning, TDD and one independent final review.

## Design
- Keep the original map and existing documents/painting intact. Add a clearly named Generate climate now shortcut and an estimated surface wind layer. Existing temperature/rain/soil/outflow layers initialize immediately when selected; the simulation clock stays paused and age is zero.
- A deterministic pure climate generator takes planet/orbit/time, thermal/water configuration, land fractions and physical heights. Latitude/tilt/circular-orbit insolation, ocean thermal inertia, nearby sea influence and an illustrative altitude factor generate initial daily-mean temperature. This is an estimated reference state, not an equilibrium solver or a claim of calibrated Earth climate. Keep hourly temperature response outside this increment; instantaneous day/night illumination already works without Play through phase controls.
- Generate an Earth-inspired surface circulation template: tropical easterlies/convergence, midlatitude westerlies, polar easterlies; shift with seasonal declination and reverse zonal component for retrograde spin. Rotation strength attenuates zonal deflection. These are parameterized winds, not pressure/momentum dynamics. Upwind ocean availability and terrain ascent/descent modify an estimated wet/dry latitude pattern. Every arbitrary closure must be documented as illustrative.
- Temperature starts from the generated field and its actual initial energy. Preserve an altitude-dependent effective radiation factor during evolution, with conservative pairwise heat transport and matching stability derivative. Default direct kernel constructors remain usable for isolated uniform-start numerical tests; runtime opts into generated initialization.
- Water starts with generated humidity/soil/surface inventories and initial rain/evaporation diagnostics. Publish an instantaneous routing estimate without changing stores/time, then anchor the water budget to those initial stores. Initial diagnostics are explicitly estimates until the first simulated step. Actual rain after playback still comes from the existing conservative condensation/evaporation model.
- Replace runtime uniform eastward vapor drift with generated east/north winds, updated at shared physical substeps. Use conservative edge fluxes and a time-step bound safe for any wind component within the configured strength. Keep the legacy direct WaterModel constructor's uniform-wind mode for isolated kernel tests. Thermal texture G/B stores signed estimated winds; layer arrows and probes show direction and speed.
- Terrain/physical/manual time/season edits regenerate reference climate immediately. Camera/display edits preserve history. Existing latest-presented checkpoint semantics must remain exact for temperature, water and wind textures. Slow/synchronous daily-mean limitation remains explicit; no fabricated circulation forecast.

## Sources and interpretation
- NOAA global circulation: https://www.noaa.gov/jetstream/global/global-atmospheric-circulations
- NOAA ITCZ: https://www.noaa.gov/jetstream/tropical/convergence-zone
- Met Office latitude/altitude/maritime influence and prevailing wind: https://weather.metoffice.gov.uk/learn-about/met-office-for-schools/other-content/other-resources/understanding-weather
- NASA standard-atmosphere lapse rate reference: https://ntrs.nasa.gov/api/citations/20050207438/downloads/20050207438.pdf
These support qualitative structure; the numerical templates below are our illustrative closures, not implementations of those organizations' operational models.

## Tasks
1. [x] RED/GREEN pure initialization and wind tests: latitude/season/elevation/sea response, determinism, extreme finite behavior, direction and rain shadow. Runtime integration preserves zero clock/age and budget baselines.
2. [x] Conservative vector vapor transport, changing seasonal wind, exact pause/checkpoint behavior, initialized hydrology and meaningful stability/budget tests.
3. [x] No-Play climate shortcut, wind rendering/probes and explanatory UI. Browser verifies initial spatial differences, parameter edits while paused, initial erosion flow, playback continuation, save/load compatibility and mobile layout.
4. [x] Full Node/typecheck/build and relevant browser/DOM/GPU regressions, source/method documentation, one independent review and local commits. Review found one Important initial-flux legend issue; reproduced with a browser regression, then fixed and verified in one pass.

## Review focus
- Generated climate must not advance astronomical time, hide simulation steps, reuse a prior terrain/season, or label estimated initial fluxes as measured simulated transfers.
- Seasonal vector advection must conserve vapor at seams/poles and maintain positive inventories under sign changes and extreme radius/wind; its shared time-step bound must stay valid after wind updates.
- Surface temperature and effective radiation factors must have consistent energy baselines/stability and stay finite at high altitude, albedo1, tiny radius and extreme orbit/tilt.
- Pause/hide and queued future frames must restore exact wind/thermal/water/probe state. Manual edits regenerate; view-only edits do not.
- UI and docs must distinguish generated reference climate, simulated transient and parameterized wind from full atmosphere dynamics. Portable terrain load must still restore original pixels/settings while climate remains reconstructible rather than serialized runtime history.
