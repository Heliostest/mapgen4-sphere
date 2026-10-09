# Simulation Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Save, reload and resume the complete simulation without changing the visible moment or conservation budgets.

**Architecture:** Typed runtime snapshots with explicit validation, a versioned document envelope, and prepared terrain/runtime replacement. Legacy terrain files retain their existing semantics.

**Tech Stack:** TypeScript, Node tests, WebGL2, existing Worker and Playwright scripts.

**Spec:** docs/superpowers/specs/2026-10-09-simulation-save-design.md

## Global Constraints

- Work only in the nested repository and current branch. Keep localhost:8002.
- Preserve the 96×49 polar geographic surface, conservative fields and compensation terms.
- Validate and prepare before replacement. Failed loads preserve the world.
- Local commits only; no push or merge. Continue already authorized work without extra review approvals.

## Review Focus

- Saving between a submitted frame and the last visible frame must capture the visible state.
- An old asynchronous load must not replace a newer edit, load or progressing simulation.
- Null climate, thermal-only climate and changed options must roundtrip.
- Inconsistent derived dimensions/times/configuration must be rejected before mutation.
- Old terrain files and real painted/applied terrain must remain portable.

### Task 1: Runtime snapshot and deterministic hydration

**Files:** thermal-runtime.ts, runtime-state.ts (new), thermal.ts, water.ts, environment.ts, tests/simulation.test.ts (new), scripts/test.mjs.

**Interfaces:** `ThermalRuntime.snapshot(): RuntimeState`; `ThermalRuntime.fromSnapshot(state, planet, orbit): ThermalRuntime`; `decodeRuntimeState(value: unknown): RuntimeState`.

- [x] Write tests comparing uninterrupted evolution with JSON-decoded, reloaded evolution; check all checkpoints, surface texture, budgets and independent arrays. Include off and thermal-only states and rollback.
- [x] Run tests; expect missing snapshot API to fail.
- [x] Implement explicit state schema, finite/range/dimension validation and model hydration without climate generation.
- [x] Run focused tests; expect exact state equality and unchanged budget residuals.

### Task 2: Document, controls and atomic replacement

**Files:** simulation-document.ts (new), terrain-session-panel.ts, terrain-preparation.ts (new), mapgen4.ts, planet-controls.ts, environment-panel.ts, environment-comparison.ts.

**Interfaces:** `encodeSimulationDocument` / `decodeSimulationDocument`; controls snapshot/prepared restore; comparison state capture/restore; Promise-based loader.

- [x] Add document tests for malformed arrays, finite values, versions, parameter ranges, time consistency, size and baseline/history serialization. Expect missing document API to fail.
- [x] Implement the versioned envelope, explicit full-save UI, legacy terrain download/import, candidate terrain worker and atomic paused commit guarded by revision.
- [x] Run npm test, npm run typecheck and npm run build. Expected: all pass.

### Task 3: Real browser acceptance and stage commit

**Files:** scripts/simulation-browser-check.mjs (new), docs/evidence/simulation-*, docs/validation.md, docs/simulation-save.md (new).

- [x] Exercise save/reload/continuation via actual download/file input; compare frames, fields and CSV baseline. Include invalid files and edit-during-load.
- [x] Run relevant existing application, environment and polar browser regressions and inspect screenshots.
- [x] Request one independent code review; resolve correctness findings and rerun covering checks.
- [x] Record evidence, mark acceptance and commit stage 1 locally before stage 2.

## Execution record

Native execution selected for the tightly coupled state/loader work. Existing authorization supersedes repeated plan approval gates. Task 1 state is consumed by Task 2; Task 2 UI is exercised by Task 3. Interfaces agree. Windows-native commands and this record replace Bash-only skill bookkeeping helpers.

Tasks 1–3 complete: 110/110 Node tests, typecheck/build, complete-save browser 7 groups and prior environment/surface/application/planet/water regressions. Independent review issue (missing active state) and related albedo consistency both covered RED→GREEN. Authored-world acceptance exposed soil roundoff; capped donor subtraction passed RED→GREEN with unchanged conservation tolerance. No deferred correctness findings. Main session inspected actual screenshots.
