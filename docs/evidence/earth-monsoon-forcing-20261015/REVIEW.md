# Independent review of the diagnostic harness

Read-only review against repository baseline
`6bbbad414f5602cf532e41adbcc6a46a5286b9b3`, 2026-10-15.

The reviewer checked source hashes/units/masks/valid-year counts, spherical remapping,
pressure quadrature, calendar/nudging tests, actual runtime call order and enthalpy
definition. The review found the below-ground pressure-sample defect described in
REPRODUCE.md. The corrected rule passed the regression test, a 12,001-pressure sweep,
and exact reproduction of the final derived forcing. All eight input files have 30
valid years. The Gaussian temperature global integral is preserved to about
1.7 × 10⁻¹³ K in the review check.

The reviewer also identified that the raw `seaC` averages include absent-ocean
placeholders on GPCC land support. These values are retained only as raw bookkeeping,
explicitly excluded from reported JJA metrics and all plots, and never interpreted
as regional ocean/SST validation.

A later review checked the liquid-ocean target floor against the production phase
constant: 271.35 K. Nudging reports actual imposed heat and changes no budget origin.
The target floor removes the identified ice-skin forcing artifact; it is an approximate
observation operator and does not validate ocean or ice physics.

Reviewed final executable SHA-256:
`90f0fecc338d95f61f6103b0df57d9db79d243d2a9fb952df6c39c5fb106ebe6`.
Reviewed decompressed forcing SHA-256:
`77ad2b0d7b4a577341aff33fea2d5addbd18c228aa3837d9cb1cb6f8218d9438`.

No remaining blocker was found for the scoped first-year sensitivity experiment.
The review explicitly limits causal interpretation: wind also changes evaporation
and ocean heat transport, while thermal nudging changes saturation and phase.
Neither intervention uniquely identifies a missing monsoon mechanism or validates
the precipitation closure. Full-run budget/provenance verification is performed
separately by `verify.py` after integration; this note alone is not evidence of it.

After all six integrations completed, the reviewer recomputed the report's regional
MAEs, peak months, JJA vapor/evaporation values, forcing magnitudes, clipping and
four residual maxima from raw outputs. The six runs share bundle/forcing/formal/
initial-state hashes, and grid rainfall, region rainfall and components reconcile.
The reported six-region MAE reduction is 24.372834%. Plots were inspected.
Two presentation corrections were applied: native Yangtze June northward wind is
−0.14 m/s when rounded, and full monthly/component links now point to raw JSON
rather than the aggregate metrics table. No remaining causal-scope blocker was found.
