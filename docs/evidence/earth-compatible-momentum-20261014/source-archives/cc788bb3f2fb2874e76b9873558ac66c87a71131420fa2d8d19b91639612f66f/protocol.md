# C7 fixed-reference compatible momentum coupling

Base b8c0fce; branch codex/compatible-momentum-coupling. Preserve all C1-C6
sealed bytes, native sources and the formal default. This experiment adds a
nonlinear, reference-energy-compatible split transport term to C5. It reuses
C6 spherical connections and shared horizontal/vertical air transfers; it
does NOT claim to reproduce C6's actual-mass conservative momentum update.
Full compressible momentum, thermodynamics, PV/angular momentum and climate
acceptance remain open. In particular the half-divergence term below is part
of the declared equation, not a disguised physical momentum correction.

## Design and alternatives

Direct replacement j=P R j loses edge modes (measured in C6). A right-inverse
lift preserves reconstruction but changes its induced energy metric; C6's
actual-mass energy theorem then does not establish C5 energy stability.
Choose incremental metric-adjoint coupling and keep the C5 metric explicitly.

For all layers, H=edgeLength*distance/prefFace*ds, M=area*pref*ds and
R=M^-1 P' H. For signed integrated transfer F, orient donor a -> receiver b,
f=abs(F), with the C6 connection T_ab. Define nodal integrated operator N by

    (N u)_a += -f/2 u_a
    (N u)_b += f T_ab u_a - f/2 u_b.

Equivalently N=C - diag(netMass)/2, with C the conservative donor momentum
operator. Thus u' N u = -1/2 sum f |u_b-T_ab u_a|². This reference-metric
split form differs from C6's actual-mass velocity equation. Its smooth,
single-layer limit at j=P U is -nabla_U U - (div(pref U)/(2 pref)) U.

Lift the increment: j_new=j_old+P M^-1 N R j_mid, j_mid=(j_old+j_new)/2.
Then deltaK=-1/2 sum f |(R j_mid)_b-T_ab(R j_mid)_a|², with K=j'Hj/2.
Every increment is in range(P), so the H-orthogonal ker(R) component is
preserved. Never project the authoritative state onto range(P). Solve the
reduced midpoint equation by matrix-free fixed-point iteration, checking the
original edge equation. Reject nonconvergence atomically; no hidden substeps,
clipping, post-update normalization or global inventory repair.

## Coupled step

Use C5 rotation half-step, exact fixed-reference acoustic step (including
its pressure positivity certificate and integrated j), shared water FCT,
second rotation half-step, then the compatible midpoint transport increment
using those SAME horizontal/sigma-vertical air transfers. All state fields
commit only after success. This is first-order nonlinear Lie composition;
C5's linear Strang portion remains second-order. Strength in [0,1] is an
explicit core/identity parameter; native acceptance uses 1. Strength 0 must
reproduce the frozen C5 step exactly, and is only a regression endpoint.
Reference potential plus edge kinetic energy loses exactly the measured
transport dissipation up to linear-solver roundoff. This is not a claim
about nonlinear physical total energy.

## Predeclared gates

1. Independent dense edge midpoint solve and Cartesian Rodrigues connection;
   mixed transfer signs, two layers, unequal sigma thickness, reverse edge
   orientation, zero flux and rigid-frame covariance. Relative equation,
   energy and preserved-kernel residual <5e-12. K cannot increase beyond
   1e-11 roundoff. Retain intentionally failing no-op tests.
2. 24/48/96-ring frozen graphs, two axes, rotation/gradient3/mixed fields,
   constant/varying reference pressure. Edge-metric RMS error versus analytic
   split-form tendency decreases globally and in polar-edge subset; finest
   global relative RMS <0.35. No exact physical advective-tendency claim.
3. Small-grid atomicity, invalid inputs, late-transport failure rollback,
   exact strength-zero C5 compatibility, rest state, identity mismatch and
   four-step rebuilt restart. Compare the full nonlinear p/j ODE to an
   independent dense/RK4 reference, require successive time errors to decrease
   with ratios >1.7 on a declared fixed duration.
4. Native six hours, dt1800/900/450/225 seconds with real humidity; constant
   and sharp humidity additionally at1800. Explicit12/24/48/96 steps, no hidden
   integration substeps. Air/water/dry local residual<5e-12; total air/dry
   drift<1e-8 kg/m² and water<1e-9mm. Humidity stays in initial global range.
   Per-step transport equation/energy residual<5e-12 and accumulated complete
   reference-energy balance<1e-9. Native final p/j/q temporal differences
   decrease; report observed ratios. Rebuild all3 coarse checkpoints and
   verify four subsequent steps with literal UInt64 equality. Record positivity
   certificates, no zero-coefficient substitute, and effect versus C5 baseline.
5. Unique names, retained failures, source closure/input/output SHA bindings,
   selected-to-current verification, independent review, project tests,
   typecheck/build and preservation of C1-C6 before one-time sealing.
