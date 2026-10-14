# Independent C9 review

Completed: true. Actionable findings remaining: 0. The reviewed candidate is
ready for its one-time evidence seal and the authorized integration checks.
This verdict applies to the exact bytes in review-source-bindings.json, on
codex/rotating-sigma-momentum from base
0041b1eebc24aafdcf784fcf50afb12bbf219819. It does not certify later edits or
make a full-atmosphere, general stability, PV or angular-momentum claim.

## Mathematical and implementation assessment

The actual-pressure reconstruction is consistent with the declared kinetic
metric: R(p)=M(p)^-1 P' H(p), including both east and north components.
Reference pressure does not enter the neutral force. The independent tests
change reference pressure at fixed physical state and scale actual pressure,
confirming the expected invariances. No inverse reconstruction or projection
replaces the full prognostic edge velocity.

The sign convention is coherent. G is the negative directional gradient;
D is outward divergence. In Cartesian coordinates J u=-x cross u, so
D P J u gives positive relative vorticity and (zeta+f) J u gives the required
negative cross-product force. The nodal mass commutes with this local skew
map. Rotation and relative-vorticity work vanish individually in the actual
edge metric. Independent Cartesian calculations, edge-orientation reversal,
and the supplied rigid-rotation tests support these identities.

The layer correction and vertical material tendency are correctly paired.
Sigma continuity gives F_k-F_(k-1)=-L_k-A ds_k p_t. The interface interpolation
Q=(h/2) S(F/A) is the same pressure derivative used by kinetic energy. The
vertical work is sum(F_k*(K_k-K_(k+1))); summation by parts makes it the
negative of sum(L_k*(K_k-Kbar)). The two adjacent layer tendencies therefore
have the same signed interface increment, with their own ds denominators.
Changing that to an individually skew vertical operator would remove the
physical material-advection contribution. Unequal-layer tests show nonzero
opposing work, correct weights, and invariance under reversing layer order.

The complete p/v right-hand side agrees with a separately written Cartesian
oracle. The pressure substep's column kinetic gradient and the neutral
layer-minus-column correction recover the layerwise Bernoulli gradient.
The manufactured continuum formula was also checked directly for its curl,
Coriolis, pressure, kinetic and sigma-continuity signs. The degree3 paired
audit uses the same fields and norms as C8's corresponding benchmark.

Nonlinear midpoint iteration rejects nonconvergence and checks the original
equation and energy before acceptance. Pressure is fixed in each neutral
substep and updated between the two half steps. Only the C8 integrated flux
drives the unchanged shared water FCT. All authoritative state assignments
occur after the last solver and complete energy guard. Invalid inputs,
early failures and failures after genuine late solver work preserve all four
fields literally. Version9 checkpoint identity covers the fixed geometric,
rotation and inherited pressure-core inputs, and rebuilt restarts match.

## Independent numerical evidence

The review used a new eight-node, 28-edge irregular spherical graph with four
unequal layers and a Cartesian tangent reconstruction. It did not include
dense-reference.jl or call the candidate tendency in its oracle. The first
run passed 164 assertions: 117 RHS/metric/orientation/invariance checks,
8 RK4/midpoint checks and 39 rest/invalid/checkpoint/rollback checks.
Across pressure factors .01, 1 and 97 and three velocity amplitudes, maximum
absolute RHS disagreement was 8.89e-16. The independent RK4 reference halving
gap was 8.06e-15. Candidate errors at .06/.03/.015/.0075 were
1.89188e-4, 4.73246e-5, 1.18329e-5 and 2.95833e-6, approaching a ratio of four.
Maximum full-integration relative energy discrepancy in that sequence was
8.88e-16. Near-rest coverage extends to velocity amplitude 1e-100.

A second independent process passed 72 assertions covering humidity 0,
.015 and 1. Each invokes the genuine water or second momentum solve before
injecting six throw, nonfinite, negative-budget or excessive-energy faults.
Recorded call counts establish that the intended late phase was reached;
p, v, W and time retain identical bits in all 18 cases. Total independent
numerical assertions: 236. Both runs bind their scripts and source closures
before and after execution, logs and outputs. No independent test failed.

## Final evidence and reporting audit

The independent audit passed over all 13 candidate attempts: 148 source,
190 input and 33 output binding occurrences, including the two intentional
RED failures and superseded vector source. All ten selected source closures
match the reviewed current code. Native trace checks cover all six cases
and every explicit step; temporal comparisons bind all four native JSON and
serialized final-state inputs. C1-C8 evidence and formal defaults pass their
preservation checks, including direct C4-C8 manifest/binding verification.

The six native cases complete six hours without rejected steps. Maximum
accumulated energy drift is 3.13767e-15 and maximum local air/water/dry
relative residual is 5.89651e-15. The three coarse rebuilt checkpoints each
match four subsequent steps literally. Pressure, velocity and humidity
differences decrease at every refinement. Coarse pressure/velocity ratios
2.90/2.99 increase to 3.68/3.64; the report correctly treats 225 seconds as a
discrete reference and avoids claiming the coarse native run is asymptotic.
The selected suites total 315 numerical assertions, source-binding tests 7,
and the application logs show 278 tests, type checking and build passing.

The final report, README, continuation state, plan, sealer and plot source
were read. The corrected convergence image was visually inspected, and its
source/input/output hashes checked. The sealer checks all original traces,
current selected closures, failed-source archives, review bindings and
ancestor preservation before creating a new manifest; it then binds every
raw log and artifact. The verifier can check both filesystem and Git bytes.
Sealing and post-merge checks themselves remain integration actions after
this review, not measurements claimed as already performed here.

## Resolved review notes and limitations

The report now explicitly restricts vertical spatial-order evidence to
uniform layer thicknesses. Arithmetic interface averaging preserves the
unequal-layer energy algebra but is not exact for a linear sigma profile
on arbitrary nonuniform layers. Unequal-layer conservation tests do not
establish a general nonuniform-grid accuracy result.

The degree3 potential-flow audit is correctly distinguished from the easier
primary rotation/mixed/shear fields. About 12.3% normalized polar force error
remains; nonzero weak curl partly compensates another spatial error. This
is not an exact curl-grad sequence or a solved polar metric problem. Exact
PV/angular momentum, thermodynamic closure, prognostic vertical velocity,
sharp-front second-order transport and long-climate acceptance remain outside
scope. The plot's overlapping minor tick labels were corrected and rechecked.
No implementation correction was required by this review, and no actionable
finding remains within the declared C9 scope.

Review artifacts are frozen in build/c9-independent-review. Copies for the
sealed evidence must preserve these bytes and original execution paths.
