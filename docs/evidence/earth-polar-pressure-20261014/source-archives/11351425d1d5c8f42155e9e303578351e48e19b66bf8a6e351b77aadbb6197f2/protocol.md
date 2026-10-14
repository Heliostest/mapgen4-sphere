# C3: polar pressure consistency experiment

The C2 implementation and its evidence are frozen at main `7d37aa2`.
This experiment changes no application default and makes no climate-accuracy claim.

## Question and gates

The C2 weighted-adjoint pressure operator conserves mass and acoustic energy,
but strong Cartesian l=1 and polar errors increase under reduced-grid refinement.
First compare it on reduced and full Gaussian rings, using the same Gaussian
areas, to separate the ring interpolation defect from latitude metrics.

Test a local symmetric positive graph using fitted tangent moments. Each
undirected edge has one nonnegative conductance, hence one shared transfer;
Gaussian areas and cell ordering remain authoritative. Fit coordinate moments
and tangent isotropy, then assess unfitted spherical harmonics (degrees 2–4),
polar maxima, connectivity, symmetry, nullspace, and refinement. Effective graph
conductances are not geographic face lengths and do not inherit native momentum.
Do not import native winds or couple a new graph before its spatial gate passes.

Acceptance requires decreasing area-weighted and polar errors for independent
smooth fields at 24, 48, and 96 rings, finite nonnegative weights, connectedness,
and roundoff constant/conservation/symmetry residuals. An optimizer exit code or
small training residual is not spatial acceptance. Record failed candidates too.

## Evidence

Use unique run names. The runner reserves each status, archives source bytes,
hashes declared inputs before/after, and records exact commands and configuration.
Raw numerical output goes under `build/earth-polar-pressure`; checked-in reports
must distinguish diagnostics, candidates, and accepted coupled results.

References informing the experiment (not evidence that this candidate works):
Trask, Bochev and Perego, *A conservative, consistent, and scalable meshfree mimetic
method*, https://arxiv.org/abs/1903.04621; Seibold, *Minimal positive stencils in
meshfree finite difference methods for the Poisson equation*,
https://arxiv.org/abs/0802.2674. Neither is implemented verbatim here.
