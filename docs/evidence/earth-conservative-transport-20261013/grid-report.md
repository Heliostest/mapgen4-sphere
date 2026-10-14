# Conservative reduced Gaussian mesh adapter

This isolated Julia adapter supplies shared finite-volume faces for the existing
3168-point reduced Gaussian geometry. It preserves the input cell ordering and
the Gaussian quadrature area of every cell. It does not change the formal
application default, installed SpeedyWeather source, or earlier evidence.

## Interface and units

`include("conservative-grid.jl"); using .ConservativeGrid`

```julia
mesh = build_gaussian_mesh(geometry.latDegrees, geometry.lonDegrees, geometry.weights)
normal_velocity = sample_native_velocity(mesh, u, v)
```

`Mesh` contains `area`, `from`, `to`, `edgeLength`, `centerDistance`, `edgeKind`,
`lat`, `lon`, `edgeLat`, `edgeLon`, and `ringIndex`. Cell indices refer to original
input arrays; ring indices increase from south to north. `area` is in steradians;
all coordinates and lengths are in radians. On a sphere of radius R, multiply
area by R² and lengths/distances by R. Velocity input and output use the same
linear units, such as m/s. A shared volumetric-like face factor is therefore
`normal_velocity .* mesh.edgeLength .* R`.

An edge occurs once, oriented from `from` to `to`. Zonal edges point east;
meridional edges point north. A face flux subtracted from the source mass must
be added to the destination mass using the identical numerical value. Two-cell
longitude rings have two physical zonal faces between the same pair of cells.
There are no artificial neighbors beyond the poles.

## Geometry construction

Cell i retains exactly `area[i] = 4π * weights[i]`. For ring weights W accumulated
from the south, each ring boundary uses `sin(φ) = -1 + 2 * cumulative(W)`.
The outer boundaries close at ±π/2. Input weights must already sum to one within
floating-point tolerance; they are never renormalized or replaced by cos(latitude).
Within each ring, centers must be equally spaced in longitude and weights equal.
Each center must lie inside its weight-derived latitude band. Rings with fewer
than two longitude cells, repeated longitudes, nonuniform spacing, nonfinite
values, polar centers, invalid weights, and mismatched array lengths fail.

The zonal face length is `φ_north - φ_south`; its normal center distance is
`cos(φ_center) * Δλ`. Adjacent latitude rings share faces formed by the actual
overlap of their longitude intervals. Such a face has length `cos(φ_boundary) *
Δλ_overlap` and normal center distance `φ_center_north - φ_center_south`.
Intervals crossing longitude zero are split during intersection and joined
back when they belong to the same adjacent cell pair. This avoids double-counting
the arbitrary coordinate seam. Longitude origins may differ between rings.

`centerDistance` records the normal coordinate distance. It is not a great-circle
distance between staggered cell centers, and by itself is not a general gradient
reconstruction on a nonorthogonal grid.

## Velocity sampling limit

The optional sampler averages eastward velocity at the two endpoints of a zonal
face. It interpolates northward velocity linearly in latitude to a meridional
face boundary. This guarantees one identical face sample for both adjacent
cells. On reduced rings the endpoints can have different longitudes, so the
sampler is a low-order approximation. It does not reconstruct arbitrary vector
fields exactly or guarantee divergence-free arbitrary-axis rigid rotation.
The tests establish zero discrete divergence for constant eastward velocity and
rotation about the polar axis, plus exact meridional sampling for a velocity
affine in latitude. A constant northward component is not claimed divergence-free
on the sphere. These geometry results do not establish pressure/moisture solver
stability, positivity, physical climate skill, or convergence order.

## Reproducible verification

The tests were written before the adapter. The first run failed at the explicit
missing-adapter assertion, with exit code 1 and no test errors. The adapter was
then implemented and the full standalone suite passed: **6412 assertions**.
The initial RED log is `build/earth-conservative-transport/grid-tests-red.log`;
the GREEN log is `build/earth-conservative-transport/grid-tests-green.log`.

The hand-derived fixtures cover:

- Four cells: two hemispherical bands with two longitude cells each; each area
  π, four zonal faces of length π/2, and two shared equatorial arcs of length π.
- Eight cells: two four-cell rings staggered 45°; each area π/2 and eight shared
  equatorial overlap arcs of length π/4, including the longitude seam.
- Six cells: two versus four longitude cells, a shifted longitude origin, and
  unequal ring weights. The boundary is -30°, different from the center midpoint;
  the overlap lengths and interpolated affine velocity are checked independently.
- Malformed/unsupported input rejection, arbitrary input cell ordering, graph
  connectivity, per-cell interface coverage, and cancellation of shared fluxes.

The native geometry is read from the frozen
`build/earth-speedy-transport/split-reference-seasonal-geometry.json`.

| Native result | Value |
| --- | ---: |
| Cells | 3168 |
| Latitude rings | 48 |
| Shared faces | 9352 |
| Area sum (steradians) | 12.566370614359174 |
| Area sum minus 4π | 1.7763568394002505e-15 |
| Minimum area | 0.0009906528792149832 |
| Maximum area | 0.004399768956132413 |
| Maximum polar-axis rigid-rotation discrete divergence | 0.0 |
| Global arbitrary shared-flux incidence residual | -6.217248937900877e-15 |

PowerShell invocation from `mapgen4-sphere`:

```powershell
$env:JULIA_DEPOT_PATH = (Resolve-Path 'build/earth-speedyweather/depot').Path
& 'build/earth-speedyweather/runtime/julia-1.12.7/bin/julia.exe' `
  '--project=docs/evidence/earth-speedyweather-20261012/julia-env' `
  'docs/evidence/earth-conservative-transport-20261013/test-conservative-grid.jl'
```

The JavaScript application test command was inspected but not run by this
subtask: it writes to `build/tests`, outside this subtask's assigned new-output
prefix. No JavaScript application test result is claimed here.
