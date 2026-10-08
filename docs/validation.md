# Spherical renderer validation — 2026-10-08

Implementation base: upstream `c1d8cb018a11a8b9e17d59233c36c176429d37eb`.
Branch: `codex/sphere-original-renderer` in the independent clone.

## Fixed diamond bands during rotation

After the radial perspective correction, the outline texture still used nearest-neighbor sampling inherited from the planar renderer. Radial taps move continuously in screen space; rounding those taps to whole texels introduces jumps along fixed diagonal boundaries (`radial.x ± radial.y = constant`). This caused terrain moving through those boundaries to abruptly acquire ridge outlines.

Changed the R16F outline texture to linear filtering, preserving the elevation comparisons and outline controls. A new browser fixture constructs the real Renderer and samples its actual outline texture across a smooth ramp. Before the fix it failed: maximum adjacent-sample jumps were 0.09998 horizontally/vertically and 0.20007 diagonally. After the fix all 771 samples passed, with maximum jumps 0.000489/0.000977 and maximum interpolation error 0.000147. See [GPU results](evidence/outline-sampling-report.json). This fixture is built by `npm test` but executed separately in WebGL2 at `/tests/gpu-outlines.html`.

Node tests (11/11), typecheck and build passed. Same-camera screenshots at seed 187, wind 78.584, x 212.958, y 472.108, zoom 0.173 and exaggerated outline strength 30 document [before](evidence/outline-before.png) and [after](evidence/outline-after.png). Forward/reverse drags at zoom 0.286 retain mountain outlines without the nearest-texel jumps; no captured runtime warnings/errors.

## Mountain perspective correction

The first sphere version added a camera-dependent screen-up offset to radial height. A peak at `[0,0,1]` with elevation 0.8 and height 50 incorrectly became `[0,40,340]` in the default camera. Both the CPU regression and actual WebGL2 shader fixture reproduced this failure before the fix.

Terrain now stays on its local radial line, `[0,0,340]` for that example, and camera transforms only rotate/project the fixed geometry. CPU picking uses the same displacement. Ridge outline samples follow the projected surface normal; coast sampling retains its symmetric neighborhood. Original palette, slope lighting, river shading and atlas passes remain.

After this correction, `npm test` passed 11/11 tests, typecheck and build passed. The browser-only [GPU fixture](../tests/gpu-radial.html), built by `npm test`, passed 72 vertex checks across four cameras and heights 0, 50 and 150. Maximum world-coordinate error was 0.00009273 units (tolerance 0.001). The fixture imports the actual displacement snippet used by the depth and drape shaders; it also compares GPU results with CPU picking positions. This browser run is separate from the Node test runner.

Current in-app browser verification (1280×720, WebGL2): painted a mountain chain, inspected the same chain at longitude controls 500, 450 and 350, rolled 90 degrees, raised mountain height to 150 and restored 50, checked coast outline 0.4 and restored 0. No captured warning/error logs. The images below were replaced with this corrected build. The user's pre-existing painted tab was preserved and a new preview tab opened. Independent read-only review found no actionable issues in the correction.

## Fresh build

The previous ignored build directory was retained as `.build-before-sphere-validation/`. A new empty `build/` was created by `npm run build`; it contains only the current sphere bundles, build marker, tests, reference fixture and new validation output. The original project outside the clone has no tracked changes. Dependency installation removed the former Three.js dependencies.

Passed:

- `pnpm install --frozen-lockfile` (with esbuild's build script explicitly allowed).
- `npm run build`.
- `npm run typecheck`.
- `npm test`: 11/11 tests, including production-density generation, topology and radial mountain positions.
- `git diff --check`.

## Geometry and generation

The default mesh has 26,919 regions and 53,834 triangles. Tests check reciprocal halfedges, Euler characteristic 2, normalized directions, worker structured-clone reconstruction, and no ghost region.

At production density both ridge and valley folds have zero inverted or collapsed faces. An independent reviewer reproduced a fixed-longitude-jitter defect (794 inverted valley faces), then verified the final tangent-space jitter fix: zero inversions and minimum edge length 3.529 world units. This regression is covered by the full-density test.

Other checks cover longitude wrap, polar-cap atlas area, angular brushes crossing the seam and poles, all-land drainage to a sink, all-ocean empty rivers, acyclic land drainage, finite geometry/river buffers, and ray picking on raised radial terrain under rotated views. Seed 187 → 188 → 187 reproduces elevation and element buffers bit for bit at full density.

## Initial implementation browser checks (before perspective correction)

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

The hemisphere and mountain layout differ because the mesh and noise cover a closed sphere. The third image is a real brush result, not the default seed. In the corrected projection, central mountains are viewed from above, and the same mountains show a side profile as they approach the limb.

### The same painted mountains near the limb, after correction

![Radial mountain profiles](evidence/sphere-radial-side.png)

### Corrected preview at an intermediate angle

![Corrected mountain perspective](evidence/sphere-radial-corrected.png)

## Limits of verification

Touch was emulated, not tested on physical touch hardware. Browser rendering was tested on this machine's Chrome/GPU, not across all GPU vendors. Very close polar views retain longitude/latitude atlas sampling limits. Rendering and navigation work without a new material/lighting engine; no generic physical material was substituted.

The independent code review found no remaining correctness issue after the fold fix. It did not independently grade visual fidelity; the screenshot comparisons above were performed in the main implementation session.
