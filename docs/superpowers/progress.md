# Execution ledger — spherical terrain

Fork: https://github.com/Heliostest/mapgen4-sphere
Branch: codex/spherical-terrain
Plan: plans/2026-10-08-spherical-terrain.md
User approved implementation of the previously discussed true spherical terrain, with fork/clone explicitly requested.
Pre-flight: mesh and terrain are pure and share typed arrays; worker serialization uses this exact shape; renderer consumes the same shape. No competing writes.
Decision: use a welded icosphere rather than patch ghost assumptions in dual-mesh; this isolates the globe while preserving the original demo. Three.js provides tested camera/ray picking and GPU resource management.

Implementation complete: welded sphere, deterministic continents/climate, terminating downhill drainage, angular brushes, worker-retained edits and responsive Three.js editor. The original planar demo still builds and runs.

Visual refinement: increased subdivision to level 6, smoothed terrain normals, reduced default relief to 6%, tuned river visibility and adapted camera field of view for portrait viewports.

Independent review found multi-touch painting and BFCache cleanup issues. Both were fixed with tests that failed before the fixes. Final validation: 11/11 tests, strict typecheck, production build and whitespace checks passed. Lockfile installation passed. Browser generation, orbit, zoom, brush/reset, seed/coverage, graticule, PNG download, original demo and mobile layout checks passed. See ../verification.md for the exact scope and limitations.

Current delivery step: commit verified implementation and publish codex/spherical-terrain to the user's fork. The localhost preview is running; no upstream PR or deployment is being created.
