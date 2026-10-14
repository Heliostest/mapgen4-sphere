# C5 rotating graph subsystem protocol

Base: 56922fa. Continue the user's approved C5 direction in a new evidence
directory; C1-C4 and the formal application default remain byte-identical.
This checkpoint adds rotation to the fixed-reference linear acoustic/shared
water system. Nonlinear momentum advection, thermodynamics, physical sources,
potential-vorticity conservation and climate acceptance are outside this gate.

## Discrete contract

Let P map reference-pressure-weighted nodal east/north velocities onto the
C4 graph; H = diag(edgeLength * distance / prefFace), and
M = diag([area * pref; area * pref]). Define R = M^-1 P' H.
R is a metric-adjoint reconstruction, NOT an inverse of P. The unresolved
edge component must never be discarded by replacing j with P R j.

For Cartesian rotation vector Omega, f_i = 2 Omega dot x_i and
J_f [u;v] = [f v; -f u]. C = P J_f R. Since M commutes with J_f,
H C is antisymmetric: j' H C j = 0 for arbitrary edge states, including
states outside the range of P. The Coriolis operator leaves ker(R) stationary;
this is a stated limitation, not preservation of continuum vorticity.
These formulas are our graph construction, not an implementation of TRiSK.
The energy-neutral operator criterion is consistent with the primary-source
discussion in https://gmd.copernicus.org/articles/13/581/2020/.

Use implicit midpoint for Coriolis, solving in nodal space by elimination:
z = (I - h R P J_f / 2)^-1 R j; j_next = j + h P J_f z.
Check the original edge midpoint residual. This conserves the graph quadratic
kinetic energy to solve roundoff. No clipping, normalization or projection.

Compose a Coriolis half-step, frozen C2 FCT/modal acoustic step, then another
half-step (Strang). Pressure and water use the same acoustic integrated mass
flux. All authoritative state fields commit only after the complete composed
step succeeds. Fixed pref/c2 and reference kinetic energy remain explicit.
This splitting is second order but need not preserve a geostrophic equilibrium
exactly at finite dt. Measure that limitation rather than hiding it.

## Acceptance fixed before implementation

1. Independent edge assembly agrees with the midpoint result to 1e-11 on a
   small graph; energy/work, spin reversal, zero-spin, layer shape, input
   immutability, invalid inputs and arbitrary edge states are exercised.
2. Analytic rotation/gradient/mixed velocities, two rotation axes, constant
   and variable pref: reconstruction and Coriolis force errors decrease on
   frozen 24/48/96-ring graphs globally and at latitudes above 75 degrees.
   Fine global relative RMS < 0.03; fine polar error / global exact RMS < 0.10.
   A solid-rotation linear geostrophic balance tendency must also converge.
3. Small graph independent dense matrix exponential of the complete linear
   rotating acoustic system: halved-step errors decrease with ratios > 3.5
   in the asymptotic regime; zero-spin reproduces frozen FCT bitwise.
4. Native one-day real humidity at 1800/900/450/225 seconds; constant/sharp q
   at 1800 s. No hidden/adaptive substeps. Local air/water/dry residual < 5e-12,
   reference energy relative drift < 1e-9, air/dry drift < 1e-8 kg/m2, water
   drift < 1e-9 mm, humidity stays in initial global range to 1e-11.
   Native adjacent state errors must decrease. Report observed time order.
   Rebuilt-core four-step restart, failed-step atomicity and identical p/j
   for different tracers are mandatory. No climate-truth claim.
5. Each run binds its actual recursive Julia source closure, runner, protocol,
   frozen input bytes and result bytes. Unique run names; retain failures.
   Current selected sources must match successful snapshots before sealing.
   npm tests, typecheck, build and C1-C4 preservation must pass.

If a numerical gate fails, retain the failed evidence and diagnose. Do not
quietly weaken acceptance or promote a partial result to full C5 dynamics.
