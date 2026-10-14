# C4 native wind import: design and verification protocol

Base: main/origin/main c483edab5127103866384ef385bd7ca5c7ef3d03.
All C1/C2/C3 evidence is frozen. This directory is the new experiment namespace.
The user's instruction authorizes implementation and verification without a
new design approval. No default climate model change is in scope.

## Import contract

For unit Cartesian cell position x_i, east/north native velocity U_i in m/s,
and authoritative initial surface pressure p_i in Pa, set F_i=p_i U_i per
sigma layer. For an oriented C3 edge i -> j with angular great-circle distance
d_e and fitted conductance w_e, import

    j_e = (F_i+F_j) dot (x_j-x_i) / (2 d_e)       [Pa m/s].

The actual integrated pressure flux is w_e d_e j_e/R. C3 effective length
w_e d_e is not a geographic face. There is one shared signed value per edge.
Surface pressure, Gaussian areas, cell ordering and ds stay unchanged; ds is
applied exactly once by the existing shared sigma transport. Reference pressure
pref governs the acoustic energy/force, not the initial physical p U flux.
Use c2 = 82671.64740772452 for the frozen native case.

This map preserves the discrete weak divergence defined by the Gaussian
nodal gradient Q: Q f at i is tangent projection of
sum_j w_ij (x_j-x_i)(f_j-f_i)/(2 A_i R).
For every scalar test f, sum_i A_i f_i div(F)_i =
-sum_i A_i F_i dot Q f_i. This is an explicit approximation to continuum
divergence; it does not assert equality to a separate native spectral divergence.
It uses every native u/v sample and does not truncate spectral modes.

With H_e=w_e d_e^2/prefFace_e, split the imported edge field into
j_div=prefFace * gradient(phi), K phi=divergence*j, and
j_sol=j-j_div. A pinned potential fixes only a gauge. No RHS mean subtraction
or mass correction is allowed. The final imported j retains BOTH parts exactly;
the split is diagnostic, not a projection that discards vortical flow.
H-orthogonality and solenoidal divergence must be checked. Graph cycle content
is not identical to continuum vorticity; gradient leakage is measured.

## Implementation and gates

1. Write/run failing analytic tests, implement graph-wind.jl and strict graph
   provenance/geometry validation. Check signs, units, pressure vs pref,
   layers, orientation reversal, invalid shapes/nonfinite input and weak duality.
2. At frozen 24/48/96-ring C3 graphs, compare analytic inclined rotations,
   degree-1/2/3 gradients and mixed fields with continuum divergence (constant
   and variable p). Require decreasing global and polar divergence error,
   rotation absolute error <1e-6 on unit scale, and decreasing gradient cycle
   leakage. Require split residual/orthogonality <1e-10 relative scale.
3. Import frozen native data, preserving all p/q/u/v/pref/ds inputs. Run fixed
   explicit step! at 1800/900/450 seconds over 1 day and a 225-second reference.
   Test real, constant and sharp humidity; no adaptive or hidden substeps.
   Require decreasing real-water time error, local shared air/water/dry budget
   residual <5e-12; air drift <1e-8 kg/m2, water drift <1e-9 mm;
   q in original global range to 1e-11, constant q error <1e-12,
   acoustic time error <1e-6 Pa and <1e-7 m/s, energy error <1e-9.
   Rebuild the core and resume multiple steps bitwise; test rejected step
   atomicity. Do not claim advance! is an interval-wide transaction.
4. Rotate smooth tracers using imported axial/tilted rigid velocities on
   24/48/96-ring graphs; compare analytic full-orbit solutions and intermediate
   phases, weighted global and polar errors, plus budgets and q range. Use
   explicit resolution-scaled steps and require errors to decrease.
5. Preserve all attempted runs with unique names, source snapshots, input and
   output SHA256 bindings. Verify frozen manifests and the selected NPZ ->
   independent C3 audit -> graph -> C4 run chain. Review independently, run
   npm test/typecheck/build, document actual results and limits, seal evidence.

The 1-day native window is a subsystem temporal/conservation check, not a new
long-term climate validation. Complete momentum, Coriolis, thermodynamics and
physical source coupling remain outside this work.
