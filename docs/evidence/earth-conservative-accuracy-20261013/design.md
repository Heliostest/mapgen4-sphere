# Accuracy candidates and scope

C1's core exactly implements BE, but native pressure RMS time error after three
days is 163.842/160.067/151.205 Pa at1800/900/450 s. The original adjacent-step
difference test fails and remains frozen. Native-shaped tilted tracer rotation
has relative error0.2585. Strong polar spatial consistency also remains open.

Time options: smaller BE steps retain first-order damping and are expensive;
implicit midpoint removes damping but still has large fast-mode phase error;
exact fixed-operator evolution also yields integrated mass flux and provides a
useful coupling building block. C2 first implements the third for the declared
linear component, with runtime/scalability and nonlinear scope explicitly limited.

Let M=diag(A*pref), K=D' diag(H*pref_face) D/R², S=c² M^-1/2 K M^-1/2.
For y=M^1/2(r-rbar), v=−M^-1/2 C*jbar and S=V diag(omega²) V', propagate each
mode a,b using a'=cos(omega dt)a+sin(omega dt)/omega*b. Persistent j changes by
c²*pref_face*gradient*integral(r). The shared integrated mass flux must use
integral(j), not dt*j_end:

    integral(y)=sin(omega dt)/omega*a + (1-cos(omega dt))/omega²*b
    double_integral(y)=(1-cos(omega dt))/omega²*a
                       +(omega dt-sin(omega dt))/omega³*b
    integral(j)=dt*j_old+c²*pref_face*gradient*double_integral(r)

Use analytic zero-frequency limits and cancellation-safe sinc/cosc evaluations.
Do not assume endpoint positive pressure implies positive intermediate pressure;
bound or check the interval. Rejections must leave the authoritative state intact.
There is no global mass correction or overwritten zero-mode inventory.

Water: C1 supplies an implicit upwind low-order solution and its final donor
transfers. A centered Crank–Nicolson high-order candidate uses the same integrated
air transfers and average old/new endpoint concentrations. Difference between
low and high water transfers forms conservative antidiffusive edge corrections.
For each cell, aggregate requested positive/negative corrections and compare
with remaining lower/upper water capacities. Each edge gets the minimum of its
two endpoint limit factors. Corrected water is assembled from shared transfers.
The limiter is applied to fluxes, never by clipping individual output cells.

This is an explicitly tested experiment inspired by conservative flux-correction
methods; it is not a claim to reproduce a complete published scheme. Primary
reference: Zalesak1979, Fully multidimensional flux-corrected transport algorithms
for fluids, https://www.sciencedirect.com/science/article/pii/0021999179900512 .
Accuracy and monotonicity must be evaluated separately, especially on the
variational expanded-neighbor transport graph and unequal sigma masses.

Independent work domains: root owns modal pressure, common integration and native
experiments; transport agent owns FCT candidate/tests; mathematical reviewer
checks derivation and bounds. C1 final-evidence reviewer only audits old-stage
completion. No agent edits another's active candidate files.
