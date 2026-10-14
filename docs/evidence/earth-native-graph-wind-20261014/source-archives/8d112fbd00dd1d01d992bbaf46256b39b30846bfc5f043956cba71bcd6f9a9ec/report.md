# C4: native winds on the conservative C3 pressure graph

Draft while the finest native integrations finish. Final temporal acceptance
and evidence sealing are pending; do not treat this draft as an acceptance.

## What is imported and preserved

`graph-wind.jl` imports all frozen native east/north wind samples into the
39,580 effective C3 edges without copying the old geographic-face momentum.
For edge i -> j, angular great-circle distance d and Cartesian unit position x,

    j = (p_i U_i + p_j U_j) dot (x_j-x_i) / (2d).

Here p is the actual initial surface pressure, U is tangent velocity in m/s,
and j has units Pa m/s. The shared pressure flux is w d j/R. Reference pressure
pref belongs to the acoustic force and kinetic metric, not the initial p U
sampling. The unchanged original Gaussian area and sigma thickness enter the
frozen core; ds is applied exactly once in shared transport.

The preserved divergence is the Gaussian-area weak divergence of a stated
nodal graph gradient (see protocol), not a separate native spectral divergence.
Every u/v sample contributes; there is no spectral truncation. The diagnostic
Hodge split uses H=w d²/prefFace and a pinned potential gauge. Both its divergent
and graph-solenoidal components remain in the authoritative imported j.
No RHS mean subtraction, global mass repair or humidity clipping is applied.

On the frozen native import, the solenoidal norm fraction is 0.9993508 and the
divergent norm fraction 0.0360272 (norm fractions, not additive energy fractions).
The normalized Hodge divergence residual is 1.79e-15 and kinetic cross term
2.82e-19. Thus a pressure-potential-only import would discard most native flow.
Graph cycle content is not identical to continuum vorticity.

## Analytic vector verification

The import contract has 18 checks, with another 8 for frame covariance,
immutable inputs and invalid Hodge inputs. Rotating both the global Cartesian
frame and tangent components leaves the imported graph momentum unchanged to
the tested tolerance. Edge reversal preserves physical divergence; unequal
layers, physical radius, varying p and a different pref exercise scaling.

`c4-analytic-v1` passes 234 checks on 60 cases: two axes, 24/48/96 rings,
constant/variable pressure, rigid rotation, degree 1/2/3 gradients and mixed flow.
All nonzero-divergence cases decrease in global RMS and polar (>75°) maximum.
Constant-pressure rotations stay below 1e-6 absolute divergence on the unit
sphere. Their tiny residual is inherited from the approximate C3 coordinate
fit and grows on the finest grid; it is not an unlimited-convergence claim.

| First-axis field | 24-ring relative divergence L2 | 48-ring | 96-ring |
|---|---:|---:|---:|
| Gradient l1 | 0.005392 | 0.001465 | 0.000441 |
| Gradient l2 | 0.016034 | 0.004405 | 0.001303 |
| Gradient l3 | 0.031419 | 0.008683 | 0.002537 |
| Variable-pressure rotation | 0.006246 | 0.001705 | 0.000506 |

Gradient leakage into graph cycles decreases at every refinement for all six
constant-pressure gradient cases. The largest 96-ring leakage norm fraction is
0.000815. This quantifies the approximation rather than claiming exact
continuum-gradient/continuum-vorticity preservation.

## Native one-day coupling and time refinement

The immutable native binary contains pressure [3168], humidity [3168,8], u/v
[3168,8], reference pressure [3168] and ds [8]. Its `water` field is specific
humidity, not the core's extensive W. Native c² is exactly 82671.64740772452.
All runs call `step!` once per declared interval, without adaptive advance or
hidden integration steps. Positivity certificate subdivisions only bound the
exact acoustic solution; they do not integrate substeps.

At 1800 seconds, real/constant/sharp humidity all pass 48 explicit steps.
Their pressure and momentum trajectories are bitwise identical. Unequal native
layer winds produce nonzero vertical exchange. Rebuilding the modal/core from
the frozen inputs and resuming each checkpoint is bitwise identical for four
consecutive steps. Deliberately excessive momentum rejects a step without
changing any authoritative state field.

Maximum local air/water/dry relative residual at 1800 seconds is 1.02e-14.
Constant-q error is 1.50e-16. Sharp q stays in [0,0.02] to 1.5e-15 roundoff.
Pressure error against a separately assembled/evaluated acoustic operator is
4.04e-10 Pa and reference-pressure velocity-equivalent momentum error is
1.61e-12 m/s. Finer native-step results and humidity convergence: pending.

## Imported-wind rotation

`c4-rotation-v1` passes 36 checks using axial and polar-crossing rigid winds,
and a smooth tracer containing degree-one and degree-three content. Eight
phases over a complete orbit are compared against the analytic rotated field.

| Axis | 24-ring maximum phase L2 | 48-ring | 96-ring | 96-ring polar maximum |
|---|---:|---:|---:|---:|
| Axial | 0.211294 | 0.059047 | 0.017102 | 0.001797 |
| Polar-crossing | 0.215902 | 0.060676 | 0.017196 | 0.012453 |

Global error is normalized by initial tracer anomaly RMS; polar error by the
0.007 amplitude bound. Resolution and explicit time-step count increase together
(192/384/768 steps), so this is combined refinement, not an isolated spatial
order estimate. Every global and polar sequence decreases.

The raw import's finite coordinate-fit divergence is retained: air evolves with
the same prescribed flux used by water. Maximum full-orbit relative air change
is 2.26e-6, rather than forcing a zero-divergence flow. This is a prescribed-flux
tracer test, separate from the native acoustic coupling. It does not synthesize
the momentum/Coriolis forcing required to sustain physical rigid rotation.

## Provenance, failures and limits

C1's 222 frozen bindings, C2's 148, C3's 93 and 105 original native source files
were verified unchanged. C3's manifest SHA remains
`cb95e9a55efac60795367edebe119e601bc984d941c2f7b76f595f483070eb8e`.
The selected NPZ -> independent C3 audit -> exported/native graph -> C4 input
SHA chain is retained. Every runner attempt has a unique name and source,
input, output, log and status evidence. Portable native inputs and raw results
are included at sealing. Julia project manifests are bound; executable Python,
Julia and BLAS binaries are not bundled or pinned by content hash.

Failed attempts are retained: the deliberate zero-import RED test; an overly
relative weak-identity test whose nearly zero integral exposed cancellation
(replaced by a nonzero fixture and absolute-contribution scale); two native
driver startup errors (a parenthesis typo and shadowed Base.split); and the
deliberately incomplete source-binding validator. The successful native driver
changed no numerical algorithm to repair its startup errors.

Independent review found no numerical blocker and one sealing provenance gap.
The sealer now requires selected scripts, include closures and runner to match
their successful source snapshots; five regression checks prove rejection of
stale or unbound code. See code-review.md. Project npm test: 278 passed;
typecheck and build passed.

This remains a fixed-reference linear acoustic and water-transport experiment.
No full momentum, Coriolis, thermodynamic or physical source integration, long
climate validation, native spectral divergence identity or formal default
promotion is claimed. Native input is one largely zonal initial state; the
analytic suite does not establish accuracy for all vector spectra or fronts.
Dense modal preparation and sparse tracer LU remain scalability limitations.
