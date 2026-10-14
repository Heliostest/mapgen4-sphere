# C9 rotating sigma momentum under the actual-pressure kinetic metric

Base 0041b1eebc24aafdcf784fcf50afb12bbf219819. Continue the authorized
improvement sequence in an isolated candidate, preserving sealed C1-C8 and
the formal application default. C9 adds horizontal absolute-vorticity force
and vertical advection of horizontal momentum to C8 barotropic pressure work.
It does not add a prognostic vertical velocity, nonhydrostatic pressure,
temperature, latent heat or moisture sources. No full-atmosphere, climate,
exact angular momentum or potential-vorticity conservation claim is made.

## Choice and physical scope

Reusing C7's reference-metric half-divergence operator would change the
physical momentum equation under C8's actual-pressure energy. Independently
adding a vertical material tendency would break the energy cancellation.
Instead derive the layer kinetic-gradient correction and vertical flux
operator together, and combine them with a metric-adjoint vorticity force.
No final projection, global energy rescaling, clipping or hidden timesteps.

The continuum target is a barotropic sigma-coordinate momentum system:

    p_t = -sum_k ds_k div(p u_k)
    u_t,k = -grad[c2 log(p/pref)+|u_k|^2/2]
            -(zeta_k+f) xhat cross u_k - sigma_dot d_sigma u_k
    d_sigma(p sigma_dot) = -p_t-div(p u), with zero top/bottom flux.

Vertical advection is centered finite-volume differencing of horizontal
velocity. The pressure potential is a fixed barotropic background; it is
not a thermodynamic pressure/geopotential derivation. Spatial derivatives
and reconstruction inherit C3's effective two-point graph, not a primal/dual
C-grid with an exact curl-grad sequence. Discrete energy conservation alone
does not prove continuum accuracy, stability or PV/ angular momentum closure.

## Discrete derivation

Use C8's A, h, S, G, D, p, pf=S*p/2, ds and full edge velocities v. G is
the negative physical directional gradient and D=G' diag(h). K and U are
unchanged C8 energies. Let P=[E,N] be the frozen geometric nodal-to-edge
velocity interpolation, M=diag(A*p), H=diag(h*pf), and

    R(p) = diag(M^-1,M^-1) P' H
    u_k = R(p) v_k
    J(u_e,u_n) = (u_n,-u_e)
    zeta_k = A^-1 D P J u_k
    f_i = 2 omega dot x_i
    B_rot,k = P [(zeta_k+f) J u_k].

R is an actual-metric adjoint, not an inverse or a state projection. Since
the nodal mass commutes with the local skew rotation, v'H B_rot=0 for each
layer. Every imported edge component remains in the prognostic state.

Define layer kinetic derivatives and column mean:

    K_k = A^-1 S' [h .* v_k^2]/4
    Kbar = sum_k ds_k K_k
    L_k = ds_k D (pf .* v_k)
    p_t = -sum_k L_k/A
    F_0 = 0
    F_k = F_(k-1) - L_k - A ds_k p_t.

F_k is the nodal interface mass rate, positive toward increasing sigma.
The bottom value is roundoff-checked, not repaired. Interpolate its density
to each effective edge using the same kinetic-pressure derivative:

    Q_k = (h/2) .* S (F_k/A).

For each interface k between upper layer a=k and lower layer b=k+1:

    H_a V_a += Q_k .* (v_a-v_b)/2
    H_b V_b += Q_k .* (v_a-v_b)/2,
    where H_k = h .* pf .* ds_k.

These signs give centered material vertical advection. Define

    B_layer,k = G (K_k-Kbar) + V_k.

Its two parts exchange equal and opposite work. Specifically
sum_k ds_k v_k' H G(K_k-Kbar)=sum_ik L_ik(K_ik-Kbar_i),
while sum_k v_k' H_k V_k is its negative. This follows from the exact
edge metric identity Hdot_k + (h/2).*S(L_k/A) + Q_k-Q_(k-1)=0.
Thus the complete B=B_rot+B_layer is energy neutral at fixed p.
C8's G*Kbar plus the correction is the layerwise G*K_k.

## Integration and failure boundary

At fixed p solve v1-v0=tau B(p,(v0+v1)/2) by nonlinear midpoint iteration
(maximum 400). Require finite convergence, original residual <5e-12 and
kinetic energy discrepancy <1e-10 K0 plus 256 eps K0. Preserve zero states.
Reject nonconvergence; do not hide smaller integration steps.

Compose B(dt/2), C8 pressure_step(dt), B(dt/2), evaluating each B at that
substep's pressure. This is a symmetric, formally second-order composition
for p/v on the declared finite graph. C8's integrated mass flux drives the
unchanged shared sigma water FCT once. Commit p,v,W,time only after both
momentum solves, the pressure solve, water budgets, and complete energy
check pass. The complete guard is 1e-9 H0 plus
1024 eps [sqrt(Eref)*sqrt(H0)+eps Eref], Eref=c2 sum A p0.
The native accumulated relative-energy gate remains separately 1e-9.
Bounded water transport near fronts is not claimed second order.

Checkpoint version 9 binds the C8 core, interpolation, Cartesian geometry,
rotation vector and C9 scheme. No pressure-dependent factorization is reused.
The existing Julia environment and dependency versions are retained.

## Predeclared validation

1. RED tests for absent rotation/vorticity and absent layer/vertical update.
   Independent explicit-loop oracle on an irregular graph with unequal layers:
   individual work terms, exact energy cancellation, signs, nonzero vertical
   exchange, pressure-dependent reconstruction and no discarded edge modes.
2. Nonlinear midpoint and full-step residual/energy tests, forward/backward
   midpoint reversal, exact/near-rest states, invalid inputs, late failure
   literal-bit all-field rollback and rebuilt/checkpoint mismatch tests.
   Independent dense RK4 reference for the full p/v ODE, reference halving
   discrepancy <1e-10, step-halving error ratios >3.5 on the small graph.
3. Frozen 24/48/96-ring graph manufactured rotation/mixed/sheared fields,
   two oblique axes and constant/varying reference pressure. Measure full
   force, curl, vertical term and polar errors. Require global full-force
   error to decrease for each case and finest relative RMS <0.35. Report
   polar errors independently; do not infer their accuracy from energy.
   Test rigid Cartesian coordinate covariance and a vertical refinement
   sequence with a known linear sigma profile.
4. Native 3168-cell/39580-edge graph, six hours, explicit 1800/900/450/225s
   steps with physical rotation vector [0,0,7.292115e-5]. All use real
   humidity; the coarse run also uses constant and sharp fronts. Require
   no rejected steps, local air/water/dry <5e-12, global air/dry <1e-8 kg/m2,
   water <1e-9 mm, global humidity bounds within 1e-11, positive endpoints,
   relative accumulated energy drift <1e-9. Record every pressure and both
   midpoint iteration counts. Adjacent and finest-reference p/v/q differences
   must decrease. Three coarse rebuilt checkpoints must match four further
   steps literally. Report actual dynamical changes and solver residuals.
5. Bind all source closures, inputs, outputs and failed/superseded attempts.
   Verify C1-C8 unchanged, project tests/typecheck/build, independent review,
   and one-time seal. Then commit, merge and push under standing authorization.

## Method context

The momentum decomposition and sigma continuity are standard model concepts;
the effective-graph cancellation above is derived specifically for this repo.
These references motivate the form and do not validate this implementation:

- Wan et al., ICON hydrostatic core, vector-invariant horizontal momentum
  and centered vertical transport: https://gmd.copernicus.org/articles/6/735/2013/
- Spensberger et al., Bedymo sigma-coordinate model:
  https://gmd.copernicus.org/articles/15/2711/2022/
- Taylor et al., energy-consistent primitive-variable discretization:
  https://arxiv.org/abs/1908.04430
