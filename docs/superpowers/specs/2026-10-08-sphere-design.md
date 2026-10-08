# Editable spherical Mapgen4

The user has authorized a fresh implementation from upstream main, preserving Mapgen4's drawing style and UI. The rejected branch is not an implementation reference.

Keep the five custom WebGL2 passes (river, land elevation, depth, drape, final), the unchanged biome colormap, the original valley/ridge folds, mountain distance field, rainfall and drainage. No general-purpose material or scene-lighting replacement.

The final pass also completes the exterior silhouette using coverage stored in drape alpha. This reaches background pixels around exposed peaks and ocean edges, uses the existing outline width/strength controls, and keeps the displayed image opaque.

Use a closed spherical Delaunay dual mesh, with approximately the original region density per surface area. Store unit directions alongside longitude/latitude coordinates. Noise uses 3D coordinates; spherical painting uses angular distance. The atlas wraps longitude and explicitly fills polar caps. The drape and depth passes displace unit directions radially, independent of the camera; the original planar screen-up relief is removed because it distorts mountains during rotation. Slope texture differences account for the latitude metric. Screen-space ridge/coast outlines continue to compare terrain elevation, not globe curvature. Ridge sampling follows the projected local surface normal, fading toward a top-down view; coast sampling stays symmetric.

Keep the existing controls. Left drag paints; right/Alt drag and touch navigation rotate; wheel zooms. Picking intersects the actual displaced triangles and ignores empty space. Existing x/y, rotation, tilt, height and shading sliders remain meaningful. Reset restores deterministic terrain.

Build from source with local esbuild, replacing the old ignored build directory. Compare against a separately built upstream fixture. Validate topology, seams/poles, painting, regeneration, navigation, all-ocean/all-land drainage, shader compilation, and screenshots. Original project files outside this clone are read-only.
