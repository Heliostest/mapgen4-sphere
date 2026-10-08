# Mapgen4 — editable spherical terrain

A spherical adaptation of [Red Blob Games' Mapgen4](https://www.redblobgames.com/maps/mapgen4/), based on upstream commit `c1d8cb0`. It retains the original WebGL2 renderer, biome palette, terrain folds, river curves, and parameter UI.

## Run

With Node.js 22+ and pnpm 11:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Open [localhost:8000](http://localhost:8000/embed.html). `npm install`, `npm run build`, and `npm start` also work. The server binds to loopback and disables caching. The sphere generates its mesh at startup; old planar point files are not used.

- Left drag paints Ocean, Water, Valley, or Mountains. The four original brush sizes and keyboard shortcuts still work.
- Right drag or Alt-drag rotates. The wheel zooms.
- **Drag: Paint / Rotate** switches one-finger touch behavior.
- `x` and `y` select longitude and latitude; `rotate_deg` rolls the view, and `tilt_deg` adds latitude tilt. Other render controls keep their original purpose.
- Reset restores the current seed's terrain. Painting disables seed/island controls until Reset, as in the original.

## Rendering preserved

| Original component | Spherical adaptation |
| --- | --- |
| `colormap.ts` elevation/rainfall palette | Unchanged |
| River barycentric curves, widths, antialiasing and blue | Same fragment shader; primitives wrap the longitude seam and retain barycentric values at poles |
| Land elevation texture and river-bank depression | Same pass and formula, in a periodic 4096×2048 surface atlas |
| Valley/ridge quadrilateral folds | Same selection and mountain-fold formula, on a closed spherical dual mesh |
| Slope/flat/ambient/overhead lighting | Same custom shading; finite differences account for physical distance at each latitude |
| Depth-based ridge/coast outlines | Same elevation comparison; ridge samples follow the projected local vertical, coast samples remain symmetric |
| Mountain profiles | Fixed radial height along each surface normal, independent of camera orientation |
| Outer silhouette | Coverage-based outline in the final pass, including mountain peaks against the background |
| Final texture composition | Original smoothing offset, plus silhouette ink controlled by `outline_depth` and `outline_strength` |

No scene lights, physical materials, or vertex-color palette replacement are used.

## Necessary geometry and generation changes

`sphere-mesh.ts` builds a closed Delaunay halfedge mesh from well-spaced spherical points: 26,919 regions and 53,834 triangles at the default spacing. There are no ghost boundaries or duplicated seam regions. Mountain spacing, the elevation mixture, rainfall and river accumulation retain the original algorithms; noise is sampled in 3D and wind ordering uses a continuous spherical direction. The `island` parameter adjusts ocean coverage because a globe has no rectangular edge. An all-land world drains to its lowest point.

`spherical-constraints.ts` measures brushes by angular distance, so strokes cross the date line and poles. `sphere-view.ts` picks the actual displaced terrain and recovers its original surface coordinates. Painting never hits empty space or an occluded far-side triangle.

The new landscape is not the same seeded planar island wrapped into a globe. Geometry and noise change to cover a closed surface; the cartographic rendering stays Mapgen4's. Extreme polar closeups retain the sampling limits of a longitude/latitude atlas.

## Verification

```sh
pnpm test
pnpm typecheck
pnpm build
node scripts/build-reference.mjs
```

The reference command reconstructs and builds the original source only inside `build/reference/`. Compare it at [the original reference page](http://localhost:8000/build/reference/embed.html).

`pnpm test` also builds the GPU regression fixture. With the server running, open [the mountain projection check](http://localhost:8000/tests/gpu-radial.html): WebGL2 transform feedback checks the actual depth/drape displacement shader against fixed world positions and CPU picking geometry across four camera orientations and three heights. Its browser result must say `PASS`; the Node test command does not execute this browser check.

The [outline sampling check](http://localhost:8000/tests/gpu-outlines.html) must also say `PASS`. It samples the renderer's actual outline texture at 771 fractional positions to detect pixel snapping that would cause stationary diamond-shaped bands during rotation.

The [silhouette check](http://localhost:8000/tests/gpu-silhouette.html) checks background/sea coverage and the actual final shader: all eight edge directions, identical foreground/background colors, unchanged interior pixels, opaque output, and disabling either outline control. Like the other GPU fixtures, run it in the browser after `pnpm test` builds it.

For automated screenshots and browser interactions, install Playwright in a separate tooling environment (or locally) and have Chrome installed:

```sh
node scripts/browser-check.mjs
```

`PLAYWRIGHT_MODULE` can point to that environment's `playwright/index.mjs` as a `file:` URL. Results and screenshots go to `build/validation/`. The runner checks painting/reset, camera controls, seams/poles, shading controls, seed reproducibility, touch emulation, and browser errors. See [validation notes](docs/validation.md).

Original documentation and credits are in [README.org](README.org). Apache-2.0; original Mapgen4 and helper code copyright Red Blob Games.
