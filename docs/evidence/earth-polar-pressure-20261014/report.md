# C3: a spatially consistent conservative pressure graph

C3 passes the sampled strong/polar spatial-refinement gate and manufactured
shared-flux coupling checks. Its final near-neighbour weighting also avoids the
wave-accuracy regression found in the first successful spatial candidate.
This is an experimental numerical core, with no application default change,
native wind import, primitive-equation integration, or climate acceptance.

## Diagnosis

The frozen C2 pressure step already solves its fixed linear dynamics accurately.
The remaining defect is spatial. Reproducing its weighted-adjoint operator on
full and reduced Gaussian rings separates two contributions:

| Rings | Reduced-grid x strong relative L2 | Full-grid x strong relative L2 | Reduced x polar maximum |
|---:|---:|---:|---:|
| 12 | 0.05584 | 0.007780 | 0.6242 |
| 24 | 0.06859 | 0.002117 | 1.3620 |
| 48 | 0.08274 | 0.0005672 | 2.7712 |
| 96 | 0.09529 | 0.0001501 | 5.5524 |

Removing reduced-ring interpolation restores x convergence, but the full-grid
z polar maximum still approaches 0.0567. Thus changing interpolation alone is
insufficient; the polar band metric also requires consistency work. The original
Gaussian areas and ordering remain unchanged throughout this experiment.

## Final construction

`fit-graph-v4.py`, with `POLAR_NEIGHBOURS=24` and `POLAR_KERNEL=24`, builds a
symmetric union of nearest-neighbour edges on the sphere. An undirected edge has
one nonnegative conductance. Fitted moments reproduce Cartesian degree-one
fields and tangent-plane isotropy. A finite ridge approximates the equality
projection in the relative-weight metric; negative-edge elimination is a
feasibility heuristic, not a constrained-optimality claim.

The initial weights and correction metric penalize long edges. This matters:
the wider v3 graph passed spatial convergence and conservation but made l2/l3
wave errors about 2.5 times worse. The final metric reduces this dispersion.

For incidence B, the stiffness is B diag(w) Bᵀ. Nonnegative weights and measured
connectedness give the constant nullspace and positive energy. With reference
pressure, edge conductance uses the arithmetic endpoint mean. The independent
variable-coefficient test uses the analytic -div((1+0.2z) grad P_l(axis·x)).
Effective edge length is w times great-circle distance; these are graph metrics,
not geographic faces. Their momentum degrees of freedom differ from C2.

## Independent spatial audit

`c3-spatial-near-audit-v1` passes 45 structural/coordinate checks and all 55
refinement cases: five axes, degrees 1–6, constant and variable reference
pressure, excluding trained constant-coefficient degree-one modes from the rate
test. Both area-weighted L2 and polar (>75°) maxima decrease at 24→48→96 rings.

| Rings | Tilted l2 strong relative L2 | Tilted l2 polar maximum | Fitted coordinate maximum |
|---:|---:|---:|---:|
| 24 | 0.005629 | 0.07685 | 2.91e-9 |
| 48 | 0.001529 | 0.03839 | 1.25e-8 |
| 96 | 0.0004696 | 0.01900 | 3.87e-7 |

The fitted coordinate residual increases with resolution because the numerical
fit is approximate. All tested resolutions meet the declared 1e-6 tolerance;
this does not establish unlimited refinement convergence. Final positive edge
counts are 12,612 / 39,580 / 132,948. Preparation took approximately 1 / 15 / 274
seconds on this machine; no production scalability claim is made.

## Pressure waves and shared water transport

`c3-coupled-near-v1` passes 147 tests on the native 3,168-cell, 48-ring ordering.
Continuum wave comparisons sample eight phases over one period for three fields:

| Field | C2 global wave error | C3 global wave error | C2 polar maximum | C3 polar maximum |
|---|---:|---:|---:|---:|
| Tilted l1 | 6.749e-4 | 6.711e-9 | 8.538e-4 | 6.256e-9 |
| l2 | 0.0035612 | 0.0032564 | 7.859e-4 | 1.714e-4 |
| Tilted l3 | 0.0085585 | 0.0081790 | 0.0039263 | 0.0038381 |

All six sampled metrics improve. This is a three-field, eight-phase comparison,
not a general nonregression theorem.

Two 64-step, three-layer coupled cases use unequal manufactured layer momenta,
which produce nonzero vertical transfers. One has constant humidity; the other
has different sharp humidity boundaries in each layer. They share the exact
same pressure trajectory. Maximum local air/water/dry relative residual is
7.15e-16; water drift magnitude is at most 1.12e-16; constant-q error is 1.57e-16.
Sharp q stays within [0,0.02] to 7.1e-16 roundoff. Relative energy error is
2.01e-14. Repeated pressure stepping agrees with a single exact discrete flow
to 1.12e-15. Rebuilt-core checkpoint recovery is bitwise equal after one resumed
step. Variable-reference-pressure equilibrium is also tested.

## Evidence and failed candidates

- `baseline.jl`: 17 checks, including the reproduced old defect.
- `fit-graph.py`: bounded least-squares iteration limits caused inaccurate fine
  fits; rejected. Its 96-ring continuation was deliberately terminated after
  smaller cases had already failed, and its failed status/log are retained.
- `fit-graph-v2.py`: iterative equality refits improved geometry, but coordinate
  fit error grew. Its internal `spatialCandidateAccepted` flag was preliminary
  and is superseded by the independent coordinate-tolerance audit.
- `fit-graph-v3.py`: independent spatial audit and 145 coupled checks passed,
  but the measured wave regression prevents replacement acceptance.
- `fit-graph-v4.py`, kernel 18: native-grid screening only; not the final gate.
- `fit-graph-v4.py`, kernel 24: selected complete refinement and coupling runs.

Source snapshots, declared input hashes, output hashes for the final runs, and
the selected NPZ→audit JSON→coupled graph SHA chain are retained. `raw/` holds
portable copies of raw outputs, logs, statuses, graphs, and checkpoints. Julia
Project/Manifest inputs are bound. NumPy 2.5.4 and SciPy 1.18.1 versions are
recorded, but Python/BLAS executable binaries are not pinned. Runner input
hashing depends on explicitly declaring `POLAR_INPUT_FILES`; the selected runs
declare every external artifact they consume.

The previous C2 manifest and all 148 of its bindings must remain byte-identical
when sealing. Independent review found no blocking numerical or provenance
defect; its wave-regression finding drove the final near-neighbour metric.

## Remaining integration work

Native winds cannot be copied into the new graph momentum array. Next define
and validate an explicit import that preserves the required divergence and
solenoidal content, then re-run native-state temporal refinement, restart and
tracer-rotation accuracy. Full momentum, Coriolis, thermodynamics, physical
sources, and long climate validation remain outside C3. Dense modal preparation
also remains an experimental implementation limitation.
