# P0 implementation and validation

Authorized scope: the P0 row of the Earth status reassessment. Keep the authored Earth scene, legacy moisture default, classic surface default, and all imported terrain/ice data unchanged.

1. Establish spherical area and calendar conventions for diagnostics and GPCC monthly normals. Separate parent air, land/ocean reservoirs, local display, reference climatology, latest flux, and integrated amount.
2. Reproduce coupled time-step sensitivity. Record precipitation, evaporation, net vapor transport and vapor storage at 1800/900/450 seconds from identical stocks. Diagnose ocean supply and condensation separately.
3. Add regression tests that fail for the identified defects, then repair the general transport/coupling closure. No geographic rain overrides or observational forcing.
4. Validate real annual integration with full authored terrain, routing, glaciers, and atmosphere. Compare identical spatial support against GPCC 1991–2020 v2022 and examine monthly seasonality in India/Himalaya, tropics and Australia.
5. Check independent water and enthalpy budgets, strict restore/next-step equivalence, same-view before/after screenshots, and unchanged default input hashes. Run project checks and independent review.

Historical evidence remains read-only. New raw results and reproducible harnesses live in this folder and build/earth-moisture-p0.
