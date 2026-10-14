# Independent C4 review and disposition

Reviewer: fresh-context read-only `review_c4` agent, against base
`c483edab5127103866384ef385bd7ca5c7ef3d03` and the new C4 files.

The reviewer found no numerical blocker in the import, weak-divergence sign,
pressure/radius/layer scaling, Hodge metric, separately assembled acoustic
reference, or rotation solution. Analytic/rotation runs were complete at review;
native refinement and sealing were still in progress. The reviewer did not
rerun the expensive probes.

One P2 provenance issue: successful archived source snapshots were verified,
but the sealer did not initially require that the selected scripts and included
implementation still match the delivered files. The current numerical files
already matched their successful runs; no numerical result was invalidated.

Fixed with `source-bindings.mjs`: verify the selected Julia entry script,
recursive literal include closure and runner against each run's `sourceBefore`.
The final sealer invokes this for all selected numerical runs. A real-files
regression failed against the no-op validator (`c4-binding-red-v1`) and passed
five checks after the fix (`c4-binding-v1`, final `c4-binding-v2`): valid closure, modified include,
unbound include, modified entry script and modified runner. No numerical
implementation change was required by review.

One minor comment described the chord-based rigid-rotation formula as a line
integral. The intended formula has denominator d, while the exact great-circle
mean tangential velocity has denominator sin(d). Corrected the comment and
re-ran the import contract under a fresh run name; the numerical formula is
unchanged. The chord-based map is the protocol's explicit approximation.

During final packaging, the runner's literal include scanner treated a JavaScript
test fixture as a Julia include. Two attempts failed before launching Julia.
The fixture now constructs that string separately; the final five-check guard
suite passes again. The runner and all numerical sources are unchanged. Such
preparation-only failures are preserved, explicitly classified and ineligible
for selection. The successful import re-run is `c4-import-v4`.

Review limits: full physical climate coupling and exact native spectral
divergence were deliberately not assessed. The declared scope excludes them.
