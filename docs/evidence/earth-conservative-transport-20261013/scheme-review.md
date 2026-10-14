# Independent pressure–carrier scheme review

2026-10-13. This review reads the frozen preceding evidence and installed
SpeedyWeather 0.23 sources without modification. Reviewer-owned scripts run
small matrices and a geometry-only diagnostic; they do not advance a native
atmospheric model. No result here clears the preceding coupled three-day water
budget gate.

## Decision

The common finite-volume mass/carrier algebra is sound **provided the persistent
face-momentum equation and the identical accepted mass fluxes are retained**.
The variable-reference pressure equation is a consistent fixed-potential linear
isothermal subsystem. It is not the native eight-layer hydrostatic thermal
semi-implicit solver.

There is a material unresolved spatial-accuracy finding in the current reduced
Gaussian pressure operator. Its nonzonal spherical-harmonic Laplacian errors
are large; conservation and a positive-definite matrix do not clear this gate.
This is independent of the accepted time/tracer algebra. See the measured
results below before accepting a physical spherical-wave claim.

## Pressure equations, signs and units

Let A be cell area in steradians, R the planetary radius, and each edge point
from i to j. The incidence matrix B has +1 at i and -1 at j. Therefore Bf is
outgoing divergence and B' p = p_i-p_j. L and d are angular lengths. For positive
fixed pref and pref_face, set r=p/pref, S=L/R and G=pref_face/(R*d).

For one layer, or the sigma-weighted barotropic mean of layer momenta:

```
A*(p_new-p_old) + dt*B*S*j_new = 0
j_new = j_old + dt*c^2*G*B'*r_new

[diag(A*pref) + dt^2*c^2*B*diag(S*G)*B']*r_new
    = A*p_old - dt*B*S*j_old
```

j has units Pa m/s; the accepted integrated edge pressure mass is
`F=dt*S*j_new` [Pa sr]. Layer k uses `F_k=ds_k*F` when momentum is uniform,
or its own persistent j_k otherwise. The pressure impulse is the same in all
layers. Since `sum(ds)=1`, the pressure solve uses `sum(ds*j_k)`.

The correction flux from i to j is positive when r_i>r_j. For constant pref
this is `dt^2*c^2*L/(R^2*d)*(p_i-p_j)`. This sign produces the positive graph
Laplacian on the left of the pressure solve.

Removing j_old from every step turns the pressure equation into an elliptic
smoothing step. It cannot demonstrate a propagating compressional wave.
Converting j to cell velocity and back also changes the momentum scheme;
persistent edge j must survive the time step and restart. Prescribed advective
flow, if added later, must be distinct from this j so continuity never counts
the same velocity twice.

The physical total mass is `R^2/g*sum(A*p)`. The global mean column mass is
`sum(A*p)/(4*pi*g)`. Omitting R^2 is correct for the latter inventory, not for
total kilograms. Water uses the same factors with W, where
`W_ik=A_i*ds_k*p_i*q_ik`.

## Variable equilibrium reference and energy

For `pref=p0*exp(-Phi/c^2)`, the continuum force is

```
j_t = -c^2*pref*grad(p/pref) = -c^2*grad(p) - p*grad(Phi).
```

This is the fixed-potential isothermal pressure/body-force subsystem. It
preserves p=alpha*pref, j=0 exactly in the discrete equations. It avoids the
uncontrolled right-hand-side contribution of subtracting an arbitrary
nonequilibrium pressure reference. All edge reference means must be positive
and used identically in the force and eliminated matrix. A different positive
mean changes truncation error but not the matrix argument.

`diag(A*pref)` is positive definite and the graph term is positive semidefinite,
so their sum is symmetric positive definite. Its nonpositive off-diagonals and
positive row sums also give an M-matrix. A nonnegative predictor RHS guarantees
nonnegative r; a strictly positive RHS guarantees positive r on every cell.

For pure pressure dynamics, define the mass-weighted constant rbar and energy

```
E = 0.5*c^2*sum_i A_i*pref_i*(r_i-rbar)^2
    + 0.5*sum_e,k ds_k*(L_e*d_e/pref_face_e)*j_ek^2.
```

Backward Euler obeys

```
E_new-E_old = -0.5*c^2*sum A*pref*(r_new-r_old)^2
              -0.5*sum ds*(L*d/pref_face)*(j_new-j_old)^2.
```

This supplies a strong independent sign, geometry-factor and momentum check.
It is a numerical energy for this reduced subsystem. It is not the energy
budget of the full moist primitive equations. Linearized physical velocity is
j/pref; using j/p as a diagnostic introduces nonlinear differences.

Positive initial p alone is insufficient. A two-cell example with A=pref=L=d=R=c=1,
initial p=(1,1), j=20 and dt=.1 has predictor (-1,3) and accepted unconstrained
solve p=(-.9607843137,2.9607843137). The matrix is still positive definite.
At dt=.025 the predictor and solved pressure are positive. Rejecting and
subdividing is appropriate, but cannot promise progress for arbitrary data:
linear acoustics itself can reach negative density at large amplitude. Record
rejections and fail explicitly at a declared minimum step rather than clamp.

## Tracer proof and sigma interfaces

Use one signed integrated air flux per face between flattened layer cells.
Orient it in its actual positive transport direction. If m_old and m_new are
positive and local continuity is satisfied, the implicit donor equation is

```
(m_new_i + sum_out F)*q_new_i - sum_in F*q_new_neighbor = m_old_i*q_old_i.
```

The matrix off-diagonals are nonpositive, and each row sum is
`m_new+out-in=m_old>0`. Thus it is strictly row diagonally dominant and has a
nonnegative inverse. Applying it to a constant proves constant-tracer
consistency; applying it to the difference from either old tracer bound proves
the maximum principle. Summing all equations cancels each shared face and
conserves total W. This argument permits arbitrary tracer face Courant number
when both endpoint air masses are positive. Large Courant number can still
cause severe mixing; stability and accuracy are separate.

For horizontal incoming mass H_ik and downward integrated vertical flux V:

```
V_top = 0
V_bottom(k) = V_top(k) + H_ik - A_i*ds_k*(p_new_i-p_old_i).
```

The independently calculated bottom value must be measured before imposing the
closed boundary. Any nonroundoff discrepancy is a failure of pressure/flux
compatibility. Using the same combined horizontal and vertical faces in the
tracer equation is sufficient; using a separately reconstructed native sigma
velocity is not. If a pressure solve has residual rho, the tracer matrix row
identity also has the associated continuity error. Report both errors rather
than describe iterative solves as exact algebra.

The distinction between conservation, constant-tracer consistency and tracer
bounds follows the separate properties described in
[Bradley, Bosler and Guba (2022), section 1.1](https://gmd.copernicus.org/articles/15/6285/2022/gmd-15-6285-2022.html).
The actual matrix and proofs above are specific derivations for this proposed
experiment, not an implementation of that paper's transport algorithm.

## Measured spatial-accuracy finding

`scheme-spatial-probe.jl` evaluates the current native-grid two-point
Laplacian against analytic spherical harmonics on the unit sphere. It reads
the geometry helper, never modifies it, and binds its source and input hashes.
The inspected helper SHA256 is
`6f725590c7b805e7fdb9d935d0bd703bc9b79d5f20c1acd442766b87d4f36dcd`.

| Field | Exact positive eigenvalue | Rayleigh value | Relative L2 operator error |
|---|---:|---:|---:|
| x=cos(lat)cos(lon) | 2 | 2.2275839454 | 0.313249902 |
| y=cos(lat)sin(lon) | 2 | 2.2275839454 | 0.313249902 |
| z=sin(lat) | 2 | 1.9991257992 | 0.002799571 |
| xy | 6 | 6.5200548667 | 0.210754861 |
| xz | 6 | 6.3738107597 | 0.165791756 |
| 3z²-1 | 6 | 5.9900373365 | 0.003920577 |

The x/y Rayleigh value implies approximately 5.54% excess wave speed for that
projection; it does not imply that x/y are exact eigenvectors of this graph.
Discrete eigenmode tests alone cannot detect this spatial error.

Across reduced-ring latitude faces the endpoint longitudes differ. Dividing
their pressure difference by latitude separation does not remove the transverse
pressure variation. A simple flat-grid counterexample uses equal row/column
spacing h with alternate rows shifted h/2. Split each north/south face equally
between the two neighboring shifted cells. The meridional two-point operator
adds one quarter of the zonal second derivative. For p=x² the full numerical
Laplacian is 2.5 instead of 2 at every h. Thus positivity, normal separation,
exact areas and refinement of an arbitrary staggered ring layout are not
sufficient proofs of spherical consistency.

This finding needs a corrected pressure gradient/divergence pair or a clearly
failed accuracy gate. Measure x/y/z and degree-two modes over actual reduced
Gaussian resolution refinements, including ring-count transitions. Preserve
these first measurements as evidence rather than overwrite them after a repair.
Transport under zonal rigid rotation exercises a different operator and does
not clear the pressure-Laplacian gate.

## Test recommendations and limits

1. Small-matrix pressure, force, local continuity, tracer bounds and energy
   checks should reach roughly 1e-12 scaled error in Float64. Native-sized
   solves should report cellwise residual normalized by local endpoint mass
   and seek at most 5e-12; a global sum alone is insufficient.
2. Constant q should stay within 5e-12 relative error against its own pressure
   mass. Test zero/maximum sharp patches and q=1 separately. Allow only measured
   floating-point roundoff in diagnostics; never modify q to pass bounds.
3. Test the exact discrete wave amplification before comparing to continuum:
   for x=omega*dt, amplitude per step is `1/sqrt(1+x²)` and phase is `atan(x)`.
   Continuum accuracy should converge at first order in time. One-period
   amplitude is only .545934 at 32 steps per period, .857249 at 128, and
   .962183 at 512. A stable 30-minute run may be strongly overdamped.
4. A physical spherical-wave acceptance needs the independent spatial tests
   above. Report errors and refinement rates separately from time error. A
   design-level target such as <1% low-mode Rayleigh error at the tested
   resolution would currently fail for x/y; do not retroactively replace that
   requirement with a discrete-mode identity.
5. Use both zonal and tilted rigid rotations for tracer accuracy. Exact
   divergence-free analytic face flux and sampled native cell winds test
   different interpolation interfaces and should be labeled separately.
6. Restart must retain authoritative p, W and every layer edge j, elapsed time,
   geometry/reference parameters and adaptive-step state. A mid-run restart
   must match an uninterrupted run. Lossy logp/q spectra stay diagnostic only.

## Native interface boundary

The installed `implicit_primitive_equations.jl:150–217` constructs the
coupled R/U/L/W divergence-temperature-log-pressure operator, including
hydrostatic vertical integration and thermal/adiabatic response. Its correction
kernel at lines 307–362 updates temperature and pressure from corrected layer
divergence. `dynamics/tendencies.jl:248` selects old spectral divergence for the
linear contribution; lines 420–424 update log-pressure and clear its zero mode.
Those equations and histories differ from this forward grid-pressure scheme.

Therefore passing this subsystem cannot authorize native pressure or humidity
writeback. Future coupling still needs baroclinic thermal response, nonlinear
momentum/advection/Coriolis, physical mass/source conventions and their time
quadrature, diffusion, and lossless restart/physics history. Native q and logp
roundtrip errors cannot silently become accepted pressure or water changes.

## Verification record

`node docs/evidence/earth-conservative-transport-20261013/scheme-analytic-tests.mjs`
completed **18 independent algebra checks**, exit 0. These cover pressure
continuity, inventory, solve residual, variable-reference rest, BE energy,
tracer row identity, sharp bounds, constant q, negative-pressure counterexample,
and exact BE amplitude. The large-circulation tracer has face Courant number
above 100 and stays in [0,.02], while visibly mixing; it is not an accuracy pass.

Results are `build/earth-conservative-transport/scheme-analytic-tests.json`
and `scheme-spatial-probe.json`. They contain the relevant input/source hashes.
The algebra test does not import the implementation and is evidence for the
equations only. The spatial probe measures the actual helper version identified
above and has no acceptance assertion that would conceal its failed accuracy.
