# Spherical renderer validation — 2026-10-08

Implementation base: upstream `c1d8cb018a11a8b9e17d59233c36c176429d37eb`.
Branch: `codex/sphere-original-renderer` in the independent clone.

## Fresh build

The previous ignored build directory was retained as `.build-before-sphere-validation/`. A new empty `build/` was created by `npm run build`; it contains only the current sphere bundles, build marker, tests, reference fixture and new validation output. The original project outside the clone has no tracked changes. Dependency installation removed the former Three.js dependencies.

Passed:

- `pnpm install --frozen-lockfile` (with esbuild's build script explicitly allowed).
- `npm run build`.
- `npm run typecheck`.
- `npm test`: 10/10 tests, including production-density generation and topology.
- `git diff --check`.

## Geometry and generation

The default mesh has 26,919 regions and 53,834 triangles. Tests check reciprocal halfedges, Euler characteristic 2, normalized directions, worker structured-clone reconstruction, and no ghost region.

At production density both ridge and valley folds have zero inverted or collapsed faces. An independent reviewer reproduced a fixed-longitude-jitter defect (794 inverted valley faces), then verified the final tangent-space jitter fix: zero inversions and minimum edge length 3.529 world units. This regression is covered by the full-density test.

Other checks cover longitude wrap, polar-cap atlas area, angular brushes crossing the seam and poles, all-land drainage to a sink, all-ocean empty rivers, acyclic land drainage, finite geometry/river buffers, and ray picking on raised/oblique terrain under rotated views. Seed 187 → 188 → 187 reproduces elevation and element buffers bit for bit at full density.

## Browser and visual checks

Chrome, WebGL2, desktop viewport 1300×1000; additional mobile emulation 390×844. The original fixture was rebuilt directly from upstream source and checked alongside the new renderer.

The [browser report](evidence/browser-report.json) records 9 interaction groups, zero captured runtime/shader errors, and 83 terrain generations. Worker computation was 13.5–54.5 ms, median 14.3 ms on this machine; this is **worker time only**, not full frame time or a cross-device performance guarantee.

Verified all four brushes, reset, empty-space clicks, right-drag rotation, wheel zoom, synchronized sliders, seam/pole painting, seed changes, neutral/biome colors, coast/ridge/river-bank outlines, light-angle changes, and touch-mode rotation/painting. Screenshots after reset/seed restoration are compared with a tolerance of at most eight color channels differing by 1/255; one observed GPU screenshot discrepancy was a single channel in one pixel. Core terrain-data equality has no tolerance.

Visual inspection confirms the original layered ocean palette, green/tan biome transitions, blue variable-width rivers, lit mountain slopes, dark ridge profiles, and coastal lines. `colormap.ts` and `dual-mesh/` are unchanged. The original river fragment shader, custom lighting controls, elevation-based outlines and final composition remain in `render.ts`.

### Original, unmodified default

![Original Mapgen4](evidence/original-default.png)

### Spherical default

![Spherical Mapgen4](evidence/sphere-default.png)

### Spherical terrain after painting mountains

![Spherical mountain brush result](evidence/sphere-painted.png)

The hemisphere and mountain layout differ because the mesh and noise cover a closed sphere. The third image is a real brush result, not the default seed. Screen-up mountain relief from the original oblique projection is preserved and fades at the limb.

## Limits of verification

Touch was emulated, not tested on physical touch hardware. Browser rendering was tested on this machine's Chrome/GPU, not across all GPU vendors. Very close polar views retain longitude/latitude atlas sampling limits. Rendering and navigation work without a new material/lighting engine; no generic physical material was substituted.

The independent code review found no remaining correctness issue after the fold fix. It did not independently grade visual fidelity; the screenshot comparisons above were performed in the main implementation session.
