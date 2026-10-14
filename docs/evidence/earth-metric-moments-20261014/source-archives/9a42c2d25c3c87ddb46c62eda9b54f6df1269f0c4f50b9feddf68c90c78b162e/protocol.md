# C10: positive graph-metric third-moment refinement

Base a3a6934b6c9135ddfd912b86197f54026b615e05. This isolated candidate
addresses C9's kinetic-sampling polar defect. Preserve sealed C1-C9 and the
formal application default. Reuse the exact C8/C9 dynamical sources; change
only the fixed effective-graph conductances, retaining every original edge,
coordinate, area and ordering. This is not a geographic-face mesh or a new
thermodynamic model.

## Diagnosis and design choice

The 96-ring degree3 potential-flow diagnostic separates normalized polar
force errors: pressure gradient 1.26e-5, gradient of exact kinetic potential
0.00391, gradient of sampled-minus-exact kinetic potential 0.13511. Weak-curl
force partly compensates the last contribution. The dominant target is the
spatial sampling metric, not removal of vorticity dynamics.

Exploration used the 24-ring grid. Hard first/second/third-moment fitting
with negative-edge elimination lost low-order consistency and worsened the
force. Soft third-moment penalty 1 preserved positivity but improved little;
penalty 0.01 gave a useful coarse improvement. These are exploratory results,
not predeclared validation. A 48-ring exploratory fit was generated but no
force results were inspected before freezing this design. All exploratory
scripts and outputs are retained. Final validation uses a positive lower
bound instead of deleting edges and always compares forces with the SAME
original edge weights to avoid changing the error norm with the candidate.

For edge conductance w and each endpoint i, let u,v be the other endpoint's
Cartesian tangent components divided by sqrt(A_i), and r=(1-x_i dot x_j)/A_i.
Use low-order rows (u,v,r,(u^2-v^2)/sqrt(2),sqrt(2)uv), target (0,0,2,0,0),
and cubic tensor rows (u^3,sqrt(3)u^2v,sqrt(3)uv^2,v^3), target zero. The tensor
weights make their squared residual invariant under orthogonal tangent-basis
changes. Gaussian areas remain fixed.

The fixed objective is relative-weight correction plus cubic-moment penalty:

    1/2 ||(w-w0)/w0||^2 + 1/(2 lambda) ||C3 w||^2,
    C0 w = target0, w >= 0.01 w0, lambda = 0.01.

A ridge-regularized dual solve enforces the low-order conditions to measured
tolerance. The ridge is 1e-14 times mean diagonal of the scaled normal matrix.
Pin violating weights to their positive lower bound and refit remaining
weights, for at most 30 solves. This one-way active-set procedure is a
feasibility heuristic, not a certificate of the constrained optimum. Do not
clip the final metric or state; reject nonfinite outputs, unsatisfied bounds
or low-order residual above 1e-7. Report the full history and cubic residual.
Runtime states and velocities are not projected or rescaled.

All C9 energy/air/water cancellations still use the same new h=w*d^2
consistently through Geometry/TransportCore/PressureWorkCore/VectorCore.
Checkpoint version9 remains valid: its existing identity includes the entire
new metric, and must reject a checkpoint built with the old metric.

## Frozen validation criteria

1. A no-op metric fitter must fail a test requiring a 20% reduction of the
   cubic-moment norm on the 24-ring fixture. Verify finite positive bounds,
   exact topology/coordinates/areas, low-order residual <1e-7, deterministic
   reconstruction, Cartesian rotation covariance, malformed input rejection
   and explicit exhaustion rejection. Archive RED and final source bytes.
2. Fit 24/48/96 graphs with lambda and floor fixed above. Compare C9 and C10
   full forces on identical edge samples and the ORIGINAL h metric. Repeat
   degree3 with both original axes and constant/varying pref. Require each
   finest polar error <=80% of its C9 pair and worst <=0.09; global error
   must not increase, and every candidate sequence must decrease. Report
   pressure, sampled kinetic and weak-curl contributions separately.
3. Recheck C9 rotation/mixed/sheared matrix, plus held-out harmonic degrees
   2/4/5 and an additional oblique axis. Report every field, including any
   regressions. Do not claim universal spatial improvement. Check scalar
   Laplacian/wave-dispersion proxies so kinetic gains cannot hide a severe
   pressure-operator regression; worst degree2-5 relative global error on
   each grid must be <=1.10 times the original worst error.
4. Reuse exact frozen C9 dynamics on new native metric: six hours at
   1800/900/450/225 seconds, real humidity everywhere; coarse constant/sharp
   cases and three rebuilt checkpoints with four literal-bit further steps.
   All original local <5e-12, global air/dry <1e-8 kg/m2, water <1e-9 mm,
   humidity bound tolerance 1e-11, positive pressure, energy drift <1e-9 and
   no rejected/hidden steps gates remain. Record every original solver trace.
   Adjacent and finest-reference p/v/q differences must decrease.
5. Verify inherited core hashes, unchanged ancestors/default, project tests,
   typecheck/build, fresh independent review and one-time evidence seal before
   authorized commit/merge/push. New source changes invalidate selected runs.

The application remains on its existing default. Equal-layer vertical order
from C9 is not generalized to unequal layers. No exact curl-grad, PV/angular
momentum, general stability or climate claim is added. Graph-moment fitting
is specific to this repository, not a validation inferred from literature.

Background on accuracy versus mimetic properties on nonorthogonal grids:
https://gmd.copernicus.org/articles/7/779/2014/gmd-7-779-2014.html

