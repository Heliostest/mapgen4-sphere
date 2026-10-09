# Terrain Water Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task by task.

**Goal:** Make river widths, lake coverage and wet ground respond to conserved simulated water on real terrain.
**Architecture:** Optional mesh reservoir routing owned by WaterModel, synchronized to coarse source/sink stores; checkpointed fine volumes/fluxes; atlas-based rendering using the existing globe.
**Tech Stack:** TypeScript, Node tests, WebGL2, Playwright.
**Spec:** docs/superpowers/specs/2026-10-09-terrain-water-design.md

## Global constraints
- Current nested repo and branch only. Preserve complete-save v1 imports and original artist mode.
- No additional water inventory. Preserve nonnegative donors and existing budget thresholds.
- No shallow-water/GCM claim; show units and approximation boundaries.

## Review focus
- Unresolved coast cells retain mass; no accidental ocean sink on all-land worlds.
- Evaporation/source reconciliation cannot create or erase volume.
- Fine state must roll back and resume alongside coarse state.
- Terrain changes invalidate old routing; file restore validates dimensions and aggregate stores.
- Original map and polar sampling remain intact.

### Task 1: Conservative mesh reservoir routing
**Files:** terrain-water.ts (new), tests/terrain-water.test.ts (new), water.ts, thermal-runtime.ts, runtime-state.ts, surface-grid.ts.
**Interfaces:** TerrainWater checkpoint/restore/route/diagnose; mesh construction with cell, area, bed and sill geometry; WaterModel owns routing.
- [x] Add failing closed-basin/spill, positivity, source reconciliation, fine/coarse conservation and exact checkpoint continuation tests.
- [x] Implement donor-limited paired transfers with sill thresholds and correct SI units; include fine state in full persistence and visible rollback.
- [x] Run Node suite and typecheck; expect all pass.

### Task 2: Geographic view and controls
**Files:** terrain-water-view.ts (new), render.ts, planet-render.ts, planet-controls.ts, environment-panel.ts, mapgen4.ts.
**Interfaces:** fine routing view with discharge-scaled connected river geometry and lake/wetland atlas; controls opt into terrain-water mode.
- [x] Add renderer/browser checks for dry versus wet, time-driven changes, lakes, inspector, save/reload and Original restoration.
- [x] Implement view, controls and explicitly labelled approximations without coarse rectangular overlays.
- [x] Run build and real browser regressions; inspect screenshots and fix visual failures.

### Task 3: Acceptance and commit
- [x] Independent code review; fix correctness issues with reproductions.
- [x] Document numeric and browser evidence; local stage commit before stage 3.

## Execution record
Native execution under existing phased authorization. Stage-1 acceptance complete; this plan's routing checkpoint is consumed by its view and complete-save integration.

Acceptance: 120 tests, typecheck/build, five new browser groups and all six existing browser suites passed. Independent review found one P1 topology mismatch; the failing valley test became green after sharing authored quad topology. Re-review passed. See docs/terrain-water.md.
