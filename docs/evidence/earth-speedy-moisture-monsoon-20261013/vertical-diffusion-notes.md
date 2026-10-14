# Conservative vertical exchange experiment (2026-10-13)

This opt-in experiment replaces only the vertical exchange operator. It does not
modify the installed SpeedyWeather package, formal defaults, or regional rain.
The default constructor preserves the original bulk Richardson diagnostic for
an operator-only ablation. The combined candidate opts into the shared
surface-aware diagnostic; both retain the original height-dependent `K_z`
formula and parameters. `K_z` remains in m²/s in the native scratch array.

## Interface

```julia
include("boundary-layer.jl")  # shared Frierson surface/interior Ri helpers
include("vertical-diffusion.jl")
scheme = ConservativeVerticalDiffusion(spectral_grid; diffuse_momentum=true,
    diffuse_humidity=true, diffuse_static_energy=true, surface_aware=true)
model = PrimitiveWetModel(spectral_grid; vertical_diffusion=scheme)
```

`ConservativeVerticalDiffusion(native_bulk_richardson_diffusion;
surface_aware=true)` also wraps an existing scheme. `surface_aware=false` is the
operator-only ablation and does not require `boundary-layer.jl`.
The implementation has its own `ConservativeVerticalMixing`
module; it does not redefine the caller's `SW` constant. Native variable
registration and initialization are forwarded. Only CPU and pure sigma
coordinates are supported; other architectures/coordinates fail at initialization.
`vars.parameterizations.vertical_mixing_active[ij]` is a dimensionless 0/1
diagnostic: it is one exactly when at least one interior conductance is positive,
and zero for no-mixing/all-disabled columns. It does not alter the tendencies.

The exported pure operators are `sigma_conductance(Kz, sigma, half, Tv, g, R_d;
k_top=1)` and `implicit_column_diffusion!(tend, x, conductance, mass, dt;
conversion=1)`. Here `mass=diff(half)`, `dt` is seconds, and the tendency is added
to its existing value.

## Units and conservation

For a hydrostatic ideal-gas column with surface pressure held fixed during the
parameterization, `dσ/dz = -ρg/p_s = -gσ/(R_d T_v)`. The mass-specific height
diffusion equation

`∂x/∂t = (1/ρ) ∂/∂z (ρ K_z ∂x/∂z)`

therefore becomes `∂x/∂t = ∂/∂σ (K_σ ∂x/∂σ)`, with
`K_σ = (gσ/(R_d T_v))² K_z`, in s⁻¹. Merely repairing the native neighbour
indices would incorrectly apply a coefficient in m²/s to dimensionless sigma
gradients. Each interior interface linearly interpolates `K_z` and `T_v` at the
actual half-level location, then forms `c = K_σ / (σ[k+1]-σ[k])`.

The backward-Euler solve is `(M + dt L) x_new = M x_old`, where
`M=diag(Δσ)` and `L` is the symmetric conductance Laplacian. For nonnegative
conductances this matrix has positive diagonal, nonpositive off-diagonal, and
strict diagonal dominance. Its inverse is nonnegative: the isolated column
update is bounded by the old extrema for every positive timestep. This includes
positive humidity without clipping. Each solved interface flux is added to one
cell and subtracted from the other, divided by its own `Δσ`; thus
`Σ Δσ dx/dt = 0` up to floating-point roundoff, including nonuniform layers.
Multiplying by `p_s/g` gives physical mass-weighted column conservation.

The atmosphere top, surface, and diagnosed boundary-layer top have zero flux.
There is no unpaired exchange with a layer above the active boundary layer.
The native `k_top` may be `nlayers+1` (no mixing), which is a valid no-op.

Humidity, both wind components, and dry static energy `s = c_p T + Φ` share the
same conductances. Static energy exchange contributes `(ds/dt)/c_p` to the
temperature tendency with geopotential held fixed during this local operation.
It conserves mass-weighted water, momentum, and dry static energy. It does not
promise conservation of kinetic energy, nor the fully coupled model's total
energy after dynamics and other parameterizations.

`dt = SpeedyWeather.time_step(stepper, clock)` uses the actual prognostic update
interval. For the tested Leapfrog configuration with a 1800 s nominal step,
startup intervals are 900 s and 1800 s; subsequent exchanges use 3600 s.
Tendencies use native prognostic/tendency step selectors. Source fields and
pre-existing tendencies from other schemes are not overwritten.

## Verification

Final result: **240/240 assertions passed**, exit 0. See
`vertical-diffusion-final-green.log` and
`vertical-diffusion-final-green-status.json`; implementation, tests, shared
boundary-layer helper, and original installed diffusion source all had identical
before/after SHA-256 hashes (`sourceUnchanged=true`). The installed diffusion
source also still matches the first native RED run.

Run from the `mapgen4-sphere` directory with the provided Julia runtime and
`--project=docs/evidence/earth-speedyweather-20261012/julia-env`, setting
`JULIA_DEPOT_PATH` to the absolute `build/earth-speedyweather/depot` directory,
`JULIA_NUM_THREADS=2`, and `OPENBLAS_NUM_THREADS=1`.

- `VERTICAL_DIFFUSION_IMPLEMENTATION=native` intentionally fails the regression:
  four nonuniform humidity values and positive `K_z=10` produce exactly zero
  native tendencies. See `vertical-diffusion-red-native.log` and
  `vertical-diffusion-red-status.json` (exit 1, source unchanged during run).
- `VERTICAL_DIFFUSION_IMPLEMENTATION=fixed` selects the replacement and includes
  a two-layer analytic solution/units check, nonuniform layer masses, constant
  profiles, positive and monotone humidity, extrema bounds, dissipation,
  momentum/water/static-energy conservation, sealed boundary-layer top,
  one-layer/no-mixing cases, and 1800/3600 s steps. A deliberately extreme
  `10^6` multiplier on `K_z` stresses implicit stability; it is only a test
  input and is not a model tuning parameter.
- A real initialized `PrimitiveWetModel` exercises native variable registration,
  native `K_z`/Richardson diagnostics, all four field tendencies, and Leapfrog
  startup/regular intervals on a nonuniform eight-layer grid. It verifies
  that `K_z`, Richardson scratch values, and boundary-layer height match the
  unchanged native diagnostics.
- Set `VERTICAL_SURFACE_IMPLEMENTATION=native` to reproduce the separate
  stability-diagnostic regression (five failed assertions in
  `vertical-diffusion-surface-red.log`): the original scheme gives identical
  positive lowest-layer Ri over cold and warm surfaces, and translating the
  same column 3000 m upward changes its Ri, `K_z`, and boundary-layer index.
  `VERTICAL_SURFACE_IMPLEMENTATION=fixed` includes `boundary-layer.jl` and tests
  the shared helper through the vertical mixing wrapper.

In the final controlled surface fixture, cold-water `Ri_N=19.7932` gives no
active boundary layer (`k_top=9` for eight layers), while warm-water
`Ri_N=-8.64614` gives `k_top=1` and `max(K_z)=3.95109 m²/s`. The fixture's
temperature, humidity and winds are deliberately prescribed for diagnosis;
these values are not observations or climate validation. The corrected warm
case preserves the four column budgets and bounds. The 3000 m translated
column retains the same Ri, coefficients and mixing depth.

## Limits and follow-up

The optional `surface_aware=true` candidate uses the shared helper in
`boundary-layer.jl`, following [Frierson et al. (2006), equations 15–16](https://www.gfdl.noaa.gov/bibliography/related_files/dmwf0601.pdf).
The surface Ri uses the actual area-weighted land/ocean virtual surface
temperature as reference. Interior Ri uses the lowest atmospheric layer's
virtual dry static energy, not the surface. Both use geopotential relative to
the terrain. This preserves the distinction between surface instability and
interior stability. `K_z` equations, critical Ri, roughness, wind speed and other
parameters are unchanged. The default `surface_aware=false` mode intentionally
retains the native diagnostic defects only for the operator ablation.

The local boundedness proof covers this isolated backward-Euler exchange.
Spectral truncation, time filtering, other tendencies, or a later coupled update
can still introduce undershoots. This test does not establish long-run climate
stability or improved Indian/northern Australian monsoon precipitation.
The CPU implementation allocates small column vectors and has not been optimized
or benchmarked for multiyear runs. Native invalid/nonfinite coefficients produce
an explicit error rather than being silently clipped or replaced.

Integration code follows SpeedyWeather under EUPL-1.2; attribution and the
2026-10-13 modification date are in `vertical-diffusion.jl`, with the original
license in `LICENSE-SpeedyWeather.txt`.
