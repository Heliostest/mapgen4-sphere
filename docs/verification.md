# Verification

Verified on Windows on 2026-10-08 with Node.js 24.11.1 and pnpm 11.14.0.

## Automated checks

- `pnpm install --frozen-lockfile`: passed, including esbuild's install step.
- `npm test`: 11 tests passed, 0 failed.
- `npm run typecheck`: passed with strict TypeScript checking.
- `npm run build`: passed; produced globe, planet worker and CSS, plus the original planar bundles and point data.
- `git diff --check`: passed.

On this Windows host the PowerShell execution policy blocks the `npm.ps1` wrapper; the final checks used the equivalent `npm.cmd` commands. No policy change was needed.

The tests cover closed spherical topology, outward normals, deterministic generation, sea coverage, downhill terminating drainage, all-land/all-ocean cases, seam/pole painting, retained edits, reset/seed ordering, multi-touch cancellation and page lifecycle cleanup. The worker's stateful session is tested directly; browser checks exercise actual worker messaging.

## Browser checks

Used the Codex in-app Chromium browser against `http://127.0.0.1:8000/`.

- Default world rendered successfully: seed 187, 56.0% ocean, 44.0% land.
- Drag rotation and wheel zoom visibly changed the camera.
- Mountain painting changed the globe and coverage; ocean painting and terrain reset completed new generation revisions.
- Ocean coverage changed to 90% through the slider and was reflected in the generated result.
- New-world generation and manually typing seed 2026 updated the displayed seed and terrain.
- Graticule could be shown and hidden.
- PNG export produced `mapgen4-planet-2026.png` in the browser's download directory.
- The original `/embed.html` loaded its planar map and controls without console errors.
- Navigating back to the globe and generating another world remained functional.
- A 390 x 844 viewport showed the complete globe without horizontal overflow. The camera's field of view now adapts to narrow viewports. Desktop viewport was restored afterward.
- Final browser error/warning log was empty. The default world reported 54 ms for generation in the final preview; this is a single local observation, not a frame-rate or cross-device benchmark.

![Verified desktop preview](planet-preview.jpg)

## Independent review and fixes

A separate code reviewer examined topology, drainage, worker state and browser interactions. Two findings were fixed and covered by regression tests:

1. A second touch could paint while starting a pinch gesture. Painting now stays suspended until all touches lift.
2. An unconditional `pagehide` cleanup could terminate the worker for a cached page. Cleanup now runs only for permanent exits.

The browser navigation check does not establish that Chromium actually restored from BFCache; the lifecycle distinction is verified by the unit test. Physical multi-touch hardware, Safari and Firefox were not tested. No deployment or sustained frame-rate benchmark was performed.

## Current limits

Edits live in memory and are lost on reload. PNG export saves the current view, not an editable project. Climate and erosion are artistic approximations, and the renderer does not reproduce all of the planar demo's outline effects.
