# Independent reconstruction and variational follow-up

2026-10-13. This follow-up preserves `scheme-review.md` and every preceding
probe/result. All experiments below are geometry, small-matrix or one-period
linear-wave calculations. No installed native source, earlier frozen evidence,
or main transport-core implementation was edited.

## Recommendation

Use the variational reconstruction with **persistent quadrature momentum**
and its weighted-adjoint continuity equation for the next limited experiment.
Its smooth wave solutions and weak elliptic solutions converge under the
tested Gaussian-ring refinements. Its pressure/momentum energy identity is
exact algebraically and verified numerically. Shared positive transfer pairs
recover its continuity operator and support the existing tracer M-matrix proof.

Retain the failed pointwise-pressure-Laplacian and polar accuracy gate. This
candidate is not demonstrated pointwise consistent, and is not a full native
hydrostatic pressure/thermal fix. The positive graph refactor described below
is a separate optional factorization, not the chosen momentum/tracer scheme.

## Three candidates checked

1. **Original geographic incidence plus reconstructed pressure gradient.**
   Each meridional quadrature interpolates pressure separately within its two
   rings to the same longitude, then differences across latitude. This greatly
   improves low-mode accuracy but produces a nonsymmetric stiffness. On the
   3168-cell grid its x/y relative Laplacian error is .00524312, compared with
   .31324990 for the original two-point pressure gradient. However, its actual
   dense spectrum contains 208 nonreal eigenvalues. One pair is
   `933.8824 +/- .4016274i`; the maximum continuous acoustic growth rate is
   `.00657124*c/R`. Backward Euler at the tested nondimensional steps was
   stable, but sufficiently small steps reveal the growing semidiscrete branch.
   This is not an unconditionally stable acoustic spatial operator.
2. **Symmetric part of that stiffness.**
   `(K+K')/2` gives a positive weighted graph on the tested meshes and retains
   the Rayleigh values, but its strong x/y error increases from .0410709 at
   48 rings to .0474051 at 96 and .0520938 at 192. The maximum polar error
   approximately doubles with each refinement. Good Rayleigh values alone
   cannot justify acceptance. This candidate was not packaged for use.
3. **Variational stiffness using the reconstructed gradient.**
   Let D be the angular from-minus-to reconstructed gradient and
   `H=L*d`. Use `K=D'*diag(H*pref_face)*D`. This is symmetric positive
   semidefinite for every positive pref_face and has a clear acoustic energy
   identity. Its strong errors also fail to converge, but complete smooth
   pressure/momentum wave solutions and weak elliptic solutions do converge.
   This is the candidate packaged by the reviewer.

## Exact chosen equations and transfer units

With `r=p/pref`, positive fixed pref, physical radius R and quadrature pressure
momentum j [Pa m/s], the chosen backward-Euler pair is

```
diag(A*pref)*(r_new-r_old) + dt/R*D'*diag(H)*j_new = 0
j_new = j_old + dt*c^2/R*diag(pref_face)*D*r_new

[diag(A*pref) + dt^2*c^2/R^2*D'*diag(H*pref_face)*D]*r_new
    = A*p_old - dt/R*D'*diag(H)*j_old.
```

For multiple sigma layers, replace j in pressure continuity by `sum(ds_k*j_k)`.
The same pressure impulse acts at each level. The original geographic edge
locations remain the momentum quadrature locations, but continuity uses the
adjoint of D, not their original two-cell incidence.

The appropriate energy is

```
E = .5*c^2*sum(A*pref*(r-rbar)^2)
    + .5*sum_e,k ds_k*H_e/pref_face_e*j_ek^2.
```

The BE energy decrement equals minus one half the same squared norms of the
increments. The matrix plus `diag(A*pref)` is SPD. SPD alone does not establish
pressure positivity; the prototype must check its actual accepted pressure and
reject/subdivide invalid steps. The present meshes happen to produce an
M-matrix stiffness as well, but that is a measured property, not a general
proof for arbitrary geometry or references.

For a row of D with positive coefficients a_i and negative coefficients -b_j,
let `s=sum(a)=sum(b)`. Every positive-negative cell pair receives coefficient

```
C_ij,e = (H_e/R)*a_i*b_j/s
F_ij,e,k = dt*ds_k*C_ij,e*j_e,k.
```

These are signed pressure-mass transfers [Pa sr]. Their incidence sums to
`dt/R*D'*diag(H)*j` and supplies exactly the air flux required by the tracer
equation. The coefficient already includes 1/R; callers must not divide again.
Negative j reverses transport direction. Contributions from separate
quadratures remain separate pairs, including duplicate cell pairs. These are
shared neighborhood transfers, not a claim that every pair is a geographic
cell face.

## Smooth-wave and weak-solution evidence

The full wave tests advance both pressure perturbation and persistent
quadrature momentum for one period. They compare against the exact
backward-Euler amplitude and phase of the continuum spherical mode, so the
known BE damping is not mistaken for spatial error. Each run measures the
quarter-, half-, three-quarter- and full-period endpoints. The table is their
largest area-weighted relative pressure error at 1024 steps per period.

| Latitude rings | Cells | Degree-one x/y wave | Tilted z/x wave | Degree-two xy/xz wave | Weak Helmholtz error |
|---:|---:|---:|---:|---:|---:|
| 12 | 360 | .0137490 | .0158644 | .0622439 | .00313041 |
| 24 | 1008 | .00363811 | .00422695 | .0192205 | .000974673 |
| 48 (native) | 3168 | .00120199 | .00124092 | .00533580 | .000367168 |
| 96 | 10944 | .000577171 | .000560143 | .00121739 | .000186046 |
| 192 | 40320 | .000319794 | .000306974 | .000382978 | .0000901625 |

The weak Helmholtz test solves `(A+K)u=A*x` and compares with `x/3`.
This convergence does not depend on a wave time integrator.

Reducing the time step exposes more high-frequency spatial error. At 48 rings,
the x/y wave error is .000896229/.00120199/.00167519 with 256/1024/4096 steps.
At 96 rings it is .000451797/.000577171/.000753052. BE damping does suppress
part of the spatial error, but the 4096-step 48-to-96 refinement still reduces
error by about 2.22, supporting actual spatial solution convergence. These
finite tests are not a proof for arbitrary nonsmooth initial data or long runs.

Pure BE energy identities had relative residual at most 9.2e-16 in the initial
wave series. The independent signed pair decomposition differed from direct
adjoint divergence by at most 1.4e-16 with unit-scale R and test momentum.

## Explicit remaining strong-error failure

For the variational stiffness, sampled x/y strong Laplacian relative error at
12/24/48/96/192 rings is
`.0558388/.0685911/.0827385/.0952852/.104609`.
Maximum polar x error at 48/96/192 rings is `2.77117/5.55239/11.0956`.
Away from latitudes beyond 80 degrees the x error remains around .06 at the
finer resolutions. This is not merely a plotting artifact or one bad latitude.

The smooth solution convergence and the failed strong operator test must both
remain visible. It would be incorrect to report that this reconstruction fixed
all physical spherical pressure accuracy, or to replace the failed criterion
with a Rayleigh quotient after seeing these results.

## Actual orography reference and optional graph factorization

Using the frozen geometry's `orographyM` and
`pref=100000*exp(-9.81*h/(287.04*288))` gives pref from 60609.4408 to
101783.3200 Pa. Arithmetic and geometric original-quadrature face means both
produce **zero positive off-diagonal entries** in `D'*diag(pref_face*H)*D`.
The upper triangle has 15354 strictly negative entries. Taking their negatives
as graph conductances reconstructs the full stiffness to relative 2.20e-16.
No signed coefficient was clipped or thresholded to obtain this result.

That graph factorization would support a different persistent graph-momentum
state and graph tracer paths. Matching the pressure matrix alone does not make
its imported momentum, solenoidal components, or tracer routes identical to
the quadrature scheme. The root implementation therefore chose quadrature
momentum plus the pair decomposition above, keeping the tested wave equations
and native velocity sampling interpretation intact.

A more geometric future alternative is a surface finite-element stiffness on
an intrinsic-Delaunay triangulation, retaining the authoritative Gaussian
diagonal mass weights and re-verifying their consistency. Intrinsic Delaunay
cotangent weights give a symmetric positive-weight Laplacian; see the primary
paper [Bobenko and Springborn, A discrete Laplace–Beltrami operator for simplicial
surfaces](https://arxiv.org/abs/math/0503219). The custom Gaussian mass quadrature
would still require its own convergence assessment. No triangulation library
was installed and no claim is made that this unimplemented option passes here.

## Adapter and unit checks

`mimetic-gradient.jl` defines module `MimeticGradient`, exporting
`reconstruction_gradient(mesh)` and `pair_decomposition(D,H,R)`. It contains
ordinary static Julia source, no dynamic source evaluation and no core imports.
It rejects invalid/nonfinite weights and materially unbalanced D rows rather
than repairing coefficients.

`test-mimetic-gradient.jl` first recorded the missing-adapter RED, then completed
**24/24 checks** with the implemented adapter. Its hand-calculated fixture
`D=[.5,.5,-1], H=2, R=4` produces transfers `1->3` and `2->3`, each with
coefficient .25. It verifies both flux signs and a complete variable-reference
three-cell pressure/momentum BE energy balance.

On the native mesh the adapter returns 9352 gradient quadratures and 27330
transfer pairs. `max(abs(D*1))=3.55e-15`; the physical-radius pair/divergence
comparison differs by `1.65e-23`. The measured strong x error is retained in
the adapter test output as .0827385114, not relabeled a passing accuracy gate.
The adapter SHA256 at handoff is
`f0830bc48bced6d9f1645216dad50b946bbb0927b4a3e4a0c19d48fe10bac12c`.

Results are separately named under `build/earth-conservative-transport`:
`scheme-reconstruction-probe.json`, `scheme-symmetric-probe.json`,
`scheme-variational-probe.json`, `scheme-variational-refinement.json`,
`scheme-variable-reference-probe.json`, and `mimetic-gradient-test.json`.
Their scripts and relevant source/input hashes are preserved alongside the
first review. No preceding result was overwritten.
