# Structural transport repair

**Goal:** satisfy SPEC.md with generic circulation/parcel mechanisms and measured regional acceptance.
**Architecture:** existing conservative thermal and water reservoirs; exact drag and positive face exchanges; compatible serialized wind offsets; diagnostic precipitation partition without extra stocks.
**Tech stack:** TypeScript, esbuild, Node tests/integrations, Python GPCC analysis, browser WebGL verification.
**Spec:** docs/evidence/earth-moisture-structural-20261011/SPEC.md
**Global constraints:** no official config/data changes; no geographic or observational forcing; same saved initial stocks; preserve prior evidence; no commits or publishing required.
**Review focus:** legacy behavior, saved-state compatibility, nonlinear precipitation ordering, finite moisture/heat conservation, GPCC support, real integration and renderer health.

## Task 1: meridional circulation
Interfaces: AtmosphericCirculation.step uses WaterModel saved total winds; checkpoint remains original-template offsets.
Write RED tests for zonally uniform meridional heat contrast, gradient reversal and no terrain-pressure anomaly. Implement full virtual-temperature pressure gradients with zero meridional drag target and exact relaxation of prior total wind. Preserve the original template for serialization validation. Expected: synthetic direction reverses, old snapshot resumes, legacy suite passes. Run focused tests and real reference probe; only retain physically supported changes.

## Task 2: horizontal mixing and ascent
Interfaces: WaterModel.step produces conservative vaporTransportKgM2, precipitationKgM2S and latent heat; add diagnostic component arrays only, not checkpoint inventory.
Write RED common-altitude mixing test, windward rainout and hot dry convection tests with independent mass budgets. Implement common-altitude eddy diagnosis, moisture-limited face rainout and moist parcel convection; partition actual precipitation. Expected: flat-equivalent terrain does not create artificial eddies, uphill precipitation intercepts moisture, component sum equals total, water/enthalpy close. Run focused and complete tests.

## Task 3: actual Earth acceptance
Interfaces: reuse prior pinned GPCC and integration harness, new bundles/checkpoint directory and hash bindings.
Freeze the prior P0 product baseline before editing. Run genuine one-year 1800 s baseline/candidate from identical saved stocks; regionally evaluate all SPEC criteria. Diagnose any failed mechanism before changes. Run 900 and 450 s candidate and verify budgets, exact restore and measured step differences; save raw results, maps and concise report. Latest user steering: continue numerical acceptance despite the graphics blocker. The finer integrations therefore also quantify a candidate that still fails India net import and southwest Australian seasonal ordering; they do not grant regional acceptance. Expected: all structural criteria pass; unresolved errors explicitly quantified.

## Task 4: browser and review
Build/typecheck/full tests. Recover WebGL within task-owned browser tabs without disrupting other projects; take and inspect before/after frames from saved states. Dispatch one independent whole-change review using existing reviewer slot or a fresh reviewer as required by executing-plans; resolve important findings with RED/GREEN tests. Expected: healthy images or a documented external graphics blocker; report includes exact validation and default hashes.
