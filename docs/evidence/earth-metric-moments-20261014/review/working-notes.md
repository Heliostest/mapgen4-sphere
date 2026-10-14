# C10 independent review working record

Status: preliminary implementation checks complete; final results/provenance/report gate pending.
Scope: read-only implementation and ancestor evidence; all reviewer writes are under build/c10-independent-review.
Base: a3a6934b6c9135ddfd912b86197f54026b615e05.

The relative-coordinate variable is z=(w-w0)/w0. For the free set, S=C_free diag(w0_free) and b=target-C_fixed lower-C_free w0_free. The solve (S S^T + D) mu=b followed by w_free=w0_free(1+S^T mu) gives low residual=-ridge*mu and cubic residual=-(penalty+ridge)*mu. Therefore the free-set primal objective is the declared relative-weight norm plus cubic penalty, up to the explicitly declared ridge. Fixed lower-bound contributions are present in b. One-way pinning lacks an active-set release/KKT sign test and correctly makes no global optimum claim.

Independent checks (independent-checks-v1.py/json/log):
- Independent moment accumulation uses a tangent projection and stable radial 2*sin(distance/2)^2/area; it reproduces objective 9936.184097284813, cubic ratio 0.5937755872781961, and 112 pinned edges at 24 rings.
- Dense primal KKT, independent of the dual derivation, agrees at relative errors 5.6765e-13 unpinned and 2.0126e-13 on a pinned free set.
- Independent local O(2) changes (1008 random basis rotations plus reflections) preserve the graph weights within relative 1.2217e-10.
- Replacing one conductance by 1e-290 retains a finite positive result and finite objective. Unrepresentable floor, moment overflow, malformed dimensions and indices reject without mutating inputs.
- All 5 grouped checks passed; exact sources/inputs unchanged. The overflow case intentionally emits NumPy runtime warnings before its ValueError; the full log is retained.

Independent new-metric algebra (independent-invariants-v1.jl/json/log and run-invariants-v1.py):
- All 7 assertions passed on the 48-ring metric with independently chosen pressure and shear fields.
- Relative neutral power contraction 5.0283e-20; rotation 3.0728e-18; curl 4.3842e-19; layer/vertical exchange 3.0269e-18; gradient/divergence adjoint residual 9.9563e-17.
- Rebuilt checkpoint is bitwise equal and old-metric model rejects it.
- Wrapper binds exact sources and inputs before/after and hashes every output.

Finding reported immediately: initial spatial.jl lacked the separate pressure error required by frozen criterion 2. Implementer added pressure for both models to every spatial row before first spatial run. Addition inspected; final output must still be audited.

Code review conclusions so far: original coordinates/areas/edge ordering are retained; original h and same edge samples define C9/C10 force comparisons; held-out degrees/axis are reported; C8/C9 core source includes remain exact; new conductances enter geometry, weighted divergence/energy/curl/vertical terms consistently; checkpoint identity transitively includes the full metric. Native stepping does not catch or hide rejected timesteps, and restart tests rebuild the model and compare four subsequent steps.

No other actionable implementation issue found. Final completion is withheld until the frozen sources, final matrix, report, archival mapping, and one-time seal tooling have been audited.
