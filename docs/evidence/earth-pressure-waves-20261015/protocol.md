# C11 pressure-wave validation protocol

Base 9fcc89a92c8c8fe3aa41e019827af3a219244ecf. Continue the authorized
pressure-wave investigation and commit/merge/push workflow. This adds a
bounded validation experiment to existing C10, not a new physical model.
Preserve every sealed C1-C10 byte and the application default. Use existing
Julia/Node/Python runtimes; no new dependency or fitted metric parameter.

## Question and alternatives

Do C10's fixed positive conductances preserve accurate pressure-wave phase
and amplitude when integrated in time? A scalar Rayleigh quotient alone
does not answer this. Direct full nonlinear runs on every fine grid would
confound amplitude and time errors and cost much more. Use a linearized
diagnostic plus actual frozen C9 nonlinear small-amplitude runs, with a
separate dense modal reference on the coarse grid. This is pressure-wave
validation, not internal atmospheric gravity-wave or climate validation.

## Equations and diagnostic

Linearize at p=pref, v=0, omega=0, with identical layer velocities. For
r=(p-pref)/pref, M=diag(area*pref), P=diag(prefFace), H=diag(h*prefFace),
G=base.gradient and D=base.divergence:

    M r_t = -D P v,  v_t = c2 G r,  K = D P G.

The positive K gives r_tt=-c2 M^-1 K r. Energy is
E=(c2 r'Mr+v'Hv)/2. Implement implicit midpoint by eliminating velocity:

    (M+dt^2 c2 K/4) r1=(M-dt^2 c2 K/4)r0-dt D P v0,
    v1=v0+dt c2 G(r0+r1)/2.

This is a diagnostic linearization, not a replacement integrator. Reference
coarse evolution comes from an independent symmetric eigendecomposition of
c2 M^-1/2 K M^-1/2. Its nonconstant modes must be positive and the sole null
mode must be constant pressure ratio. Compare pressure AND edge velocity.
Manufactured exact one-mode frequency is sqrt(l(l+1)) at radius=c=1; midpoint
frequency is 2 atan(omega*dt/2)/dt. No projections/corrections during stepping.

## Frozen matrix and gates

1. First run a no-op diagnostic against a hand-solvable oscillator: it must
   fail the advance check. Final tests cover analytic midpoint phase/energy,
   a stationary constant, invalid timestep/state shapes and NaN, reversibility,
   and a small-amplitude frozen pressure_step comparison.
2. On both C9(original) and C10 metrics at 24/48/96 rings, constant pref=1,
   c2=1 and radius=1, integrate two periods of degrees1/3/5, two original
   oblique axes, and standing zonal/traveling sectoral harmonics. Use exactly
   64/128/256 steps per analytic period. All pressure and velocity edge
   samples are identical across metrics. Standing r0=P_l(axis dot x), v0=0.
   Traveling r0=Re(z^l), v0=-G Im(z^l)/omega, where z uses an orthonormal
   equatorial basis for the given axis. The continuum pressure target is
   f cos(omega*t)+g sin(omega*t). This velocity uses the common two-point
   gradient of the analytic potential; it is not an exact pointwise vector
   sample. Report this spatial initialization error, rather than suppress it.
3. Record every sampled phase (unwrapped), amplitude, pressure RMS error,
   off-mode leakage, energy and mean drift. Compute phase using pressure
   and its time derivative for standing modes, and pressure's two harmonic
   coefficients for traveling modes. Use original area weights for every
   metric comparison. Save endpoint fields. Require energy drift<1e-9 and
   mean drift<1e-10; at the finest time setting the worst maximum-in-time
   pressure error at each grid must be <=1.10 times C9's worst +1e-7.
   This aggregate gate permits individual regressions: enumerate all of them.
   Do not require monotone continuum error under dt refinement: spatial and
   time phase errors may cancel. Report measured phase without asserting
   universal propagation improvement. Full-wave matrices are acceptance,
   not exploratory parameter tuning.
4. Coarse-grid dense modal reference, both metrics and constant/varying pref
   (1+.15x), degree3 traveling, first axis, same three timesteps: reference
   endpoint errors in r and v must decrease, last refinement ratio in [3.7,4.3].
   Phase/amplitude continuum claims use constant pref only. Varying-pref
   reference is a discrete model, not an analytic continuum solution.
5. Actual frozen C9 VectorCore, omega=0, ds=[.2,.3,.5], both 24-ring metrics
   and both pref choices: one period, 64 steps, amplitudes 1e-3 and 1e-4,
   degree3 traveling first axis. Also C10 48-ring constant-pref, 128 steps,
   both amplitudes. Compare normalized perturbations with the diagnostic
   at identical dt: both r/v discrepancies must decrease by >5x when
   amplitude drops 10x. Every full step retains the original local budgets,
   pressure solver and energy allowances, positive p, constant humidity
   within 1e-11, zero rejected/hidden steps. Store every solver ledger.
6. Preserve inherited bindings/default, run project278/typecheck/build,
   a fresh independent review, one-time seal with all attempts and exact
   source/input/output bindings, then authorized commit/merge/push and
   Git-byte verification. A failed gate remains a finding, not a reason to
   relax the protocol. No runtime/core changes unless a reproduced defect
   warrants a separately documented fix.

Standing waves measure normal-mode phase; sectoral traveling waves add
azimuthal pattern propagation. Neither proves arbitrary wavepacket group
velocity or rotating/stratified/thermodynamic wave accuracy. Report phase
in radians and frequency bias per analytic period, avoiding an unjustified
single speed inferred from a leaking multimode signal.
