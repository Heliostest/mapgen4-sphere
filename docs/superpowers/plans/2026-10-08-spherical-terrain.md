# Spherical Terrain Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver a locally runnable, editable globe in the user's fork of Mapgen4.
**Architecture:** Pure spherical mesh and terrain modules, worker-owned generation, Three.js renderer and browser controls. Keep the existing planar implementation available.
**Tech Stack:** TypeScript, simplex-noise, flatqueue, Three.js, esbuild, Node test runner.
**Spec:** ../specs/2026-10-08-spherical-terrain.md

## Global Constraints
- Work only in the newly cloned fork on codex/spherical-terrain.
- No required runtime network requests or external assets.
- Default mesh: 40,962 vertices and 81,920 faces after visual refinement.
- Preserve Apache-2.0 attribution and build the original embed.html demo.

## Review Focus
- Closed globe seam/poles: verify manifold topology and outward face normals.
- No ocean outlets: ensure all-land drainage terminates at one sink.
- Rapid interaction: worker coalesces changes and preserves painting commands.
- Parameter/reset changes during drawing: stale results cannot overwrite the final state.
- Canvas resize/mobile: maintain camera aspect, picking and controls without overflow.

### Task 1: Pure spherical geometry and terrain
Files: planet/mesh.ts, planet/terrain.ts, tests/planet.test.ts, package.json, scripts/test.mjs.
Interfaces: makeSphere(level): SphereMesh {positions, triangles, neighbors}; generateTerrain(mesh, params, edits?) returns {elevation, moisture, drainage, flow}; paintTerrain(mesh, edits, center, radius, target, strength): void.
- [x] Write failing behavioral tests for manifold topology, determinism, sea coverage, drainage termination and seam/pole brushing.
- [x] Implement welded icosphere and seeded noise/climate/drainage; verify tests pass.
- Delivery adjustment: core and editor are committed together after integration verification.

### Task 2: Worker, renderer and usable editor
Files: planet/worker.ts, planet/protocol.ts, planet/renderer.ts, planet/main.ts, planet/style.css, index.html, scripts/build.mjs, scripts/dev.mjs.
Interfaces: WorkerRequest {id, params, reset?, strokes?}; WorkerResponse {id, result?, error?, elapsed}; PlanetRenderer.update(result), pick(clientX,clientY), setTool(), exportImage().
- [x] Build worker around Task 1 and verify its retained session with the test runner and messaging in the browser.
- [x] Implement globe mesh, lighting, river ribbons, orbit controls and ray-based painting.
- [x] Build responsive editor and cross-platform scripts; run npm test and npm run build.
- [x] Serve locally and visually check generation, camera, painting, reset, export and responsive layout.

### Task 3: Review and delivery
Files: README.md, docs/verification.md.
- [x] Record actual test/browser results and limitations; independently review the diff.
- [x] Fix important findings and rerun affected checks.
- [x] Commit and push feature branch to the fork and show the running page. Delivery checks compare the final local and remote commit IDs.
