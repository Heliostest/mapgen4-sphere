# C6 covariant momentum transport protocol

Base 1fa1cd0, branch codex/covariant-momentum-transport. C1-C5 and application
defaults stay byte-identical. This stage supplies a nodal tangent-velocity
transport kernel plus an isolated nonlinear pressureless self-advection model.
It does not silently lift nodal velocities back into C5 authoritative edges:
C5 R is not an inverse of P. Full acoustic/Coriolis/thermodynamic coupling,
exact global angular momentum/PV conservation and climate acceptance remain open.

## Geometry and local balance

For unit sphere positions x and y, transport tangent v along the unique short
great circle by T(v)=v-(v dot y)(x+y)/(1+x dot y). Use two-component orthonormal
east/north bases, with transpose for reverse transfers. Coincident positions
cover same-column vertical transfers; near-antipodal links must be rejected.
The closed-form sphere connection is documented in the primary library source:
https://juliamanifolds.github.io/Manifolds.jl/stable/manifolds/sphere/.
No radial projection or post-update speed normalization is permitted.

Given shared signed integrated air transfers F, positive old/new masses obeying
local continuity, solve implicit donor momentum in each receiving tangent space:
(m_new + outgoing) u_new - sum incoming |F| T u_donor_new = m_old u_old.
The two velocity components are signed quantities, not humidity fractions.
Block Jacobi is a contraction with row bound incoming/(m_old+incoming)<1;
accept only after checking the original local momentum equation.

K = 1/2 sum m |u|² must obey the independently evaluated identity
K_new-K_old = -1/2 sum m_old |u_new-u_old|²
             -1/2 sum |F| |u_receiver_new-T u_donor_new|².
This is controlled upwind/time dissipation, NOT exact kinetic-energy preservation.
Transported local momentum closes, while exact global Cartesian or angular
momentum conservation is not implied by a curved-surface connection.

## Isolated nonlinear step

Compute graph normal velocities with C4 geometry, use donor surface pressure
for the directed horizontal air flux, update total pressure by that SAME flux,
then use frozen C2 shared_transfers for sigma-layer vertical closure. Apply
the momentum kernel and frozen water FCT to exactly the same old/new masses
and horizontal/vertical transfers. Commit pressure, water, velocity and time
only after both transport solves succeed. No pressure force, Coriolis, thermal
sources, hidden substeps, mass repair, clipping or velocity repair.
This is a first-order baseline; do not call it C5's second-order full dynamics.

## Predeclared gates

1. A hand-computable two-level exchange and independent dense block solution
   verify signs, unequal masses, signed velocities, both flux orientations,
   zero flux, geometry/covariance, immutable inputs and invalid-input rejection.
   Local mass/momentum and energy-identity relative residual < 5e-12;
   kinetic energy and maximum speed cannot increase beyond 1e-11 roundoff.
2. 24/48/96-ring C3 grids, two axes, rotation/gradient/mixed velocities,
   constant and varying pressure. Instantaneous nonlinear velocity tendency
   versus analytic covariant derivative: global and polar errors decrease;
   96-ring global relative RMS < 0.35. This donor baseline is diffusive.
   Report angular-momentum torque error, do not claim exact conservation.
3. Isolated native 6-hour runs at 1800/900/450/225s, real q; constant/sharp q
   at 1800s. All have explicit step counts, positive pressure, global humidity
   range, shared air/water/dry local residual < 5e-12, air/dry drift < 1e-8
   kg/m² and water drift < 1e-9 mm. Momentum/energy identity < 5e-12; K does
   not increase. Adjacent p/u/q errors decrease; report observed time order.
   Rebuilt-core four-step restart and all-state rollback are mandatory.
4. Quantify C5 P R feedback error on arbitrary and native edge states. Do not
   add an unvalidated feedback path or discard the unrepresented component.
5. Unique run names, retained failures, actual source closure and input/output
   SHA bindings, selected-to-current source verification, project tests,
   typecheck/build and frozen C1-C5 checks before sealing.
