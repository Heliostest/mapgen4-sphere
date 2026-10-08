# Apply erosion and portable terrain documents

> Use superpowers:executing-plans inline; one independent final read-only review.

**Goal:** Apply stage D bed-height preview to the current authored terrain, regenerate rivers/environment, undo application while preserving later painting, and export/import a portable terrain document.
**Architecture:** Persistent normalized triangle-height offsets are applied after procedural elevation and before region elevation, rainfall and drainage. A generation revision gate accepts only the latest requested state while returning every transferred render buffer. A strict versioned document codec persists author constraints, offsets, generator/render settings and physical/solar settings. Climate history restarts on load/apply.
**Tech:** Existing TypeScript/WebGL/Node/Playwright, no dependencies, storage service or automatic localStorage overwrite.
**Spec:** Stage D continuation following completed preview: user said continue. Reversible local implementation is authorized; no renewed approval gates. Previous stage checkpoint retained locally, no merge/push.

## Rules
- Keep independent sphere clone, current user's browser tabs/painting and original parent repository untouched.
- `bakeTerrainOffsets` uses current pre-fold triangle heights projected through the preview and subtracts the generator's raw triangle baseline. The worker supplies that baseline before offsets and river carving, paired with its request revision. Clamp the target to the generator's supported normalized range[-1,1] and report clipped triangles. Recompute region heights, generated rainfall, drainage/river geometry, folds, and physical environment classification from the resulting map. Applied output can differ from preview because this recomputation is intentional.
- Store absolute triangle offsets as an independent layer. Future painting/generator parameter edits modify the authored base and retain this layer; undo application restores the preceding layer only, preserving current painting/settings. Terrain Reset clears both painting and applied offsets. Seed/island are disabled while painting or an applied layer is present, consistent with existing authoring behavior.
- Apply only an evolved visible preview on an acknowledged, idle terrain snapshot. Capture/evolve/application are disabled while terrain work is pending. A saved application report retains geological years, source day, clipping count and coarse mobile/ocean sediment volumes. Application bakes bed height only, not mobile sediment or sea-level change; fine projection/recarving is not a conservative remap. New geological captures/environment resets start independent budgets.
- Every generation-affecting mutation increments a revision synchronously. At most one worker job runs. Stale replies return their render buffers but cannot publish geometry, baseline, physical fields or clear newer author intent. Submit the latest queued state immediately after completion. No detached arrays enter persistent state. Application/undo/load request the same pipeline.
- Version1 terrain JSON stores mesh identity, all author constraints and painted flag, current offsets/application report, all existing generator/render controls, and planet/orbit/time/camera settings. It does not save runtime climate fields, geological preview, or undo history. Load pauses, restores Original map and starts default-disabled environment models at saved time. Use explicit Download/Load; no automatic overwrite of another tab's data.
- Validate complete documents before any mutation: format/version, exact mesh identity, finite numbers, all known control bounds/integer seed, array lengths and ranges, physical/orbit config, saved time/camera and application report. Reject files above8MiB. Invalid/stale async file loads leave the current terrain intact. A newer terrain edit cancels a pending file read. JSON never supplies executable paths/code.
- Save only acknowledged terrain; load can supersede pending generation via the same revision gate. If browser file operations fail, report the error without changing terrain. Updated UI distinguishes pending/current applied status and explicitly describes reconstruction, clipping, sediment/report and budget limits.

## Review focus
- Fast paint/slider/apply/undo/reset/load sequences with delayed worker replies must publish only the newest revision and recycle detached buffers safely.
- Applying twice and undoing after later painting must retain current author constraints while exactly restoring the previous offset layer; Reset must not leave hidden erosion.
- Saved documents must reproduce terrain/river buffers deterministically on the same mesh, with physical scale/time/camera restored; malformed/oversized/incompatible files and stale asynchronous loads must be nonmutating.
- Preview/source ownership: a stale climate/terrain snapshot or hidden comparison preview must not be applicable; accepted geometry must clear obsolete probes and restart environment on the corresponding terrain.
- Norm bounds, clipping and recomputed drainage must stay finite across ocean/all-land/extreme preview inputs; application must not advertise cross-resolution sediment conservation or saved dynamic climate.

### Task 1: Offset state, generation gate and document codec
Files: `terrain-application.ts`, `generation-gate.ts`, `terrain-document.ts`, shared control descriptors, Node tests.
- [x] RED tests for projection/baseline arithmetic, bounds, undo, revision coalescing, document round trip and invalid schema.
- [x] Implement copied persistent offsets, complete validation and deterministic application before region/rainfall/drainage.
- [x] GREEN Node tests, add real-generator repeat/apply/undo coverage.

### Task 2: Worker/UI/application and portable save/load
Files: `map.ts`, `worker.ts`, `mapgen4.ts`, `painting.ts`, `spherical-constraints.ts`, `planet-controls.ts`, `geomorph-panel.ts`, `terrain-session-panel.ts`.
- [x] Browser RED missing Apply/session controls.
- [x] Integrate revision-safe generation and raw baseline snapshots, application/undo/reset, applied-state UI, explicit downloads/import, settings restoration and pending-state guards.
- [x] Verify repeat application, environment recoupling, later painting/undo, exact load round trip, invalid loads, pending/obsolete replies and mobile controls.

### Task 3: Verification and independent review
- [x] Node/typecheck/build and relevant legacy/planet/water/geomorph browser/DOM/GPU regressions, save concrete evidence and document limitations.
- [x] One independent review; no actionable findings, final checks and local handoff.
