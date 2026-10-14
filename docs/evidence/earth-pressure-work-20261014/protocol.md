# C8 pressure-dependent kinetic metric and barotropic pressure work

Base 6a7589687ec075cde17d7d79ef622f96c5520378. Continue the authorized
experimental sequence on codex/pressure-work-discrete-gradient, preserving
every sealed C1-C7 byte and the application default. This is an isolated
pressure-work subsystem, not a replacement for C7's complete split sequence.
It has no Coriolis, vortical momentum transport, thermodynamic temperature,
phase change or climate acceptance. Native winds retain all edge components;
their vortical component is not transported by the missing vorticity term.

## Design and alternatives

Keeping C5 acoustics while changing its kinetic metric does not preserve the
new energy. A global energy rescaling would conceal the missing pressure work.
Instead derive both mass flux and Bernoulli force from one discrete energy,
then use a symmetric discrete gradient to preserve its chain rule.

Let A be cell solid angle, h=edgeLength*centerDistance, ds layer thickness,
G the frozen signed two-point gradient and D=G' diag(h) its divergence.
S is the unsigned edge incidence (two ones per edge). Store pressure p,
all edge velocities v, water inventory W and time. pf=S p/2 is the actual
face pressure and j=pf v. Converting imported j to v is pointwise and
invertible; no reconstruction or range projection removes edge modes.

    K(p,v) = sum_e,k h_e ds_k pf_e v_e,k^2 / 2
    U(p)   = c2 sum_i A_i [p_i log(p_i/pref_i)-p_i+pref_i]
    H      = K+U
    mu     = c2 log(p/pref) + S' [h .* (v.^2 ds)] ./ (4 A)
    pdot   = -D [pf .* (v ds)] ./ A
    vdot   = G mu, identical forcing in every layer.

The kinetic derivative in mu is required because pf changes with p. This is
the finite graph Bernoulli/continuity subsystem. In one-layer smooth potential
flow, the intended limit is -grad(c2 log(p/pref)+|v|^2/2): G approximates
the negative physical directional gradient under the frozen incidence sign.
For general vortical flow it lacks the vorticity force. Sigma redistribution
closes column mass and transports water but does not add vertical momentum
advection. Spatially varying pref acts as a fixed background potential.
U is a barotropic relative compression potential, not thermodynamic heat.

## Symmetric discrete gradient

Given endpoints 0,1, set pfbar=(pf0+pf1)/2 and vbar=(v0+v1)/2. Define

    Jbar = pfbar .* vbar
    ell_i = [p1 log(p1/pref)-p1 - p0 log(p0/pref)+p0] / (p1-p0)
    kappa = S' [h .* ((v0.^2+v1.^2) ds)] ./ (8 A)
    mubar = c2 ell + kappa
    p1-p0 = -dt D (Jbar ds) ./ A
    v1-v0 = dt G mubar.

ell uses its continuous log(p0/pref) limit and a cancellation-safe series.
The exact algebraic chain rule is

    H1-H0 = (A .* mubar)' (p1-p0)
            + sum h ds Jbar .* (v1-v0) = 0.

Solve the coupled nonlinear equations, not a posteriori energy projection.
The symmetric endpoint formula is formally second order for this smooth
finite-dimensional ODE. Damped Newton uses normalized pressure increments
and Bernoulli potential (2*n unknowns), an analytic sparse Jacobian, positive
trial pressures and residual decrease. Reject failure atomically, without
hidden timesteps, pressure clipping or global mass/energy repair. Endpoints
and Newton trial states must be positive; this is not C5's exact-trajectory
interval positivity certificate.

The same integrated J=dt Jbar drives frozen shared_transfers and water FCT.
Commit p,v,W,time only after all solves and budgets pass. Checkpoint identity
includes graph, pref, ds, c2 and scheme version. No stale matrix factor is
reused after coefficients change. Energy guards use a stated roundoff floor
on the pressure scale; independent native acceptance remains relative.

## Predeclared acceptance

1. Retained failing tests for missing pressure-dependent energy, discrete
   gradient and nontrivial coupled step. Compare scalar secants/derivatives
   and energy chain rule with independent high-precision arithmetic, including
   equal endpoints, near rest, unequal sigma and both signs of pressure change.
2. Compare analytic Jacobian with independent finite differences. Verify a
   nonzero kinetic derivative, full state rollback on failed nonlinear/water
   steps, bad inputs, checkpoint identity and rebuilt literal-bit restart.
3. Independent dense/full nonlinear RK4 reference: dt .1/.05/.025/.0125 over
   duration .4, reference .0005/.00025; reference discrepancy <1e-10 and
   consecutive p/v error ratios >3.5. This is not an order claim for bounded
   water FCT near sharp fronts.
4. Frozen 24/48/96-ring graphs: manufactured smooth pressure and tangent
   fields. Pressure-flux weak-divergence and Bernoulli-potential errors decrease;
   finest global relative errors <0.35. Report polar errors and scope of the
   graph metric approximation. Do not equate energy conservation with continuum
   accuracy.
5. Native six hours on the unchanged 3168-cell graph: 1800/900/450/225 seconds,
   all real humidity, plus constant/sharp humidity at 1800. Record explicit
   12/24/48/96 steps and all nonlinear iteration counts. Require no rejected
   steps, local air/water/dry residual <5e-12, global air/dry drift <1e-8 kg/m2,
   water drift <1e-9 mm, original global humidity bounds within 1e-11, positive
   endpoint pressure, accumulated relative H drift <1e-9. Adjacent and finest
   reference p/v/q differences must decrease; report observed ratios. Rebuild
   three coarse checkpoints and verify four more steps with literal bit equality.
6. Bind source closures, inputs, outputs, failed/superseded attempts and all
   selected runs to exact bytes. Run project tests/typecheck/build and frozen
   ancestry checks, obtain independent review, and seal once before Git merge.

## Method references

The discrete chain-rule construction is informed by the discrete-gradient
framework, not claimed to be a new numerical principle. The graph-specific
formulas and their validation are derived here.

- Gonzalez (1996), Time Integration and Discrete Hamiltonian Systems,
  listed by the author: https://web.ma.utexas.edu/users/og/numerics.html
- Grimm, Kliesch and Quispel, Discrete gradients in short-range molecular
  dynamics simulations, definition of symmetric discrete gradients:
  https://publikationen.bibliothek.kit.edu/1000167557/152088221
