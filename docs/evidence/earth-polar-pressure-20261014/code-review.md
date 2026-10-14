# Independent C3 review

Reviewer: isolated `review_c3` agent, read-only, against main `7d37aa2`.

Initial review found no blocking construction/provenance defect, but identified
the material v3 wave regression: l2/l3 global errors about 2.5 times worse than
C2. The final v4 near-neighbour metric addresses this; the new explicit wave
gate checks both global and polar errors for every field.

Delta review confirmed the weighted ridge projection implements the intended
relative-weight metric, while retaining finite-ridge approximation and heuristic
edge elimination. Unequal layer momenta and the vertical-transfer slice match
the frozen core's three-horizontal-layer transfer ordering. Different layer
humidity boundaries exercise vertical transport. No blocking delta defect was
found.

The stale “zero-flow” label in the exported audit geometry was corrected before
the selected near-neighbour audit. Limits retained in the report: only three
wave fields at eight phases, increasing finite-solver coordinate residual at
high resolution, one resumed restart step, manufactured rather than imported
native winds, and unpinned Python/BLAS binaries.
