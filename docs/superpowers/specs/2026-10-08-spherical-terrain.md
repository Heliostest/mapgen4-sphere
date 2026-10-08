# Mapgen4 spherical terrain

## Intent
Fork redblobgames/mapgen4 into Heliostest/mapgen4-sphere, clone locally, and implement a usable procedural planet. The user requested implementation after reviewing the feasibility analysis. Proceed in this session.

## Product
The default page is a rotatable, zoomable globe with continuous continents, ocean, mountains, climate colors and rivers. A terrain palette paints ocean, lowlands or mountains directly on the sphere; rotation is a separate tool, and right drag also rotates. Reset restores the seeded world; another seed produces another world. Controls include sea level, relief, rainfall and brush size. PNG export saves the current view. Keep the original planar demo at embed.html.

## Architecture
Add an isolated planet/ subsystem to the fork. A welded subdivided icosahedron gives uniformly distributed vertices, no longitude seam, and closed adjacency. This avoids the planar dual-mesh library's implicit ghost region assumptions. Seeded 3D simplex noise controls continent and ridge elevation. A latitude-aware moisture model with iterative ocean moisture transport replaces the planar one-pass wind order. Priority-flood drainage assigns acyclic flow to oceans, with a lowest-point sink for all-land worlds. These are stylistic terrain algorithms, not a physical climate or tectonics simulation.

The worker owns terrain state and serially handles generation, painting, reset and climate changes. Replies carry request IDs and transferable elevation, moisture, drainage and flow arrays. Main-thread requests coalesce while busy. Three.js renders displaced vertex-colored terrain and variable-width river ribbons; OrbitControls and ray picking provide globe interaction. All runtime dependencies are bundled locally, with no remote assets or API keys.

## Visual direction
A globe editing workbench: deep slate #111e2a, slate panel #182b38, pale blue text #e4edf2, subdued blue #8ba4b5, cyan water #51bdd1 and sand #d7c294. System Bahnschrift/Trebuchet for titles, Segoe UI for controls, Consolas for numeric readouts. The terrain globe occupies most of the view; quiet controls at the right, a compact tool palette below. Avoid decorative dashboard widgets. Responsive layout, labelled inputs, focus indicators, reduced-motion support and explicit loading/error messages.

## Acceptance
- Complete sphere: outward faces, every edge shared twice, Euler characteristic 2.
- Deterministic finite terrain; sea-level control changes land coverage monotonically.
- Brush acts by angular distance across longitude wrap and at poles, never paints the far side accidentally; reset restores original values.
- Drainage terminates, flows only to adjacent vertices, and handles all-land/all-ocean input.
- Browser visibly renders the globe, rotates, zooms, changes parameters, paints, resets and downloads a PNG without console errors.
- Build and tests work on Windows without a Unix shell; original demo still builds.

## Scope
Default mesh has 40,962 vertices / 81,920 faces, refined after browser validation showed coarse coastlines at level 5. Measured Node generation at level 6 was 74 ms on this machine. Preserve Apache-2.0 attribution. No remote deployment, PR to upstream, tectonic simulation, cities or country borders. Commit and push the completed feature branch to the user's new fork after validation.
