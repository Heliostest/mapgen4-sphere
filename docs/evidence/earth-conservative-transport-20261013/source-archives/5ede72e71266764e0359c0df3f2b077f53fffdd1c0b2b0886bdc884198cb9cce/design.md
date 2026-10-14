# Shared pressure–water transport design

## Intent and boundary

The preceding native experiment gained 0.0323236 mm of water in one source-free hour even after removing illegal auxiliary modes. An independent mass/water shadow conserved both, but failed when divided by native pressure, produced negative sharp tracers under centered transport/RAW, and lost water under spectral roundtrip. The user asked to continue on the pressure/mass coupling, so this stage implements and tests that shared subsystem in a new evidence package.

Three alternatives were considered: keep native pressure and rescale water (reject: incompatible constant-tracer and mass budgets); globally correct native pressure/water (reject: conceals local continuity); evolve one face-based air mass and use the identical accepted flux for tracer transport (selected). Pressure force and mass continuity must share the same implicit update. Preserving the previous evidence and defaults is part of the contract.

## Geometry and state

Use a finite-volume partition of the existing reduced Gaussian rings. Cell area A is `4*pi*native_weight` in steradians; polar band boundaries follow cumulative Gaussian weights. East/west faces and longitude-overlap faces between neighboring rings are unique oriented faces. Face length L and center normal separation d are angular radians; physical scaling uses planet radius R.

State holds p_i [Pa], layer water W_ik = A_i*ds_k*p_i*q_ik [Pa sr], persistent edge pressure mass flux j_ek [Pa m/s], and elapsed seconds. Layer air mass is m_ik=A_i*ds_k*p_i. Global inventory is sum(m)/(4*pi*g) and sum(W)/(4*pi*g). Grid p/W are authoritative; q=W/m is a diagnostic consumed by later thermodynamics.

## Pressure and momentum pair

For fixed positive reference pref, let r=p/pref. Each edge points i to j. With G_e=pref_face*L/(R^2*d), solve

    [diag(A*pref) + dt^2*c^2*B*diag(G)*B'] r_new
        = A*p_old - dt*B*((L/R)*sum_k(ds_k*j_old_ek))
    j_new_ek = j_old_ek + dt*c^2*pref_face/(R*d)*(r_new_i-r_new_j)

Here B gives outgoing flux at i and incoming flux at j. The SAME accepted integrated layer face mass is `F_ek=dt*(L/R)*ds_k*j_new_ek`. Pressure impulse is identical at all levels: this is the barotropic acoustic/body-force subsystem, not a full hydrostatic primitive equation solver. Persistent j is essential; dropping its old value turns the solve into elliptic diffusion and fails the wave test.

Constant pref gives linear acoustic equations. Variable `pref=p0*exp(-Phi/c^2)` gives the continuous pressure/body-force operator `pref*grad(p/pref)=grad(p)+p*grad(Phi)/c^2` and exactly rests at p=alpha*pref. c^2=R_dry*288 K for the native-scale probe, using the existing atmosphere reference; benchmark wave cases state their own values.

The matrix in r is symmetric positive definite and an M-matrix. A positive predictor RHS is a sufficient positivity condition. Reject a nonpositive predictor without mutating state; subdivide the requested interval, preserving total elapsed time and recording subdivisions. Do not floor p or correct the global zero mode. The first implementation deliberately uses backward Euler, with its expected first-order dissipation documented.

## Sigma and water continuity

Accumulate each layer's signed incoming horizontal mass H_ik from shared F. For downward positive integrated vertical mass V, set top V=0 and recurse `V_bottom=V_top+H_ik-A_i*ds_k*(p_new-p_old)`. Measure the bottom closure and linear-system residual; use a closed bottom and report floating-point closure separately.

Flatten horizontal and vertical accepted faces into the same layer graph. Solve

    (m_new + sum_out F)*q_new - sum_in(F*q_new_neighbor) = W_old.

Off-diagonals are nonpositive and each row sum is m_old (up to measured continuity solve error). Thus the update is constant-tracer consistent and bound-preserving; face terms cancel in the global water sum. No RAW filter, native q clipping, native q hyperdiffusion or projected q may become the authoritative W. This is a different time/transport operator, with its own explicit restart schema.

## Scope gates before future coupling

## Spatial review amendment: variational candidate

The original reduced-ring two-point pressure gradient failed nonzonal spherical
harmonics (x/y relative Laplacian error 0.313). Its implementation and RED evidence
remain as a baseline. Simply reconstructing values at a common longitude made
the operator nonsymmetric with complex acoustic modes; simple symmetrization
also failed local refinement. Neither is promoted.

The candidate uses the common-longitude angular gradient D and quadrature weights
H=L*d, with physical gradient D/R and mass divergence D' H/R. Thus the pressure
stiffness is D' diag(H*pref_face) D/R^2, symmetric positive semidefinite. Each
gradient row's positive/negative coefficients a,b are decomposed into shared
mass transfers H/R * a*b/s, where s=sum(a)=sum(b). Their fluxes are used in the
same implicit water solve; persistent j remains a physical quadrature degree
of freedom. These expanded neighbor transfers are not all geographic faces.

This preserves the energy identity and the tracer M-matrix proof. Pressure is
not generally an M-matrix for arbitrary reconstructed grids; accepted steps
require both a positive predictor and a positive solved pressure. A three-cell
counterexample tests rejection when SPD pressure is negative. Positive pressure
for every input is not promised, and shrinking steps may fail at a finite
minimum dt. For the native tested terrain/reference only, offdiagonal signs are
also measured rather than presumed.

Independent l=1, tilted l=1 and l=2 full acoustic solutions converge under
12/24/48/96/192-ring refinement, including finer time steps. Strong pointwise
Laplacian error near the poles remains RED and is reported separately. This is
a limited weak wave-convergence result, not full atmospheric spatial acceptance.

## Remaining coupling gates

This stage must pass analytic two-cell and periodic-wave fixtures, sharp tracer bounds, dry/wet inventories, sigma continuity, rotation convergence and own-state restart, then a native-grid source-free short integration. The later full-model bridge still needs nonlinear momentum/Coriolis/advection, baroclinic temperature/SI, source mass conventions, physical flux timing, land/ocean exchanges, diffusion and lossless history. Passing this subsystem does not clear those future gates.

## Primary references and distinction

- Kühnlein et al., [FVM 1.0](https://gmd.copernicus.org/articles/12/651/2019/): a primary example of conservative transport and semi-implicit dynamics sharing a finite-volume formulation. This design is not an implementation of IFS-FVM or MPDATA.
- Bradley et al., [Islet](https://gmd.copernicus.org/articles/15/6285/2022/): distinguishes conservation, consistency and shape preservation; separate gates are retained here. This design does not implement Islet.

The above equations are this experiment's explicitly limited subsystem, not an attribution to either paper. An independent reviewer checks the algebra before native acceptance runs.
